import * as THREE from 'three';
import { tagGizmoDepthRole } from './gizmo_depth_style.js';

/**
 * Shared visual constants for Move, Rotate, and Scale gizmos. Keeps stem
 * thickness, tip sizes, and material behavior consistent.
 */
export const GizmoVisualStyle = {
  /** Cylinder radius used by move stems, scale stems, and rotate ring tubes. */
  stemRadius: 0.045,
  /**
   * Invisible pick cylinder radius for stems/rings so clicks need not be pixel
   * perfect while visuals stay thin.
   */
  stemPickRadius: 0.14,
  /** Length of the move arrow stem cylinder. */
  moveStemLength: 1.65,
  /** Cone radius of the move arrow head. */
  moveHeadRadius: 0.11,
  /** Cone height of the move arrow head. */
  moveHeadLength: 0.38,
  /** Invisible pick cone radius for move arrow heads. */
  moveHeadPickRadius: 0.18,
  /** Length of the scale stem cylinder. */
  scaleStemLength: 1.65,
  /** Edge length of the scale tip cube. */
  scaleTipSize: 0.18,
  /** Invisible pick cube edge for scale tips. */
  scaleTipPickSize: 0.32,
  /** Major radius of rotate rings. */
  ringRadius: 1.45,
  /** Invisible pick tube radius for rotate rings. */
  ringPickTubeRadius: 0.13,
  /**
   * Camera-facing free-rotate disc radius (matches free-scale ring size; sits
   * inside the axis rings so ring picks stay reachable).
   */
  rotateFreeBillboardRadius: 1.05,
  /** Opacity of the free-rotate billboard disc. */
  rotateFreeBillboardOpacity: 0.22,
  /**
   * Render order for free-rotate billboard (in front of scene geometry, behind
   * axis ring front meshes at {@link frontRenderOrder}).
   */
  rotateFreeBillboardRenderOrder: 998.5,
  /** Edge length of the free-move center cube on the translate gizmo. */
  centerHandleSize: 0.28,
  /**
   * Camera-facing free-scale wire ring radius (local units before gizmo camera
   * scale). Sits between the center cube and the scale tip cubes.
   */
  scaleFreeRingRadius: 1.05,
  /** Tube radius of the free-scale wire ring visual. */
  scaleFreeRingTubeRadius: 0.03,
  /** Opacity of gizmo parts in front of scene geometry. */
  frontOpacity: 0.95,
  /** Opacity of gizmo parts occluded by scene geometry. */
  occludedOpacity: 0.2,
  /** Render order for occluded ghost meshes (drawn first). */
  occludedRenderOrder: 998,
  /** Render order for front gizmo meshes. */
  frontRenderOrder: 999,
} as const;

/** UserData flag on invisible pick-volume meshes. */
export const GIZMO_PICK_VOLUME_USERDATA = 'isGizmoPickVolume';

/**
 * UserData flag on the scale free-scale disc pick volume. Lower pick priority
 * than axis handles so thick arrow picks win when both are hit.
 */
export const GIZMO_FREE_SCALE_DISC_PICK_USERDATA = 'isGizmoFreeScaleDiscPick';

/**
 * UserData flag on the free-rotate billboard disc. Same low priority as the
 * free-scale disc: axis rings win when both are hit.
 */
export const GIZMO_FREE_ROTATE_DISC_PICK_USERDATA = 'isGizmoFreeRotateDiscPick';

/**
 * UserData flag on camera-facing free-scale ring/disc roots. Updated each frame
 * and before picking so the ring stays billboarded to the active camera.
 */
export const GIZMO_SCALE_FREE_BILLBOARD_USERDATA = 'isGizmoScaleFreeBillboard';

/**
 * UserData key for meshes that must keep a fixed opacity through hover/active
 * tinting (e.g. free-rotate billboard disc).
 */
export const GIZMO_PRESERVE_OPACITY_USERDATA = 'gizmoPreserveOpacity';

/**
 * Creates the solid front-facing gizmo material with depth testing. Parts
 * behind scene objects fail the depth test and are not drawn with this
 * material.
 *
 * @param color Hex color for the material.
 * @returns Configured MeshBasicMaterial.
 */
export function createGizmoFrontMaterial(color: number): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({
    color,
    depthTest: true,
    depthWrite: false,
    depthFunc: THREE.LessEqualDepth,
    transparent: true,
    opacity: GizmoVisualStyle.frontOpacity,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  tagGizmoDepthRole(material, 'front');
  return material;
}

/**
 * Creates a ghost material that only draws where the gizmo is behind scene
 * geometry. Produces the semi-transparent "see through object" look for
 * occluded parts.
 *
 * @param color Hex color for the material.
 * @returns Configured MeshBasicMaterial.
 */
export function createGizmoOccludedMaterial(color: number): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({
    color,
    depthTest: true,
    depthWrite: false,
    depthFunc: THREE.GreaterDepth,
    transparent: true,
    opacity: GizmoVisualStyle.occludedOpacity,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  tagGizmoDepthRole(material, 'occluded');
  return material;
}

/**
 * Builds a semi-transparent ghost mesh that shares geometry with a front mesh.
 *
 * @param geometry Shared geometry instance.
 * @param color Hex color matching the front mesh.
 * @param handleId Optional handle id copied onto the ghost for picking.
 * @returns The occluded ghost mesh.
 */
export function createGizmoOccludedMesh(geometry: THREE.BufferGeometry, color: number, handleId?: number): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, createGizmoOccludedMaterial(color));
  mesh.renderOrder = GizmoVisualStyle.occludedRenderOrder;
  mesh.userData['isGizmoOccludedGhost'] = true;
  if (handleId !== undefined) {
    mesh.userData['handleId'] = handleId;
  }
  return mesh;
}

/**
 * Applies the standard front render order to a gizmo mesh.
 *
 * @param mesh The front mesh to configure.
 */
export function applyGizmoFrontRenderOrder(mesh: THREE.Mesh): void {
  mesh.renderOrder = GizmoVisualStyle.frontRenderOrder;
}

/**
 * Creates an invisible pick material (raycastable, not drawn).
 *
 * @returns Configured MeshBasicMaterial.
 */
export function createGizmoPickMaterial(): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    depthTest: false,
    depthWrite: false,
    colorWrite: false,
    transparent: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  material.visible = false;
  return material;
}

/**
 * Builds an invisible pick mesh tagged for handle id matching.
 *
 * @param geometry Pick volume geometry (not shared with visual meshes).
 * @param handleId Handle id for raycast matching.
 * @returns Pick mesh ready to parent under a handle group.
 */
export function createGizmoPickMesh(geometry: THREE.BufferGeometry, handleId: number): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, createGizmoPickMaterial());
  mesh.userData['handleId'] = handleId;
  mesh.userData[GIZMO_PICK_VOLUME_USERDATA] = true;
  return mesh;
}

/**
 * Creates a front-facing vertex-colored line material with depth testing.
 * Segments behind scene geometry fail the depth test and are not drawn.
 *
 * @returns Configured line material for unoccluded gizmo lines.
 */
export function createGizmoFrontLineMaterial(): THREE.LineBasicMaterial {
  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    depthTest: true,
    depthWrite: false,
    depthFunc: THREE.LessEqualDepth,
    transparent: true,
    opacity: GizmoVisualStyle.frontOpacity,
    toneMapped: false,
    linewidth: 1,
  });
  tagGizmoDepthRole(material, 'front');
  return material;
}

/**
 * Creates a ghost line material that only draws behind scene geometry. Produces
 * the semi-transparent "see through object" look for occluded lines.
 *
 * @returns Configured line material for occluded gizmo lines.
 */
export function createGizmoOccludedLineMaterial(): THREE.LineBasicMaterial {
  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    depthTest: true,
    depthWrite: false,
    depthFunc: THREE.GreaterDepth,
    transparent: true,
    opacity: GizmoVisualStyle.occludedOpacity,
    toneMapped: false,
    linewidth: 1,
  });
  tagGizmoDepthRole(material, 'occluded');
  return material;
}

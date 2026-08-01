import * as THREE from 'three';

/** UserData key marking front vs occluded gizmo materials. */
export const GIZMO_DEPTH_ROLE_USERDATA = 'gizmoDepthRole';

/** Depth role for dual-pass gizmo materials. */
export type GizmoDepthRole = 'front' | 'occluded' | 'always_on_top';

/**
 * Tags a material so per-pane depth policy can restore 3D occlusion correctly.
 *
 * @param material Material created for a gizmo front or occluded pass.
 * @param role Front (visible when unoccluded), occluded ghost, or always on top
 *   of scene geometry.
 */
export function tagGizmoDepthRole(material: THREE.Material, role: GizmoDepthRole): void {
  material.userData[GIZMO_DEPTH_ROLE_USERDATA] = role;
}

/**
 * Applies 2D always-on-top or 3D depth-aware drawing to one viewport gizmo
 * clone. Orthographic panes hide ghost passes and disable depth test so handles
 * never turn transparent behind brush geometry. Perspective restores dual-pass
 * occlusion. Materials are shared across clones; call once per multi-view pass
 * for the pane about to draw.
 *
 * @param root Viewport gizmo clone root.
 * @param alwaysOnTop True for orthographic panes; false for perspective.
 */
export function applyGizmoCloneDepthStyle(root: THREE.Object3D, alwaysOnTop: boolean): void {
  root.traverse((child) => {
    applyDrawableDepthStyle(child, alwaysOnTop);
  });
}

/**
 * Updates one drawable child (mesh or line) for the active depth policy.
 *
 * @param child Scene graph node under the gizmo clone.
 * @param alwaysOnTop Orthographic always-on-top policy.
 */
function applyDrawableDepthStyle(child: THREE.Object3D, alwaysOnTop: boolean): void {
  if (!isDrawableGizmoObject(child)) return;
  for (const material of collectObjectMaterials(child)) {
    applyTaggedMaterialDepthStyle(material, alwaysOnTop);
  }
  if (child.userData['isGizmoOccludedGhost'] === true) {
    child.visible = !alwaysOnTop;
  }
}

/**
 * Returns whether the object is a mesh or line that can participate in depth
 * style updates.
 *
 * @param child Scene object.
 * @returns True for mesh and line drawables.
 */
function isDrawableGizmoObject(child: THREE.Object3D): boolean {
  return child instanceof THREE.Mesh || child instanceof THREE.LineSegments || child instanceof THREE.Line;
}

/**
 * Lists materials on a drawable object.
 *
 * @param child Mesh or line object.
 * @returns Materials on the object, or an empty array when none are present.
 */
function collectObjectMaterials(child: THREE.Object3D): THREE.Material[] {
  const material = (child as THREE.Mesh).material;
  if (!material) return [];
  return Array.isArray(material) ? material : [material];
}

/**
 * Toggles depth testing on a tagged front/occluded gizmo material.
 *
 * @param material Material that may carry a depth role tag.
 * @param alwaysOnTop When true, disable depth test for solid 2D drawing.
 */
function applyTaggedMaterialDepthStyle(material: THREE.Material, alwaysOnTop: boolean): void {
  const role = material.userData[GIZMO_DEPTH_ROLE_USERDATA] as GizmoDepthRole | undefined;
  if (role === 'always_on_top') {
    material.depthTest = false;
    return;
  }
  if (role !== 'front' && role !== 'occluded') return;
  if (alwaysOnTop) {
    material.depthTest = false;
    return;
  }
  material.depthTest = true;
  material.depthFunc = role === 'occluded' ? THREE.GreaterDepth : THREE.LessEqualDepth;
}

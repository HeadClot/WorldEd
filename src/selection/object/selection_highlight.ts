import * as THREE from 'three';
import { Theme } from '../../theme.js';
import { hasEdgeBuildableGeometry } from '../../utils/mesh_edge_sync.js';
import { GizmoVisualStyle } from '../../transform/gizmo/gizmo_visual_style.js';

/**
 * UserData flag marking a LineSegments object as a selection outline. Used to
 * exclude outlines from viewport clones and raycast targets.
 */
export const SELECTION_HIGHLIGHT_USERDATA_KEY = 'isSelectionHighlight';

/** Front-pass opacity for unoccluded selection edges (matches soft CSG look). */
const SELECTION_EDGE_FRONT_OPACITY = 0.82;

/** Occluded-pass opacity so outlines remain readable without blowing out. */
const SELECTION_EDGE_OCCLUDED_OPACITY = 0.22;

/**
 * Visual selection edge outlines on selected objects. Uses dual-pass depth
 * treatment (front + faint occluded) like gizmos and solid brush edges so
 * object mode is not a flat full-bright always-on-top orange.
 */
export class SelectionHighlight {
  private scene: THREE.Scene;
  private highlightMap: Map<THREE.Mesh, THREE.Group>;
  private highlightColor: number;
  private frontMaterial: THREE.LineBasicMaterial;
  private occludedMaterial: THREE.LineBasicMaterial;

  /**
   * Creates a new selection highlight manager for the given scene.
   *
   * @param scene The Three.js scene this highlight instance belongs to.
   * @param theme The theme color constants used for highlight appearance.
   */
  constructor(scene: THREE.Scene, theme: typeof Theme) {
    this.scene = scene;
    this.highlightMap = new Map();
    this.highlightColor = theme.selectionColor;
    this.frontMaterial = this.createFrontMaterial(this.highlightColor);
    this.occludedMaterial = this.createOccludedMaterial(this.highlightColor);
  }

  /**
   * Applies an orange edge outline to a mesh if it belongs to this scene.
   *
   * @param mesh The mesh to highlight.
   */
  apply(mesh: THREE.Mesh): void {
    if (this.highlightMap.has(mesh)) return;
    if (!this.isDescendantOfScene(mesh)) return;
    if (!hasEdgeBuildableGeometry(mesh)) return;
    this.stripOrphanHighlights(mesh);
    const outlineGroup = this.createOutlineForMesh(mesh);
    mesh.add(outlineGroup);
    this.highlightMap.set(mesh, outlineGroup);
  }

  /**
   * Removes the orange edge outline from a mesh.
   *
   * @param mesh The mesh to un-highlight.
   */
  remove(mesh: THREE.Mesh): void {
    const outlineGroup = this.highlightMap.get(mesh);
    if (!outlineGroup) return;
    this.disposeOutlineGroup(mesh, outlineGroup);
    this.highlightMap.delete(mesh);
  }

  /** Removes all active highlights from the scene. */
  clearAll(): void {
    const meshes = Array.from(this.highlightMap.keys());
    meshes.forEach((mesh) => this.remove(mesh));
  }

  /**
   * Forces every active outline to match its parent mesh transform. Outlines
   * are mesh children so this is normally automatic; calling this after
   * external transform updates keeps multi-viewport clones consistent.
   */
  syncTransforms(): void {
    this.highlightMap.forEach((outlineGroup, mesh) => {
      if (outlineGroup.parent !== mesh) {
        mesh.add(outlineGroup);
      }
      outlineGroup.position.set(0, 0, 0);
      outlineGroup.rotation.set(0, 0, 0);
      outlineGroup.scale.set(1, 1, 1);
      outlineGroup.updateMatrix();
    });
  }

  /**
   * Rebuilds outline geometry for all highlighted meshes. Call after geometry
   * edits so edges match the current mesh.
   */
  rebuildGeometries(): void {
    const meshes = Array.from(this.highlightMap.keys());
    meshes.forEach((mesh) => {
      this.remove(mesh);
      this.apply(mesh);
    });
  }

  /**
   * Updates the highlight color for all active highlights.
   *
   * @param color The new hex color value for highlights.
   */
  updateColor(color: number): void {
    this.highlightColor = color;
    this.frontMaterial.color.setHex(color);
    this.occludedMaterial.color.setHex(color);
  }

  /** Disposes all highlight resources and clears state. */
  dispose(): void {
    this.clearAll();
    this.frontMaterial.dispose();
    this.occludedMaterial.dispose();
  }

  /**
   * Returns the set of meshes currently highlighted.
   *
   * @returns A set of highlighted mesh references.
   */
  getHighlightedMeshes(): Set<THREE.Mesh> {
    return new Set(this.highlightMap.keys());
  }

  /**
   * Creates dual-pass outline line segments for a mesh in local space.
   *
   * @param mesh The mesh whose edges will be outlined.
   * @returns Group containing front and occluded edge passes.
   */
  private createOutlineForMesh(mesh: THREE.Mesh): THREE.Group {
    const edges = new THREE.EdgesGeometry(mesh.geometry);
    const group = new THREE.Group();
    group.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] = true;
    group.matrixAutoUpdate = true;
    group.add(this.createEdgePass(edges, this.occludedMaterial, GizmoVisualStyle.occludedRenderOrder));
    group.add(this.createEdgePass(edges, this.frontMaterial, GizmoVisualStyle.frontRenderOrder));
    return group;
  }

  /**
   * Creates one edge line-pass mesh sharing geometry with its sibling pass.
   *
   * @param edges Shared edge geometry.
   * @param material Front or occluded line material.
   * @param renderOrder Draw order for the pass.
   * @returns Configured line segments.
   */
  private createEdgePass(
    edges: THREE.EdgesGeometry,
    material: THREE.LineBasicMaterial,
    renderOrder: number,
  ): THREE.LineSegments {
    const lineSegments = new THREE.LineSegments(edges, material);
    lineSegments.renderOrder = renderOrder;
    lineSegments.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] = true;
    lineSegments.matrixAutoUpdate = true;
    return lineSegments;
  }

  /**
   * Builds the soft front-pass selection edge material.
   *
   * @param color Selection hex color.
   * @returns Configured line material.
   */
  private createFrontMaterial(color: number): THREE.LineBasicMaterial {
    return new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: SELECTION_EDGE_FRONT_OPACITY,
      depthTest: true,
      depthWrite: false,
      depthFunc: THREE.LessEqualDepth,
      toneMapped: false,
    });
  }

  /**
   * Builds the faint occluded-pass selection edge material.
   *
   * @param color Selection hex color.
   * @returns Configured line material.
   */
  private createOccludedMaterial(color: number): THREE.LineBasicMaterial {
    return new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: SELECTION_EDGE_OCCLUDED_OPACITY,
      depthTest: true,
      depthWrite: false,
      depthFunc: THREE.GreaterDepth,
      toneMapped: false,
    });
  }

  /**
   * Removes any orphaned outline children left behind by cloning.
   *
   * @param mesh The mesh to clean.
   */
  private stripOrphanHighlights(mesh: THREE.Mesh): void {
    const orphans = mesh.children.filter(
      (child) =>
        (child instanceof THREE.LineSegments || child instanceof THREE.Group) &&
        child.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] === true,
    );
    orphans.forEach((child) => {
      if (child instanceof THREE.Group) {
        this.disposeOutlineGroup(mesh, child);
      } else {
        mesh.remove(child);
        (child as THREE.LineSegments).geometry.dispose();
      }
    });
  }

  /**
   * Detaches and disposes a dual-pass outline group.
   *
   * @param mesh The parent mesh.
   * @param outlineGroup The outline group to dispose.
   */
  private disposeOutlineGroup(mesh: THREE.Mesh, outlineGroup: THREE.Group): void {
    mesh.remove(outlineGroup);
    let sharedGeometry: THREE.BufferGeometry | null = null;
    for (const child of outlineGroup.children) {
      if (!(child instanceof THREE.LineSegments)) continue;
      if (!sharedGeometry) sharedGeometry = child.geometry;
    }
    outlineGroup.clear();
    if (sharedGeometry) sharedGeometry.dispose();
  }

  /**
   * Checks whether a mesh is part of this highlight's scene graph.
   *
   * @param mesh The mesh to test.
   * @returns True if the mesh is the scene or a descendant of it.
   */
  private isDescendantOfScene(mesh: THREE.Object3D): boolean {
    let current: THREE.Object3D | null = mesh;
    while (current) {
      if (current === this.scene) return true;
      current = current.parent;
    }
    return false;
  }
}

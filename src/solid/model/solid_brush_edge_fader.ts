import * as THREE from 'three';
import { SolidBrushVisual } from './solid_brush_visual.js';
import {
  BRUSH_EDGE_FADE_FAR,
  SOLID_BRUSH_EDGE_USERDATA_KEY,
  SolidBrushEdgeMaterials,
} from './solid_brush_edge_materials.js';
import { isEditModeWireframeSuppressed } from '@/utils/edit_mode_wireframe_suppress.js';

/**
 * Multiplier on fade-far for selected brushes so their edges stay available
 * longer.
 */
const SELECTED_FADE_RANGE_SCALE = 1.75;

/** Scratch state reused while updating brush edge visibility each frame. */
const cameraWorldPosition = new THREE.Vector3();
const brushWorldCenter = new THREE.Vector3();
const brushWorldScale = new THREE.Vector3();
const brushWorldPosition = new THREE.Vector3();
const brushWorldQuaternion = new THREE.Quaternion();

/** Last multi-view edge pass mode; skips redundant full-tree visibility walks. */
type EdgePassMode = 'ortho' | 'perspective' | null;

/**
 * Distance-culls solid brush edge helpers for the perspective multi-view pass.
 * Far brushes hide edge draws so large maps rely on compiled solid geometry.
 * Shared-scene 2D panes restore full edge visibility and disable depth testing
 * so wireframes stay complete over sky / solid depth.
 */
export class SolidBrushEdgeFader {
  private static lastEdgePassMode: EdgePassMode = null;

  /**
   * Distance-culls personal brush edge LineSegments under a scene root. Brushes
   * without personal edges are skipped; static solid-root batches fade through
   * the shared edge shader instead.
   *
   * @param root World group or scene containing solid brush helpers.
   * @param camera Perspective camera used for distance tests.
   */
  static updateForCamera(root: THREE.Object3D, camera: THREE.Camera): void {
    camera.getWorldPosition(cameraWorldPosition);
    this.lastEdgePassMode = 'perspective';
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (!SolidBrushVisual.isBrushObject(object)) return;
      if (!SolidBrushVisual.hasLocalEdges(object)) return;
      this.updateBrushEdgeVisibility(object);
    });
  }

  /**
   * Restores full personal brush edge visibility for orthographic multi-view
   * panes that share the world hierarchy with the perspective pass. Batched
   * static edges stay visible via shared materials.
   *
   * @param root World group or scene containing solid brush helpers.
   */
  static showAllEdges(root: THREE.Object3D): void {
    this.lastEdgePassMode = 'ortho';
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (!SolidBrushVisual.isBrushObject(object)) return;
      if (!SolidBrushVisual.hasLocalEdges(object)) return;
      this.applyEdgeVisibility(object, true);
    });
  }

  /**
   * Prepares shared brush edges and selected hull fills for an orthographic
   * multi-view pass: full-bright lines without depth darkening. Call from 2D
   * pane prepare so sky geometry does not hide overlays. Consecutive 2D panes
   * in the same frame skip the full brush walk once edges are restored.
   *
   * @param root World group or scene containing solid brush helpers.
   */
  static prepareForOrthographicPass(root: THREE.Object3D): void {
    SolidBrushEdgeMaterials.setDepthOcclusionEnabled(false);
    SolidBrushVisual.setHullFillDepthOcclusionEnabled(root, false);
    if (this.lastEdgePassMode === 'ortho') return;
    this.lastEdgePassMode = 'ortho';
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (!SolidBrushVisual.isBrushObject(object)) return;
      if (!SolidBrushVisual.hasLocalEdges(object)) return;
      this.applyEdgeVisibility(object, true);
    });
  }

  /**
   * Restores depth-tested brush edges and selected hull fills before a
   * perspective pass. Edge visibility is then updated by
   * {@link updateForCamera}.
   *
   * @param root World group or scene containing solid brush helpers.
   */
  static prepareForPerspectivePass(root: THREE.Object3D): void {
    SolidBrushEdgeMaterials.setDepthOcclusionEnabled(true);
    SolidBrushVisual.setHullFillDepthOcclusionEnabled(root, true);
  }

  /**
   * Invalidates the multi-view edge-pass cache so the next prepare walks the
   * brush tree again (selection changes, undo, or structural edits).
   */
  static invalidateCameraCache(): void {
    this.lastEdgePassMode = null;
  }

  /**
   * Shows or hides a brush's decorative edge lines based on camera distance.
   *
   * @param brushMesh Solid brush preview mesh.
   */
  private static updateBrushEdgeVisibility(brushMesh: THREE.Mesh): void {
    const distance = this.estimateNearestDistance(brushMesh);
    const selected = SolidBrushVisual.isHullFillVisible(brushMesh);
    const hideBeyond = selected ? BRUSH_EDGE_FADE_FAR * SELECTED_FADE_RANGE_SCALE : BRUSH_EDGE_FADE_FAR;
    this.applyEdgeVisibility(brushMesh, distance < hideBeyond);
  }

  /**
   * Estimates distance from the camera to the nearest point on the brush
   * bounds.
   *
   * @param brushMesh Brush preview mesh.
   * @returns Non-negative distance in world units.
   */
  private static estimateNearestDistance(brushMesh: THREE.Mesh): number {
    brushMesh.updateMatrixWorld(false);
    const sphere = brushMesh.geometry.boundingSphere;
    if (!sphere) {
      brushMesh.getWorldPosition(brushWorldCenter);
      return cameraWorldPosition.distanceTo(brushWorldCenter);
    }
    return this.distanceToBoundingSphere(brushMesh, sphere);
  }

  /**
   * Distance from the camera to a brush mesh bounding sphere (nearest point).
   *
   * @param brushMesh Brush preview mesh.
   * @param sphere Local-space bounding sphere.
   * @returns Non-negative nearest distance.
   */
  private static distanceToBoundingSphere(brushMesh: THREE.Mesh, sphere: THREE.Sphere): number {
    brushWorldCenter.copy(sphere.center).applyMatrix4(brushMesh.matrixWorld);
    brushMesh.matrixWorld.decompose(brushWorldPosition, brushWorldQuaternion, brushWorldScale);
    const maxScale = Math.max(Math.abs(brushWorldScale.x), Math.abs(brushWorldScale.y), Math.abs(brushWorldScale.z));
    const worldRadius = sphere.radius * maxScale;
    const centerDistance = cameraWorldPosition.distanceTo(brushWorldCenter);
    return Math.max(0, centerDistance - worldRadius);
  }

  /**
   * Applies visibility to decorative edge children.
   *
   * @param brushMesh Brush preview mesh.
   * @param showEdges Whether edge lines should draw.
   */
  private static applyEdgeVisibility(brushMesh: THREE.Mesh, showEdges: boolean): void {
    for (const child of brushMesh.children) {
      if (!(child instanceof THREE.LineSegments)) continue;
      if (child.userData[SOLID_BRUSH_EDGE_USERDATA_KEY] !== true) continue;
      if (isEditModeWireframeSuppressed(child)) {
        if (child.visible) {
          child.visible = false;
        }
        continue;
      }
      if (child.visible !== showEdges) {
        child.visible = showEdges;
      }
    }
  }
}

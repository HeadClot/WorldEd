import * as THREE from 'three';
import { isEditorHelperObject } from '../utils/mesh_edge_sync.js';

/**
 * Extra distance beyond content so near/far never clip silhouette edges.
 */
const DEPTH_MARGIN = 8;

/**
 * Minimum stand-off from the nearest content plane to the camera.
 */
const MIN_STAND_OFF = 4;

/**
 * Keeps orthographic content in front of the camera along the view axis.
 * Adjusts only position-along-view and near/far — never zoom (left/right/top/bottom)
 * or lateral pan. Side view can therefore see maps on both +X and -X.
 */
export class OrthoDepthRanger {
  private static readonly viewDirection = new THREE.Vector3();
  private static readonly worldBox = new THREE.Box3();
  private static readonly corner = new THREE.Vector3();
  private static readonly size = new THREE.Vector3();

  /**
   * Updates an orthographic camera so all scene content lies within near/far.
   * @param camera Orthographic viewport camera.
   * @param scene Viewport scene containing content clones.
   */
  static update(camera: THREE.OrthographicCamera, scene: THREE.Scene): void {
    const range = this.measureContentDepthRange(scene, camera);
    if (!range) return;
    this.applyDepthRange(camera, range.minDot, range.maxDot);
  }

  /**
   * Measures content extent along the camera look direction.
   * @param scene Scene to scan for content meshes.
   * @param camera Camera providing the view direction.
   * @returns Min/max of content position · viewDirection, or null when empty.
   */
  private static measureContentDepthRange(
    scene: THREE.Scene,
    camera: THREE.OrthographicCamera
  ): { minDot: number; maxDot: number } | null {
    camera.updateMatrixWorld(true);
    camera.getWorldDirection(this.viewDirection);
    let minDot = Infinity;
    let maxDot = -Infinity;
    let found = false;
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (!object.visible) return;
      if (isEditorHelperObject(object)) return;
      if (this.isGridOrGizmo(object)) return;
      this.expandRangeFromMesh(object, this.viewDirection, (dot) => {
        found = true;
        minDot = Math.min(minDot, dot);
        maxDot = Math.max(maxDot, dot);
      });
    });
    if (!found) return null;
    return { minDot, maxDot };
  }

  /**
   * Expands depth range from a mesh world bounding box corners.
   * @param mesh Content mesh.
   * @param viewDirection Camera look direction.
   * @param includeDot Callback for each corner projection.
   */
  private static expandRangeFromMesh(
    mesh: THREE.Mesh,
    viewDirection: THREE.Vector3,
    includeDot: (dot: number) => void
  ): void {
    this.worldBox.setFromObject(mesh);
    if (this.worldBox.isEmpty()) return;
    this.worldBox.getSize(this.size);
    if (this.size.lengthSq() < 1e-12) return;
    const min = this.worldBox.min;
    const max = this.worldBox.max;
    for (let ix = 0; ix < 2; ix++) {
      for (let iy = 0; iy < 2; iy++) {
        for (let iz = 0; iz < 2; iz++) {
          this.corner.set(
            ix === 0 ? min.x : max.x,
            iy === 0 ? min.y : max.y,
            iz === 0 ? min.z : max.z
          );
          includeDot(this.corner.dot(viewDirection));
        }
      }
    }
  }

  /**
   * Slides the camera along its look axis and sets near/far to cover content.
   * @param camera Orthographic camera to update.
   * @param minDot Minimum content · viewDirection.
   * @param maxDot Maximum content · viewDirection.
   */
  private static applyDepthRange(
    camera: THREE.OrthographicCamera,
    minDot: number,
    maxDot: number
  ): void {
    camera.getWorldDirection(this.viewDirection);
    const depth = Math.max(maxDot - minDot, 0.001);
    const standOff = Math.max(MIN_STAND_OFF, depth * 0.05);
    // Content is in front when contentDot > cameraDot.
    const desiredCameraDot = minDot - standOff;
    const currentCameraDot = camera.position.dot(this.viewDirection);
    camera.position.addScaledVector(
      this.viewDirection,
      desiredCameraDot - currentCameraDot
    );
    camera.near = Math.max(0.1, standOff * 0.25);
    camera.far = standOff + depth + DEPTH_MARGIN;
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
  }

  /**
   * Returns true for viewport infrastructure that must not drive depth.
   * @param object Candidate object.
   * @returns True when object is grid or gizmo related.
   */
  private static isGridOrGizmo(object: THREE.Object3D): boolean {
    const name = object.name || '';
    if (name === 'grids_root' || name === 'infinite_grid_2d') return true;
    if (name === 'grid_lines') return true;
    if (name.startsWith('transform_gizmo')) return true;
    if (name.startsWith('bounds_')) return true;
    let current: THREE.Object3D | null = object.parent;
    while (current) {
      const parentName = current.name || '';
      if (parentName === 'grids_root') return true;
      if (parentName.startsWith('transform_gizmo')) return true;
      if (parentName === 'bounds_gizmo') return true;
      current = current.parent;
    }
    return false;
  }
}

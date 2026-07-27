import * as THREE from 'three';
import { Viewport3D } from '../../viewports/viewport_3d.js';
import { Viewport2D } from '../../viewports/viewport_2d.js';
import type { EditorViewport } from '../../viewports/editor_viewport.js';
import { SELECTION_HIGHLIGHT_USERDATA_KEY } from '../../selection/object/selection_highlight.js';
import { CLIP_PREVIEW_USERDATA_KEY } from '../clip_plane/clip_plane_preview.js';
import { EDITOR_SOURCE_UUID_KEY } from './viewport_sync_keys.js';

export { EDITOR_SOURCE_UUID_KEY, EDITOR_VIEWPORT_CLONE_KEY } from './viewport_sync_keys.js';

/** Configuration mapping a viewport to its container element. */
export interface ViewportContainerPair {
  /** The viewport instance. */
  viewport: Viewport3D | Viewport2D;

  /** The DOM container element for the viewport. */
  container: HTMLElement;
}

/**
 * Keeps selectable mesh lists in sync for shared-scene multi-view. World
 * content is no longer cloned per pane; all panes raycast the authoritative
 * meshes.
 */
export class ViewportSyncManager {
  private allViewports: EditorViewport[];
  private worldObject: THREE.Group | null;

  /**
   * Creates a sync manager. The four-argument form matches legacy tests.
   *
   * @param viewport2DTop Top orthographic viewport.
   * @param viewport2DFront Front orthographic viewport.
   * @param viewport2DSide Side orthographic viewport.
   * @param viewport3D Perspective viewport.
   */
  constructor(
    viewport2DTop: Viewport2D,
    viewport2DFront: Viewport2D,
    viewport2DSide: Viewport2D,
    viewport3D: Viewport3D,
  ) {
    this.allViewports = [];
    this.worldObject = null;
    this.setViewportRoles(null, [viewport2DTop, viewport2DFront, viewport2DSide, viewport3D]);
  }

  /**
   * Rebinds the live viewport list used for selectable updates.
   *
   * @param _hostViewport Unused (shared scene hosts the world).
   * @param viewports All live editor viewports.
   */
  setViewportRoles(_hostViewport: EditorViewport | null, viewports: readonly EditorViewport[]): void {
    this.allViewports = [...viewports];
  }

  /**
   * Stores the authoritative world object used for selection.
   *
   * @param worldObject The shared world group.
   */
  setWorldObject(worldObject: THREE.Group): void {
    this.worldObject = worldObject;
  }

  /**
   * Returns all viewport scenes (shared scene repeated for compatibility).
   *
   * @returns Scene references from live viewports.
   */
  getAllViewportScenes(): THREE.Scene[] {
    const scenes: THREE.Scene[] = [];
    this.allViewports.forEach((viewport) => {
      const scene = viewport.getScene();
      if (!scenes.includes(scene)) scenes.push(scene);
    });
    return scenes;
  }

  /**
   * Collects all selectable meshes from the authoritative world object only.
   *
   * @returns An array of world meshes suitable for selection state.
   */
  getWorldSelectableMeshes(): THREE.Mesh[] {
    if (!this.worldObject) return [];
    const meshes: THREE.Mesh[] = [];
    this.worldObject.traverse((child) => {
      if (child instanceof THREE.Mesh && !this.isHelperMesh(child)) {
        meshes.push(child);
      }
    });
    return meshes;
  }

  /**
   * Collects selectable meshes across managed scenes, excluding helpers.
   *
   * @returns An array of selectable meshes.
   */
  getAllViewportSelectableMeshes(): THREE.Mesh[] {
    return this.getWorldSelectableMeshes();
  }

  /**
   * Resolves a raycast hit mesh to the world mesh. With shared scenes this is
   * typically identity; source UUID tags remain supported for detached
   * streams.
   *
   * @param hitMesh The mesh returned by raycasting.
   * @returns The corresponding world mesh, or the original if already
   *   authoritative.
   */
  resolveToWorldMesh(hitMesh: THREE.Mesh): THREE.Mesh {
    const sourceUuid = hitMesh.userData[EDITOR_SOURCE_UUID_KEY];
    if (typeof sourceUuid !== 'string' || !this.worldObject) {
      return hitMesh;
    }
    const found = this.findMeshByUuid(this.worldObject, sourceUuid);
    return found ?? hitMesh;
  }

  /**
   * Finds a mesh in a hierarchy by UUID.
   *
   * @param root The root to search.
   * @param uuid The UUID to find.
   * @returns The matching mesh, or null.
   */
  findMeshByUuid(root: THREE.Object3D, uuid: string): THREE.Mesh | null {
    let result: THREE.Mesh | null = null;
    root.traverse((child) => {
      if (child instanceof THREE.Mesh && child.uuid === uuid) {
        result = child;
      }
    });
    return result;
  }

  /**
   * Clone lookup retained for API compatibility; shared-scene mode returns
   * empty.
   *
   * @param _worldUuid Unused world mesh UUID.
   * @returns Always empty in shared-scene mode.
   */
  findCloneMeshesForWorldUuid(_worldUuid: string): THREE.Mesh[] {
    return [];
  }

  /**
   * Refreshes selectable mesh lists on every live viewport from the world.
   *
   * @param worldObject The world object to expose for selection.
   */
  syncWorldObjectToViewports(worldObject: THREE.Group): void {
    this.worldObject = worldObject;
    const worldMeshes = this.getWorldSelectableMeshes();
    this.allViewports.forEach((viewport) => viewport.setSelectableObjects(worldMeshes));
  }

  /**
   * No-op geometry push retained for API compatibility.
   *
   * @param _worldMeshes Unused.
   */
  syncMeshGeometriesToClones(_worldMeshes: THREE.Mesh[]): void {
    // Shared scene: world geometry is already authoritative.
  }

  /**
   * No-op clone transform sync retained for API compatibility.
   *
   * @param _worldObject Unused.
   */
  syncClonePositionsToWorldObject(_worldObject: THREE.Group): void {
    // Shared scene: no clones to update.
  }

  /**
   * No-op clone transform sync retained for API compatibility.
   *
   * @param _worldObjects Unused.
   */
  syncCloneTransformsForWorldObjects(_worldObjects: readonly THREE.Object3D[]): void {
    // Shared scene: no clones to update.
  }

  /** No-op index rebuild retained for API compatibility. */
  rebuildCloneSourceIndex(): void {
    // Shared scene: no clone index.
  }

  /**
   * Returns true for wireframe helpers and highlight overlays that must not be
   * selected.
   *
   * @param mesh The mesh to test.
   * @returns True if the mesh is a helper.
   */
  private isHelperMesh(mesh: THREE.Object3D): boolean {
    if (mesh.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] === true) return true;
    if (mesh.userData[CLIP_PREVIEW_USERDATA_KEY] === true) return true;
    if (mesh.userData['isWireframeOverlay'] === true) return true;
    if (mesh.userData['isSelectionHighlight']) return true;
    if (mesh.userData['isSolidModelResult'] === true) return true;
    if (mesh instanceof THREE.LineSegments && mesh.parent instanceof THREE.Mesh) {
      return true;
    }
    let current: THREE.Object3D | null = mesh.parent;
    while (current) {
      if (current.userData[CLIP_PREVIEW_USERDATA_KEY] === true) return true;
      current = current.parent;
    }
    return false;
  }
}

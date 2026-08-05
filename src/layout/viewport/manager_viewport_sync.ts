import * as THREE from 'three';
import { Viewport3D } from '@/viewports/core/viewport_3d.js';
import { Viewport2D } from '@/viewports/core/viewport_2d.js';
import type { ViewportEditor } from '@/viewports/core/viewport_editor.js';
import { SELECTION_HIGHLIGHT_USERDATA_KEY } from '@/selection/object/selection_highlight.js';
import { CLIP_PREVIEW_USERDATA_KEY } from '@/tools/clip_plane/clip_plane_preview.js';
import { EDITOR_SOURCE_UUID_KEY } from './viewport_sync_keys.js';

export { EDITOR_SOURCE_UUID_KEY } from './viewport_sync_keys.js';

/** Configuration mapping a viewport to its container element. */
export interface ViewportContainerPair {
  /** The viewport instance. */
  viewport: Viewport3D | Viewport2D;

  /** The DOM container element for the viewport. */
  container: HTMLElement;
}

/**
 * Keeps selectable mesh lists in sync for shared-scene multi-view. All panes
 * raycast the authoritative world meshes.
 */
export class ManagerViewportSync {
  private allViewports: ViewportEditor[];
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
    viewport2DTop: Viewport2D | null,
    viewport2DFront: Viewport2D | null,
    viewport2DSide: Viewport2D | null,
    viewport3D: Viewport3D | null,
  ) {
    this.allViewports = [];
    this.worldObject = null;
    const seed = [viewport2DTop, viewport2DFront, viewport2DSide, viewport3D].filter(
      (viewport): viewport is ViewportEditor => viewport !== null,
    );
    this.setViewportRoles(null, seed);
  }

  /**
   * Rebinds the live viewport list used for selectable updates.
   *
   * @param _hostViewport Unused (shared scene hosts the world).
   * @param viewports All live editor viewports.
   */
  setViewportRoles(_hostViewport: ViewportEditor | null, viewports: readonly ViewportEditor[]): void {
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
   * Returns the authoritative world group when set.
   *
   * @returns World group or null.
   */
  getWorldObject(): THREE.Group | null {
    return this.worldObject;
  }

  /**
   * Returns unique scene roots used by live viewports.
   *
   * @returns Scene references from live viewports (shared scene once).
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
   * Resolves a raycast hit mesh to the authoritative world mesh. Shared-scene
   * hits are usually identity; source UUID tags remain supported when present.
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

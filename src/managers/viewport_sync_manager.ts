import * as THREE from 'three';
import { Viewport3D } from '../viewports/viewport_3d.js';
import { Viewport2D } from '../viewports/viewport_2d.js';
import { SELECTION_HIGHLIGHT_USERDATA_KEY } from '../selection/selection_highlight.js';
import { CLIP_PREVIEW_USERDATA_KEY } from './clip_plane_preview.js';
import { SolidBrushEdgeMaterials } from '../solid/model/solid_brush_edge_materials.js';
import { SOLID_BRUSH_OCCLUDED_EDGE_USERDATA_KEY } from '../solid/model/solid_brush_visual.js';

/**
 * UserData key used to map viewport clone meshes back to world meshes.
 */
export const EDITOR_SOURCE_UUID_KEY = 'editorSourceUuid';

/**
 * UserData key marking a top-level group as a 2D viewport world clone.
 */
export const EDITOR_VIEWPORT_CLONE_KEY = 'isEditorViewportClone';

/**
 * Configuration mapping a viewport to its container element.
 */
export interface ViewportContainerPair {
  /** The viewport instance. */
  viewport: Viewport3D | Viewport2D;

  /** The DOM container element for the viewport. */
  container: HTMLElement;
}

/**
 * Manages synchronization of the world object across multiple viewports.
 * 2D viewports receive deep clones with independent geometry/materials so
 * disposing clones never destroys the authoritative world meshes.
 */
export class ViewportSyncManager {
  private viewport2DTop: Viewport2D;
  private viewport2DFront: Viewport2D;
  private viewport2DSide: Viewport2D;
  private viewport3D: Viewport3D;
  private worldObject: THREE.Group | null;

  /**
   * Creates a new viewport sync manager for the given viewports.
   * @param viewport2DTop The top-down 2D viewport.
   * @param viewport2DFront The front-facing 2D viewport.
   * @param viewport2DSide The side-facing 2D viewport.
   * @param viewport3D The perspective 3D viewport.
   */
  constructor(
    viewport2DTop: Viewport2D,
    viewport2DFront: Viewport2D,
    viewport2DSide: Viewport2D,
    viewport3D: Viewport3D
  ) {
    this.viewport2DTop = viewport2DTop;
    this.viewport2DFront = viewport2DFront;
    this.viewport2DSide = viewport2DSide;
    this.viewport3D = viewport3D;
    this.worldObject = null;
  }

  /**
   * Stores the authoritative world object used for selection remapping.
   * @param worldObject The shared world group.
   */
  setWorldObject(worldObject: THREE.Group): void {
    this.worldObject = worldObject;
  }

  /**
   * Returns all viewport scenes managed by this sync manager.
   * @returns An array of all viewport scene references.
   */
  getAllViewportScenes(): THREE.Scene[] {
    return [
      this.viewport2DTop.getScene(),
      this.viewport2DFront.getScene(),
      this.viewport2DSide.getScene(),
      this.viewport3D.getScene()
    ];
  }

  /**
   * Collects all selectable meshes from the authoritative world object only.
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
   * Collects selectable meshes across all viewport scenes, excluding helpers.
   * @returns An array of selectable meshes.
   */
  getAllViewportSelectableMeshes(): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    this.getAllViewportScenes().forEach((scene) => {
      scene.traverse((child) => {
        if (
          child instanceof THREE.Mesh &&
          !this.isHelperMesh(child) &&
          !meshes.includes(child)
        ) {
          meshes.push(child);
        }
      });
    });
    return meshes;
  }

  /**
   * Resolves a raycast hit mesh (possibly a 2D clone) to the world mesh.
   * @param hitMesh The mesh returned by raycasting.
   * @returns The corresponding world mesh, or the original if already authoritative.
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
   * Finds clone meshes in all 2D scenes that map to a given world mesh UUID.
   * @param worldUuid The world mesh UUID to match.
   * @returns Matching clone meshes.
   */
  findCloneMeshesForWorldUuid(worldUuid: string): THREE.Mesh[] {
    const clones: THREE.Mesh[] = [];
    [
      this.viewport2DTop.getScene(),
      this.viewport2DFront.getScene(),
      this.viewport2DSide.getScene()
    ].forEach((scene) => {
      scene.traverse((child) => {
        if (
          child instanceof THREE.Mesh &&
          child.userData[EDITOR_SOURCE_UUID_KEY] === worldUuid
        ) {
          clones.push(child);
        }
      });
    });
    return clones;
  }

  /**
   * Syncs a world object to all 2D viewport scenes by cloning and replacing.
   * @param worldObject The world object to clone into 2D viewports.
   */
  syncWorldObjectToViewports(worldObject: THREE.Group): void {
    this.worldObject = worldObject;
    this.replaceCloneInScene(this.viewport2DTop.getScene(), worldObject);
    this.replaceCloneInScene(this.viewport2DFront.getScene(), worldObject);
    this.replaceCloneInScene(this.viewport2DSide.getScene(), worldObject);
    this.setupViewportSelectableObjects();
  }

  /**
   * Pushes updated world mesh geometry into matching 2D viewport clones.
   * Used for live solid CSG preview without a full scene reclone.
   * @param worldMeshes World meshes whose geometry changed.
   */
  syncMeshGeometriesToClones(worldMeshes: THREE.Mesh[]): void {
    if (worldMeshes.length === 0) return;
    const byUuid = new Map<string, THREE.Mesh>();
    for (const mesh of worldMeshes) {
      byUuid.set(mesh.uuid, mesh);
    }
    const scenes = [
      this.viewport2DTop.getScene(),
      this.viewport2DFront.getScene(),
      this.viewport2DSide.getScene()
    ];
    for (const scene of scenes) {
      this.pushGeometriesIntoSceneClones(scene, byUuid);
    }
  }

  /**
   * Updates clone mesh buffers that map to the given world mesh uuids.
   * @param scene Viewport scene containing clones.
   * @param worldByUuid World meshes keyed by uuid.
   */
  private pushGeometriesIntoSceneClones(
    scene: THREE.Scene,
    worldByUuid: Map<string, THREE.Mesh>
  ): void {
    scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const sourceUuid = child.userData[EDITOR_SOURCE_UUID_KEY];
      if (typeof sourceUuid !== 'string') return;
      const worldMesh = worldByUuid.get(sourceUuid);
      if (!worldMesh) return;
      this.replaceCloneGeometry(child, worldMesh);
    });
  }

  /**
   * Updates a clone's geometry from the world mesh without a full deep clone
   * when buffer sizes match (live solid CSG path).
   * @param cloneMesh Viewport clone mesh.
   * @param worldMesh Authoritative world mesh.
   */
  private replaceCloneGeometry(
    cloneMesh: THREE.Mesh,
    worldMesh: THREE.Mesh
  ): void {
    if (this.copyGeometryAttributesInPlace(cloneMesh.geometry, worldMesh.geometry)) {
      return;
    }
    const previous = cloneMesh.geometry;
    cloneMesh.geometry = worldMesh.geometry.clone();
    previous.dispose();
  }

  /**
   * Copies position/normal/uv arrays and groups when vertex counts match.
   * Avoids allocating full geometry clones on every live CSG frame.
   * @param destination Clone geometry to update.
   * @param source World geometry to read.
   * @returns True when an in-place copy was performed.
   */
  private copyGeometryAttributesInPlace(
    destination: THREE.BufferGeometry,
    source: THREE.BufferGeometry
  ): boolean {
    if (!this.canCopyGeometryInPlace(destination, source)) {
      return false;
    }
    this.copyNamedAttribute(destination, source, 'position');
    this.copyNamedAttribute(destination, source, 'normal');
    this.copyNamedAttribute(destination, source, 'uv');
    this.copyGeometryGroups(destination, source);
    if (source.boundingSphere) {
      destination.boundingSphere = source.boundingSphere.clone();
    }
    if (source.boundingBox) {
      destination.boundingBox = source.boundingBox.clone();
    }
    return true;
  }

  /**
   * Returns whether source and destination geometries share compatible layout.
   * @param destination Clone geometry.
   * @param source World geometry.
   * @returns True when in-place attribute copy is safe.
   */
  private canCopyGeometryInPlace(
    destination: THREE.BufferGeometry,
    source: THREE.BufferGeometry
  ): boolean {
    if (source.getIndex() || destination.getIndex()) return false;
    const sourcePosition = source.getAttribute('position');
    const destPosition = destination.getAttribute('position');
    if (!sourcePosition || !destPosition) return false;
    if (sourcePosition.count !== destPosition.count) return false;
    if (sourcePosition.count === 0) return false;
    return true;
  }

  /**
   * Copies one named attribute array when both sides exist and match length.
   * Uses solid mesh update ranges when present to avoid full-buffer copies.
   * @param destination Destination geometry.
   * @param source Source geometry.
   * @param name Attribute name.
   */
  private copyNamedAttribute(
    destination: THREE.BufferGeometry,
    source: THREE.BufferGeometry,
    name: string
  ): void {
    const sourceAttribute = source.getAttribute(name);
    const destAttribute = destination.getAttribute(name);
    if (!sourceAttribute || !destAttribute) return;
    if (sourceAttribute.array.length !== destAttribute.array.length) return;
    const sourceArray = sourceAttribute.array as Float32Array;
    const destArray = destAttribute.array as Float32Array;
    if (!this.copyAttributeBySolidUpdateRanges(destArray, sourceArray, name, source)) {
      destArray.set(sourceArray);
    }
    destAttribute.needsUpdate = true;
  }

  /**
   * Copies only dirty solid-result float ranges when the world mesh exposes them.
   * @param destArray Destination attribute array.
   * @param sourceArray Source attribute array.
   * @param name Attribute name (position/normal/uv).
   * @param sourceGeometry World geometry carrying optional update ranges.
   * @returns True when a partial copy was performed.
   */
  private copyAttributeBySolidUpdateRanges(
    destArray: Float32Array,
    sourceArray: Float32Array,
    name: string,
    sourceGeometry: THREE.BufferGeometry
  ): boolean {
    const ranges = sourceGeometry.userData.solidMeshUpdateRanges as
      | Array<{
          positionFloatStart: number;
          positionFloatCount: number;
          uvFloatStart: number;
          uvFloatCount: number;
        }>
      | undefined;
    if (!ranges || ranges.length === 0) return false;
    for (const range of ranges) {
      if (name === 'uv') {
        destArray.set(
          sourceArray.subarray(
            range.uvFloatStart,
            range.uvFloatStart + range.uvFloatCount
          ),
          range.uvFloatStart
        );
      } else {
        destArray.set(
          sourceArray.subarray(
            range.positionFloatStart,
            range.positionFloatStart + range.positionFloatCount
          ),
          range.positionFloatStart
        );
      }
    }
    return true;
  }

  /**
   * Mirrors geometry groups used for multi-material draw ranges.
   * @param destination Destination geometry.
   * @param source Source geometry.
   */
  private copyGeometryGroups(
    destination: THREE.BufferGeometry,
    source: THREE.BufferGeometry
  ): void {
    destination.clearGroups();
    for (const group of source.groups) {
      destination.addGroup(group.start, group.count, group.materialIndex);
    }
  }

  /**
   * Replaces the previous viewport clone in a scene with a fresh deep clone.
   * @param scene The 2D viewport scene.
   * @param worldObject The authoritative world group.
   */
  private replaceCloneInScene(scene: THREE.Scene, worldObject: THREE.Group): void {
    this.removeOldClones(scene);
    scene.add(this.createTaggedClone(worldObject));
  }

  /**
   * Creates a deep clone with independent geometry and materials.
   * Selection and wireframe overlays are stripped so each viewport owns them.
   * @param worldObject The world object to clone.
   * @returns A tagged clone group for a 2D viewport.
   */
  private createTaggedClone(worldObject: THREE.Group): THREE.Group {
    const clone = worldObject.clone(true);
    clone.userData[EDITOR_VIEWPORT_CLONE_KEY] = true;
    this.stripEditorOverlays(clone);
    this.tagCloneWithSourceUuids(worldObject, clone);
    this.detachSharedResources(clone);
    this.stripOccludedBrushEdges(clone);
    return clone;
  }

  /**
   * Removes occluded brush edge passes from 2D clones.
   * Ortho views keep front outlines only, cutting line draw calls roughly in half.
   * Runs after resource detach so dispose never frees shared 3D materials.
   * @param root Cloned hierarchy root.
   */
  private stripOccludedBrushEdges(root: THREE.Object3D): void {
    const toRemove: THREE.Object3D[] = [];
    root.traverse((child) => {
      if (child.userData[SOLID_BRUSH_OCCLUDED_EDGE_USERDATA_KEY] === true) {
        toRemove.push(child);
      }
    });
    toRemove.forEach((child) => {
      child.parent?.remove(child);
      this.disposeObject3D(child);
    });
  }

  /**
   * Removes selection highlights and wireframe overlays from a cloned hierarchy.
   * @param root The cloned hierarchy root.
   */
  private stripEditorOverlays(root: THREE.Object3D): void {
    const toRemove: THREE.Object3D[] = [];
    root.traverse((child) => {
      if (this.isEditorOverlayObject(child)) {
        toRemove.push(child);
      }
    });
    toRemove.forEach((child) => {
      child.parent?.remove(child);
      this.disposeObject3D(child);
    });
  }

  /**
   * Returns true for selection outlines and shading wireframe overlays.
   * @param object The object to test.
   * @returns True if the object is an editor-only overlay.
   */
  private isEditorOverlayObject(object: THREE.Object3D): boolean {
    if (object.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] === true) return true;
    if (object.userData.isWireframeOverlay === true) return true;
    return false;
  }

  /**
   * Clones geometry and materials so disposing viewport clones is safe.
   * @param root The cloned hierarchy root.
   */
  private detachSharedResources(root: THREE.Object3D): void {
    root.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        this.detachMeshResources(child);
      }
      if (child instanceof THREE.LineSegments || child instanceof THREE.Line) {
        this.detachLineResources(child);
      }
    });
  }

  /**
   * Gives a mesh its own geometry and material instances.
   * @param mesh The mesh to detach.
   */
  private detachMeshResources(mesh: THREE.Mesh): void {
    if (mesh.geometry) {
      mesh.geometry = mesh.geometry.clone();
    }
    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map((material) => material.clone());
    } else if (mesh.material) {
      mesh.material = mesh.material.clone();
    }
  }

  /**
   * Gives a line object its own geometry and material instances.
   * Brush edge clones disable distance fade so 2D views keep full wire clarity.
   * @param line The line object to detach.
   */
  private detachLineResources(line: THREE.Line | THREE.LineSegments): void {
    if (line.geometry) {
      line.geometry = line.geometry.clone();
    }
    if (Array.isArray(line.material)) {
      line.material = line.material.map((material) =>
        this.cloneLineMaterial(material)
      );
      return;
    }
    if (line.material) {
      line.material = this.cloneLineMaterial(line.material);
    }
  }

  /**
   * Clones a line material and disables brush-edge distance fade when present.
   * @param material Source material.
   * @returns Independent material for a 2D viewport clone.
   */
  private cloneLineMaterial(material: THREE.Material): THREE.Material {
    const cloned = material.clone();
    SolidBrushEdgeMaterials.disableDistanceFade(cloned);
    return cloned;
  }

  /**
   * Recursively writes source UUID tags from original hierarchy onto clone hierarchy.
   * @param original The original object.
   * @param clone The cloned counterpart at the same hierarchy path.
   */
  private tagCloneWithSourceUuids(
    original: THREE.Object3D,
    clone: THREE.Object3D
  ): void {
    clone.userData[EDITOR_SOURCE_UUID_KEY] = original.uuid;
    const childCount = Math.min(original.children.length, clone.children.length);
    for (let index = 0; index < childCount; index++) {
      this.tagCloneWithSourceUuids(original.children[index], clone.children[index]);
    }
  }

  /**
   * Sets up selectable object references for all viewports.
   */
  private setupViewportSelectableObjects(): void {
    const worldMeshes = this.getWorldSelectableMeshes();
    this.viewport3D.setSelectableObjects(worldMeshes);
    this.viewport2DTop.setSelectableObjects(
      this.collectCloneMeshesFromScene(this.viewport2DTop.getScene())
    );
    this.viewport2DFront.setSelectableObjects(
      this.collectCloneMeshesFromScene(this.viewport2DFront.getScene())
    );
    this.viewport2DSide.setSelectableObjects(
      this.collectCloneMeshesFromScene(this.viewport2DSide.getScene())
    );
  }

  /**
   * Collects clone meshes suitable for raycasting from a 2D scene.
   * @param scene The viewport scene.
   * @returns Selectable clone meshes.
   */
  private collectCloneMeshesFromScene(scene: THREE.Scene): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    scene.traverse((child) => {
      if (
        child instanceof THREE.Mesh &&
        child.userData[EDITOR_SOURCE_UUID_KEY] &&
        !this.isHelperMesh(child)
      ) {
        meshes.push(child);
      }
    });
    return meshes;
  }

  /**
   * Returns true for wireframe helpers and highlight overlays that must not be selected.
   * @param mesh The mesh to test.
   * @returns True if the mesh is a helper.
   */
  private isHelperMesh(mesh: THREE.Object3D): boolean {
    if (mesh.userData[SELECTION_HIGHLIGHT_USERDATA_KEY] === true) return true;
    if (mesh.userData[CLIP_PREVIEW_USERDATA_KEY] === true) return true;
    if (mesh.userData.isWireframeOverlay === true) return true;
    if (mesh.userData.isSelectionHighlight) return true;
    if (mesh.userData.isSolidModelResult === true) return true;
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

  /**
   * Mirrors transforms from the original world object into 2D viewport clones.
   * @param worldObject The original world object whose children serve as source.
   */
  syncClonePositionsToWorldObject(worldObject: THREE.Group): void {
    this.syncSingleViewportClone(this.viewport2DTop.getScene(), worldObject);
    this.syncSingleViewportClone(this.viewport2DFront.getScene(), worldObject);
    this.syncSingleViewportClone(this.viewport2DSide.getScene(), worldObject);
  }

  /**
   * Syncs clone children in a single viewport scene to match the original world object.
   * @param scene The viewport scene containing the clone group.
   * @param worldObject The original world object with authoritative transforms.
   */
  private syncSingleViewportClone(
    scene: THREE.Scene,
    worldObject: THREE.Group
  ): void {
    const cloneGroup = this.findCloneGroupInScene(scene);
    if (!cloneGroup) return;
    this.syncObjectTransformsRecursively(worldObject, cloneGroup);
  }

  /**
   * Recursively copies local transforms from original to clone hierarchy.
   * @param original The authoritative object.
   * @param clone The viewport clone counterpart.
   */
  private syncObjectTransformsRecursively(
    original: THREE.Object3D,
    clone: THREE.Object3D
  ): void {
    clone.position.copy(original.position);
    clone.quaternion.copy(original.quaternion);
    clone.scale.copy(original.scale);
    clone.visible = original.visible;
    const childCount = Math.min(original.children.length, clone.children.length);
    for (let index = 0; index < childCount; index++) {
      this.syncObjectTransformsRecursively(
        original.children[index],
        clone.children[index]
      );
    }
  }

  /**
   * Locates the cloned world group within a viewport scene.
   * @param scene The scene to search.
   * @returns The marked clone group, or null.
   */
  private findCloneGroupInScene(scene: THREE.Scene): THREE.Group | null {
    for (const child of scene.children) {
      if (child instanceof THREE.Group && child.userData[EDITOR_VIEWPORT_CLONE_KEY]) {
        return child;
      }
    }
    for (const child of scene.children) {
      if (
        child instanceof THREE.Group &&
        child.userData[EDITOR_SOURCE_UUID_KEY]
      ) {
        return child;
      }
    }
    return null;
  }

  /**
   * Removes only editor viewport clone groups from a scene.
   * @param scene The scene to clean up.
   */
  private removeOldClones(scene: THREE.Scene): void {
    const toRemove: THREE.Object3D[] = [];
    scene.children.forEach((child) => {
      if (
        child instanceof THREE.Group &&
        (child.userData[EDITOR_VIEWPORT_CLONE_KEY] ||
          child.userData[EDITOR_SOURCE_UUID_KEY])
      ) {
        toRemove.push(child);
      }
    });
    toRemove.forEach((obj) => {
      this.disposeObject3D(obj);
      scene.remove(obj);
    });
  }

  /**
   * Recursively disposes geometries and materials of a clone hierarchy.
   * Safe because clones always own independent resources.
   * @param obj The Three.js object whose resources should be disposed.
   */
  private disposeObject3D(obj: THREE.Object3D): void {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.LineSegments) {
      if (obj.geometry) obj.geometry.dispose();
      this.disposeCloneMaterials(obj.material);
    }
    const children = obj.children.slice();
    children.forEach((child) => this.disposeObject3D(child));
  }

  /**
   * Disposes clone-owned materials, never shared brush edge materials.
   * @param material Material or material array on a disposed clone object.
   */
  private disposeCloneMaterials(
    material: THREE.Material | THREE.Material[] | undefined
  ): void {
    if (Array.isArray(material)) {
      material.forEach((entry) => this.disposeCloneMaterial(entry));
      return;
    }
    if (material) this.disposeCloneMaterial(material);
  }

  /**
   * Disposes one material when it is not a shared brush edge material.
   * @param material Material to dispose.
   */
  private disposeCloneMaterial(material: THREE.Material): void {
    if (SolidBrushEdgeMaterials.isSharedMaterial(material)) return;
    material.dispose();
  }
}

import * as THREE from 'three';
import { pointerEventToNdc } from '../../utils/pointer_ndc.js';

/**
 * Shared raycasting utility for click-to-select across all viewports. Keeps
 * camera matrices current, rejects meshes with world-sphere tests before
 * triangle tests, and only forces double-sided materials on sphere hits so
 * dense solid maps stay interactive.
 */
export class SceneRaycaster {
  private raycaster: THREE.Raycaster;
  private ndcVector: THREE.Vector2;
  private readonly scratchSphere = new THREE.Sphere();
  private readonly candidateMeshes: THREE.Mesh[] = [];

  /** Creates a new shared raycaster instance for click-to-select operations. */
  constructor() {
    this.raycaster = new THREE.Raycaster();
    this.ndcVector = new THREE.Vector2();
  }

  /**
   * Casts a ray from the camera through the mouse position against selectable
   * objects.
   *
   * @param camera The camera to cast from.
   * @param renderer The renderer for canvas dimensions.
   * @param event The mouse event providing the click position.
   * @param selectableObjects The array of meshes to test against.
   * @returns The first intersected mesh, or null if no intersection.
   */
  cast(
    camera: THREE.Camera,
    pickElement: HTMLElement,
    event: MouseEvent,
    selectableObjects: THREE.Mesh[],
  ): THREE.Mesh | null {
    const hits = this.castAll(camera, pickElement, event, selectableObjects);
    return hits.length > 0 ? hits[0]! : null;
  }

  /**
   * Casts a ray and returns every intersected mesh near-to-far (with
   * duplicates). Callers that need click-through should dedupe via
   * SelectionClickThrough.
   *
   * @param camera The camera to cast from.
   * @param pickElement DOM element defining the view rectangle for NDC.
   * @param event The mouse event providing the click position.
   * @param selectableObjects The array of meshes to test against.
   * @returns Hit meshes ordered by ray distance (closest first).
   */
  castAll(
    camera: THREE.Camera,
    pickElement: HTMLElement,
    event: MouseEvent,
    selectableObjects: THREE.Mesh[],
  ): THREE.Mesh[] {
    return this.allMeshHits(this.castIntersections(camera, pickElement, event, selectableObjects));
  }

  /**
   * Returns raycast intersection records ordered near-to-far for click-through.
   *
   * @param camera The camera to cast from.
   * @param pickElement DOM element defining the view rectangle for NDC.
   * @param event The mouse event providing the click position.
   * @param selectableObjects The array of meshes to test against.
   * @returns Raw Three.js intersections (distance-sorted).
   */
  castIntersections(
    camera: THREE.Camera,
    pickElement: HTMLElement,
    event: MouseEvent,
    selectableObjects: THREE.Mesh[],
  ): THREE.Intersection[] {
    if (selectableObjects.length === 0) return [];
    camera.updateMatrixWorld(false);
    pointerEventToNdc(event, pickElement, this.ndcVector);
    this.raycaster.setFromCamera(this.ndcVector, camera);
    this.collectSphereCandidates(selectableObjects);
    if (this.candidateMeshes.length === 0) return [];
    const restored = this.enableDoubleSidedPicking(this.candidateMeshes);
    const intersections = this.raycaster.intersectObjects(this.candidateMeshes, false);
    this.restoreMaterialSides(restored);
    return intersections;
  }

  /**
   * Collects meshes whose world bounding spheres may intersect the pick ray.
   * Refreshes matrices only when dirty so static maps stay cheap.
   *
   * @param meshes Selectable meshes.
   */
  private collectSphereCandidates(meshes: THREE.Mesh[]): void {
    this.candidateMeshes.length = 0;
    const ray = this.raycaster.ray;
    for (const mesh of meshes) {
      if (!mesh.visible) continue;
      mesh.updateMatrixWorld(false);
      if (!this.rayIntersectsMeshWorldSphere(mesh, ray)) continue;
      this.candidateMeshes.push(mesh);
    }
  }

  /**
   * Tests the pick ray against a mesh world-space bounding sphere.
   *
   * @param mesh Candidate mesh.
   * @param ray World-space pick ray.
   * @returns True when the ray may hit the mesh.
   */
  private rayIntersectsMeshWorldSphere(mesh: THREE.Mesh, ray: THREE.Ray): boolean {
    const geometry = mesh.geometry;
    if (!geometry) return false;
    if (!geometry.boundingSphere) {
      geometry.computeBoundingSphere();
    }
    const localSphere = geometry.boundingSphere;
    if (!localSphere) return true;
    this.scratchSphere.copy(localSphere);
    this.scratchSphere.applyMatrix4(mesh.matrixWorld);
    return ray.intersectsSphere(this.scratchSphere);
  }

  /**
   * Temporarily enables DoubleSide on materials so back-facing triangles still
   * pick.
   *
   * @param meshes The meshes being picked.
   * @returns Previous side values for restoration.
   */
  private enableDoubleSidedPicking(meshes: THREE.Mesh[]): Array<{ material: THREE.Material; side: THREE.Side }> {
    const restored: Array<{ material: THREE.Material; side: THREE.Side }> = [];
    for (const mesh of meshes) {
      this.snapshotAndForceDoubleSide(mesh, restored);
    }
    return restored;
  }

  /**
   * Snapshots material sides on a mesh and forces DoubleSide for picking.
   *
   * @param mesh The mesh whose materials should be temporarily double-sided.
   * @param restored Accumulator for side restoration data.
   */
  private snapshotAndForceDoubleSide(
    mesh: THREE.Mesh,
    restored: Array<{ material: THREE.Material; side: THREE.Side }>,
  ): void {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material) continue;
      restored.push({ material, side: material.side });
      material.side = THREE.DoubleSide;
    }
  }

  /**
   * Restores material side values after object picking.
   *
   * @param restored Previous material side snapshots.
   */
  private restoreMaterialSides(restored: Array<{ material: THREE.Material; side: THREE.Side }>): void {
    for (const entry of restored) {
      entry.material.side = entry.side;
    }
  }

  /**
   * Collects every mesh object from a sorted intersection list.
   *
   * @param intersections Raycast hits sorted by distance.
   * @returns Hit meshes in the same order (may include the same mesh twice).
   */
  private allMeshHits(intersections: THREE.Intersection[]): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    for (const hit of intersections) {
      if (hit.object instanceof THREE.Mesh) {
        meshes.push(hit.object);
      }
    }
    return meshes;
  }

  /**
   * Disposes internal Three.js resources. Raycaster and Vector2 do not require
   * explicit disposal.
   */
  dispose(): void {}
}

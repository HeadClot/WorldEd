import * as THREE from 'three';
import type { Camera } from 'three';
import {
  resolveAudioRoomCharacter,
  resolveAudioRoomCharacterFromRayDistances,
  type AudioRoomCharacter,
} from './audio_room_character.js';

/** Providers for a cheap world-space audio room probe. */
export interface AudioSpaceProbeProviders {
  /**
   * Returns the world origin to probe from (selection pivot preferred).
   *
   * @returns Probe origin in world space.
   */
  getProbeOrigin: () => THREE.Vector3;

  /**
   * Returns meshes that represent solid world geometry (not the void).
   *
   * @returns Candidate solid meshes.
   */
  getSolidMeshes: () => readonly THREE.Mesh[];

  /**
   * Returns objects to ignore (e.g. the active selection being transformed).
   *
   * @returns Objects excluded from distance hits.
   */
  getIgnoredObjects?: () => readonly THREE.Object3D[];
}

/** Maximum ray length for room probes (world units). */
const PROBE_MAX_DISTANCE = 80;

/** Max meshes triangle-tested per ray after sphere culling. */
const MAX_TRIANGLE_CANDIDATES_PER_RAY = 48;

/** World-axis fallback directions when no camera is available. */
const WORLD_PROBE_DIRECTIONS: readonly THREE.Vector3[] = Object.freeze([
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
]);

/**
 * Cheap room-size probe: six world-axis raycasts (+X/−X, +Y/−Y, +Z/−Z).
 * Opposite rays are summed into stable axis totals (hallway length does not
 * change when standing mid-corridor). Sphere-culls before triangle tests.
 */
export class AudioSpaceProbe {
  private providers: AudioSpaceProbeProviders | null;
  private readonly raycaster: THREE.Raycaster;
  private readonly origin: THREE.Vector3;
  private readonly axisRayDistances: (number | null)[];
  private readonly candidateMeshes: THREE.Mesh[];
  private readonly candidateDistances: number[];
  private readonly worldSphere: THREE.Sphere;
  private readonly localSphereCenter: THREE.Vector3;

  /** Creates an unbound probe. */
  constructor() {
    this.providers = null;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = PROBE_MAX_DISTANCE;
    this.origin = new THREE.Vector3();
    this.axisRayDistances = [null, null, null, null, null, null];
    this.candidateMeshes = [];
    this.candidateDistances = [];
    this.worldSphere = new THREE.Sphere();
    this.localSphereCenter = new THREE.Vector3();
  }

  /**
   * Binds world/selection providers used when sampling room character.
   *
   * @param providers Probe origin and mesh providers, or null to unbind.
   */
  bind(providers: AudioSpaceProbeProviders | null): void {
    this.providers = providers;
  }

  /**
   * Samples six world-axis rays and returns a room character. Axis order is
   * always +X, −X, +Y, −Y, +Z, −Z so opposite free distances sum into stable
   * totals. Prefer {@link sampleRoomCharacterAt} with the 3D sound position.
   *
   * @param _camera Unused (kept for call-site compatibility).
   * @returns Room character (void when unbound or no solid hits).
   */
  sampleRoomCharacter(_camera: Camera | null = null): AudioRoomCharacter {
    return this.sampleRoomCharacterAt(this.getSelectionCenterOrigin());
  }

  /**
   * Samples six world-axis rays from an explicit origin (typically the same
   * closest-bounds point used for 3D sound placement).
   *
   * @param worldOrigin World-space ray origin.
   * @returns Room character (void when unbound or no solid hits).
   */
  sampleRoomCharacterAt(worldOrigin: THREE.Vector3): AudioRoomCharacter {
    if (!this.providers) {
      return resolveAudioRoomCharacter(null);
    }
    this.origin.copy(worldOrigin);
    this.collectWorldAxisRayDistances(this.providers);
    return resolveAudioRoomCharacterFromRayDistances(this.axisRayDistances);
  }

  /**
   * Returns the selection-center fallback origin (not the volumetric sound
   * point). Prefer the pose from {@link resolveBoundsClosestSoundPose} for
   * rays.
   *
   * @returns World-space selection center, or origin when unbound.
   */
  getProbeOrigin(): THREE.Vector3 {
    return this.getSelectionCenterOrigin();
  }

  /**
   * Reads the bound selection-center origin provider.
   *
   * @returns World-space origin copy.
   */
  private getSelectionCenterOrigin(): THREE.Vector3 {
    if (!this.providers) {
      return new THREE.Vector3(0, 0, 0);
    }
    return this.providers.getProbeOrigin().clone();
  }

  /**
   * Fills {@link axisRayDistances} with closest solid hits on world ±X/±Y/±Z
   * (null when that ray sees only void).
   *
   * @param providers Bound probe providers.
   */
  private collectWorldAxisRayDistances(providers: AudioSpaceProbeProviders): void {
    const meshes = providers.getSolidMeshes();
    const ignored = providers.getIgnoredObjects?.() ?? [];
    for (let axisIndex = 0; axisIndex < WORLD_PROBE_DIRECTIONS.length; axisIndex++) {
      const direction = WORLD_PROBE_DIRECTIONS[axisIndex];
      if (!direction) {
        this.axisRayDistances[axisIndex] = null;
        continue;
      }
      this.axisRayDistances[axisIndex] = this.raycastNearestSolidDistance(meshes, ignored, direction);
    }
  }

  /**
   * Raycasts one axis against sphere-culled solid meshes and returns hit
   * distance.
   *
   * @param meshes Solid candidates.
   * @param ignored Selection roots to skip.
   * @param direction Unit ray direction.
   * @returns Closest hit distance, or null on void.
   */
  private raycastNearestSolidDistance(
    meshes: readonly THREE.Mesh[],
    ignored: readonly THREE.Object3D[],
    direction: THREE.Vector3,
  ): number | null {
    this.raycaster.set(this.origin, direction);
    this.collectSphereCulledCandidates(meshes, ignored);
    if (this.candidateMeshes.length === 0) {
      return null;
    }
    const hits = this.raycaster.intersectObjects(this.candidateMeshes, false);
    if (hits.length === 0) {
      return null;
    }
    const distance = hits[0]?.distance;
    if (distance === undefined || distance > PROBE_MAX_DISTANCE) {
      return null;
    }
    return distance;
  }

  /**
   * Collects meshes whose world bounding spheres may hit the active ray, capped
   * to the nearest candidates for cheap triangle tests.
   *
   * @param meshes Solid candidates.
   * @param ignored Selection roots to skip.
   */
  private collectSphereCulledCandidates(meshes: readonly THREE.Mesh[], ignored: readonly THREE.Object3D[]): void {
    this.candidateMeshes.length = 0;
    this.candidateDistances.length = 0;
    const ray = this.raycaster.ray;
    for (let index = 0; index < meshes.length; index++) {
      const mesh = meshes[index];
      if (!mesh || !mesh.visible || !mesh.geometry) {
        continue;
      }
      if (this.isIgnoredMesh(mesh, ignored)) {
        continue;
      }
      if (!this.writeWorldBoundingSphere(mesh)) {
        continue;
      }
      if (!ray.intersectsSphere(this.worldSphere)) {
        continue;
      }
      const alongRay = this.signedDistanceAlongRayToSphereCenter(ray);
      if (alongRay > PROBE_MAX_DISTANCE || alongRay < -this.worldSphere.radius) {
        continue;
      }
      this.insertCandidateByDistance(mesh, Math.max(0, alongRay));
    }
  }

  /**
   * Inserts a mesh into the capped candidate list ordered by approximate
   * distance.
   *
   * @param mesh Mesh that passed sphere culling.
   * @param approximateDistance Distance proxy along the ray.
   */
  private insertCandidateByDistance(mesh: THREE.Mesh, approximateDistance: number): void {
    if (this.candidateMeshes.length < MAX_TRIANGLE_CANDIDATES_PER_RAY) {
      this.candidateMeshes.push(mesh);
      this.candidateDistances.push(approximateDistance);
      return;
    }
    let worstIndex = 0;
    let worstDistance = this.candidateDistances[0] ?? 0;
    for (let index = 1; index < this.candidateDistances.length; index++) {
      const distance = this.candidateDistances[index] ?? 0;
      if (distance > worstDistance) {
        worstDistance = distance;
        worstIndex = index;
      }
    }
    if (approximateDistance >= worstDistance) {
      return;
    }
    this.candidateMeshes[worstIndex] = mesh;
    this.candidateDistances[worstIndex] = approximateDistance;
  }

  /**
   * Writes the mesh world bounding sphere into {@link worldSphere}.
   *
   * @param mesh Mesh with geometry.
   * @returns False when the sphere cannot be built.
   */
  private writeWorldBoundingSphere(mesh: THREE.Mesh): boolean {
    const geometry = mesh.geometry;
    if (!geometry.boundingSphere) {
      geometry.computeBoundingSphere();
    }
    const localSphere = geometry.boundingSphere;
    if (!localSphere) {
      return false;
    }
    mesh.updateWorldMatrix(true, false);
    this.localSphereCenter.copy(localSphere.center);
    this.localSphereCenter.applyMatrix4(mesh.matrixWorld);
    const scale = mesh.matrixWorld.getMaxScaleOnAxis();
    this.worldSphere.center.copy(this.localSphereCenter);
    this.worldSphere.radius = localSphere.radius * scale;
    return this.worldSphere.radius > 0;
  }

  /**
   * Approximate distance from ray origin to the sphere center along the ray.
   *
   * @param ray Active raycaster ray.
   * @returns Signed distance along the ray direction.
   */
  private signedDistanceAlongRayToSphereCenter(ray: THREE.Ray): number {
    const center = this.worldSphere.center;
    return (
      (center.x - ray.origin.x) * ray.direction.x +
      (center.y - ray.origin.y) * ray.direction.y +
      (center.z - ray.origin.z) * ray.direction.z
    );
  }

  /**
   * Returns whether a mesh is under an ignored object hierarchy.
   *
   * @param mesh Candidate mesh.
   * @param ignored Roots to exclude.
   * @returns True when the mesh should be skipped.
   */
  private isIgnoredMesh(mesh: THREE.Mesh, ignored: readonly THREE.Object3D[]): boolean {
    for (let index = 0; index < ignored.length; index++) {
      const root = ignored[index];
      if (!root) {
        continue;
      }
      if (mesh === root || this.isDescendantOf(mesh, root)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Returns whether node is nested under ancestor.
   *
   * @param node Node to test.
   * @param ancestor Potential ancestor.
   * @returns True when node is under ancestor.
   */
  private isDescendantOf(node: THREE.Object3D, ancestor: THREE.Object3D): boolean {
    let current: THREE.Object3D | null = node.parent;
    while (current) {
      if (current === ancestor) {
        return true;
      }
      current = current.parent;
    }
    return false;
  }
}

/** Shared room probe used before playing snap feedback. */
export const audioSpaceProbe = new AudioSpaceProbe();

import * as THREE from 'three';
import { FaceTextureMapping, cloneFaceTextureMapping } from '../uv/face_texture_mapping.js';
import { getFaceTextureMaps, setFaceTextureMaps } from '../uv/face_texture_storage.js';
import { computeRegionWorldNormal } from '../uv/planar_uv_projector.js';
import { SurfaceUvMatrix } from '../uv_matrix/surface_uv_matrix.js';

const scratchLocal = new THREE.Vector3();
const scratchWorld = new THREE.Vector3();

/**
 * Rewrites stored face texture UV matrices so a world-space rebake would
 * reproduce the mesh's current vertex UVs. Used when Tex Lock mode changes so
 * content meshes keep their look. Does not modify the UV attribute.
 *
 * @param mesh Content mesh with face texture maps and UV attribute.
 */
export function syncContentMeshFaceMappingsToCurrentUvs(mesh: THREE.Mesh): void {
  if (!mesh.geometry) return;
  const entries = getFaceTextureMaps(mesh);
  if (entries.length === 0) return;
  mesh.updateMatrixWorld(true);
  const nextEntries = entries.map((entry) => ({
    triangleIndices: entry.triangleIndices.slice(),
    mapping: fitFaceMappingToCurrentUvs(mesh, entry.triangleIndices, entry.mapping),
  }));
  setFaceTextureMaps(mesh, nextEntries);
}

/**
 * Returns whether stored face UV matrices rebake to the mesh's current UVs.
 *
 * @param mesh Content mesh with face maps and UV attribute.
 * @returns True when mappings match current UVs within tolerance.
 */
export function contentMeshMappingsMatchCurrentUvs(mesh: THREE.Mesh): boolean {
  if (!mesh.geometry) return false;
  const entries = getFaceTextureMaps(mesh);
  if (entries.length === 0) return true;
  mesh.updateMatrixWorld(true);
  const uv = mesh.geometry.getAttribute('uv');
  const position = mesh.geometry.getAttribute('position');
  if (!uv || !position) return false;
  const index = mesh.geometry.getIndex();
  for (const entry of entries) {
    for (const faceIndex of entry.triangleIndices) {
      for (let corner = 0; corner < 3; corner++) {
        const vertexIndex = index ? index.getX(faceIndex * 3 + corner) : faceIndex * 3 + corner;
        scratchLocal.fromBufferAttribute(position, vertexIndex);
        scratchWorld.copy(scratchLocal).applyMatrix4(mesh.matrixWorld);
        const projected = entry.mapping.uv.project(scratchWorld);
        if (Math.abs(projected.u - uv.getX(vertexIndex)) > 1e-3) return false;
        if (Math.abs(projected.v - uv.getY(vertexIndex)) > 1e-3) return false;
      }
    }
  }
  return true;
}

/**
 * Fits a world-space UV matrix so bake matches current UVs on a face.
 *
 * @param mesh Content mesh.
 * @param triangleIndices Face region triangles.
 * @param mapping Current stored mapping (texture preserved).
 * @returns Mapping with UV matrix fitted to current UVs.
 */
export function fitFaceMappingToCurrentUvs(
  mesh: THREE.Mesh,
  triangleIndices: number[],
  mapping: FaceTextureMapping,
): FaceTextureMapping {
  const samples = collectRegionWorldUvSamples(mesh, triangleIndices);
  if (samples.length < 3) return cloneFaceTextureMapping(mapping);
  const faceNormal = computeRegionWorldNormal(mesh, triangleIndices);
  const fitted = fitUvMatrixFromSamples(samples, faceNormal);
  return {
    textureId: mapping.textureId,
    uv: fitted,
    align: mapping.align ?? 'face',
  };
}

/** One vertex sample with world position and current UV. */
interface WorldUvSample {
  world: THREE.Vector3;
  u: number;
  v: number;
}

/**
 * Collects unique world-position / UV samples for a face region.
 *
 * @param mesh Content mesh.
 * @param triangleIndices Region triangles.
 * @returns Sample list.
 */
function collectRegionWorldUvSamples(mesh: THREE.Mesh, triangleIndices: number[]): WorldUvSample[] {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  if (!position || !uv) return [];
  const index = geometry.getIndex();
  const seen = new Set<number>();
  const samples: WorldUvSample[] = [];
  triangleIndices.forEach((faceIndex) => {
    for (let corner = 0; corner < 3; corner++) {
      const vertexIndex = index ? index.getX(faceIndex * 3 + corner) : faceIndex * 3 + corner;
      if (seen.has(vertexIndex)) continue;
      seen.add(vertexIndex);
      scratchLocal.fromBufferAttribute(position, vertexIndex);
      scratchWorld.copy(scratchLocal).applyMatrix4(mesh.matrixWorld);
      samples.push({
        world: scratchWorld.clone(),
        u: uv.getX(vertexIndex),
        v: uv.getY(vertexIndex),
      });
    }
  });
  return samples;
}

/**
 * Fits a UV matrix from world samples using three non-collinear points.
 *
 * @param samples Region samples.
 * @param faceNormal Face normal.
 * @returns Fitted UV matrix.
 */
function fitUvMatrixFromSamples(samples: WorldUvSample[], faceNormal: THREE.Vector3): SurfaceUvMatrix {
  const a = samples[0]!;
  let b = samples[1] ?? a;
  let c = samples[2] ?? a;
  for (let index = 1; index < samples.length; index++) {
    const sample = samples[index];
    if (!sample) continue;
    if (sample.world.distanceToSquared(a.world) > 1e-8) {
      b = sample;
      break;
    }
  }
  for (let index = 0; index < samples.length; index++) {
    const candidate = samples[index];
    if (!candidate) continue;
    const ab = new THREE.Vector3().subVectors(b.world, a.world);
    const ac = new THREE.Vector3().subVectors(candidate.world, a.world);
    if (new THREE.Vector3().crossVectors(ab, ac).lengthSq() > 1e-10) {
      c = candidate;
      break;
    }
  }
  return fitUvMatrixFromThreePoints(a, b, c, faceNormal);
}

/**
 * Builds a UV matrix that maps three world points to their UVs (planar).
 *
 * @param a First sample.
 * @param b Second sample.
 * @param c Third sample.
 * @param faceNormal Face normal for plane constraint.
 * @returns Fitted matrix.
 */
function fitUvMatrixFromThreePoints(
  a: WorldUvSample,
  b: WorldUvSample,
  c: WorldUvSample,
  faceNormal: THREE.Vector3,
): SurfaceUvMatrix {
  void faceNormal;
  // Solve U·p + Uw = u for three points using linear system on (Ux,Uy,Uz,Uw)
  // with constraint that U is not unique in 3D; use least squares on all three.
  const uRow = solveRow(a.world, a.u, b.world, b.u, c.world, c.u);
  const vRow = solveRow(a.world, a.v, b.world, b.v, c.world, c.v);
  return new SurfaceUvMatrix(uRow, vRow);
}

/**
 * Solves a linear form n·p + w = value for three points (least squares).
 *
 * @param p0 First point.
 * @param s0 First scalar.
 * @param p1 Second point.
 * @param s1 Second scalar.
 * @param p2 Third point.
 * @param s2 Third scalar.
 * @returns Vector4 (n, w).
 */
function solveRow(
  p0: THREE.Vector3,
  s0: number,
  p1: THREE.Vector3,
  s1: number,
  p2: THREE.Vector3,
  s2: number,
): THREE.Vector4 {
  // Use differences to find gradient, then w from first point.
  const e1 = new THREE.Vector3().subVectors(p1, p0);
  const e2 = new THREE.Vector3().subVectors(p2, p0);
  const ds1 = s1 - s0;
  const ds2 = s2 - s0;
  // Solve [e1; e2] · n = (ds1; ds2) in the plane of e1,e2 via normal equations.
  const a11 = e1.dot(e1);
  const a12 = e1.dot(e2);
  const a22 = e2.dot(e2);
  const det = a11 * a22 - a12 * a12;
  if (Math.abs(det) < 1e-14) {
    return new THREE.Vector4(0, 0, 0, s0);
  }
  const inv00 = a22 / det;
  const inv01 = -a12 / det;
  const inv11 = a11 / det;
  const c1 = inv00 * ds1 + inv01 * ds2;
  const c2 = inv01 * ds1 + inv11 * ds2;
  const gradient = new THREE.Vector3().addScaledVector(e1, c1).addScaledVector(e2, c2);
  const w = s0 - gradient.dot(p0);
  return new THREE.Vector4(gradient.x, gradient.y, gradient.z, w);
}

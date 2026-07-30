import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { createDefaultFaceTextureMapping } from '@/texture/uv/face_texture_mapping.js';
import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';
import { createFaceSurfaceFromTileSize } from '@/texture/uv_matrix/face_surface_description.js';

/** Texture lock must keep solid-brush face UVs glued when brushes translate. */
describe('solid brush texture lock', () => {
  it('keeps result UV stuck to the brush under Tex Lock after translation', () => {
    const model = new SolidModel('LockTranslate');
    model.setUvStickToBrush(true);
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    const mapping = createDefaultFaceTextureMapping('lock.png');
    mapping.align = 'face';
    mapping.scaleU = 2;
    mapping.scaleV = 2;
    mapping.offsetU = 0.25;
    mapping.offsetV = -0.1;
    brush.setFaceMapping(0, mapping);
    model.rebuild(true);
    const uvBefore = sampleResultMeshUvNear(model.getResultMeshForSync(), new THREE.Vector3(0, 1, 0));

    const mesh = brush.mesh!;
    mesh.position.x += 1.5;
    mesh.position.z -= 0.75;
    mesh.updateMatrixWorld(true);
    model.setUvStickToBrush(true);
    model.prepareLiveBrushEdit([mesh], true);
    model.rebuild(true);

    const uvAfter = sampleResultMeshUvNear(
      model.getResultMeshForSync(),
      new THREE.Vector3(mesh.position.x, 1, mesh.position.z),
    );
    expect(uvAfter.u).toBeCloseTo(uvBefore.u, 4);
    expect(uvAfter.v).toBeCloseTo(uvBefore.v, 4);
  });

  it('leaves brush-local UV matrix unchanged when both locks are on', () => {
    const model = new SolidModel('MatrixStick');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    const normal = brush.faceNormalLocal(0);
    const surface = createFaceSurfaceFromTileSize(normal, 'stick.png', 2, 2);
    brush.setFaceSurface(0, surface);
    const before = brush.getFaceSurface(0).uv.clone();
    const mesh = brush.mesh!;
    mesh.position.x += 3;
    mesh.rotation.y = Math.PI / 4;
    mesh.updateMatrixWorld(true);
    model.prepareLiveBrushEdit([mesh], { positionLock: true, stretchLock: true });
    const after = brush.getFaceSurface(0).uv;
    expect(after.equals(before, 1e-6)).toBe(true);
  });

  it('preserves result UV through multi-step live drag with Tex Lock', () => {
    const model = new SolidModel('LiveLock');
    model.setUvStickToBrush(true);
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    const mapping = createDefaultFaceTextureMapping('live.png');
    mapping.align = 'face';
    mapping.offsetU = 0.3;
    mapping.offsetV = 0.4;
    brush.setFaceMapping(0, mapping);
    model.rebuild(true);
    const uvBefore = sampleResultMeshUvNear(model.getResultMeshForSync(), new THREE.Vector3(0, 1, 0));

    const mesh = brush.mesh!;
    for (let step = 0; step < 8; step++) {
      mesh.position.x += 0.25;
      mesh.position.z += 0.1;
      mesh.updateMatrixWorld(true);
      model.setUvStickToBrush(true);
      model.prepareLiveBrushEdit([mesh], true);
      model.rebuildLive();
    }
    model.finalizeAfterInteractiveEdit();

    const uvAfter = sampleResultMeshUvNear(
      model.getResultMeshForSync(),
      new THREE.Vector3(mesh.position.x, 1, mesh.position.z),
    );
    expect(uvAfter.u).toBeCloseTo(uvBefore.u, 3);
    expect(uvAfter.v).toBeCloseTo(uvBefore.v, 3);
  });

  it('allows result UVs to slide in world space when Tex Lock is off', () => {
    const model = new SolidModel('NoLock');
    model.setUvStickToBrush(false);
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    const mapping = createDefaultFaceTextureMapping('slide.png');
    mapping.align = 'face';
    brush.setFaceMapping(0, mapping);
    model.rebuild(true);
    const uvBefore = sampleResultMeshUvNear(model.getResultMeshForSync(), new THREE.Vector3(0, 1, 0));

    const mesh = brush.mesh!;
    mesh.position.x += 2;
    mesh.updateMatrixWorld(true);
    model.setUvStickToBrush(false);
    model.prepareLiveBrushEdit([mesh], false);
    model.rebuild(true);

    const uvAfter = sampleResultMeshUvNear(model.getResultMeshForSync(), new THREE.Vector3(2, 1, 0));
    expect(Math.abs(uvAfter.u - uvBefore.u) + Math.abs(uvAfter.v - uvBefore.v)).toBeGreaterThan(0.5);
  });

  it('does not rewrite solid mesh UVs when Tex Lock is toggled without moving brushes', () => {
    const model = new SolidModel('ToggleNoRewrite');
    model.setUvStickToBrush(true);
    const first = model.addBoxBrush(2, SolidOperation.Additive);
    const firstMap = createDefaultFaceTextureMapping('first.png');
    firstMap.scaleU = 3;
    firstMap.scaleV = 3;
    firstMap.offsetU = 0.4;
    first.setFaceMapping(0, firstMap);
    model.rebuild(true);
    const result = model.getResultMeshForSync();
    const uvBefore = cloneUvAttribute(result);

    model.setUvStickToBrush(false);
    expect(cloneUvAttribute(result)).toEqual(uvBefore);

    model.setUvStickToBrush(true);
    expect(cloneUvAttribute(result)).toEqual(uvBefore);
  });

  it('keeps stretched UVs after disabling Tex Lock then remeshing without a further transform', () => {
    const model = new SolidModel('StretchThenUnlock');
    model.setUvStickToBrush(true);
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    const mapping = createDefaultFaceTextureMapping('stretch.png');
    mapping.align = 'face';
    brush.setFaceMapping(0, mapping);
    model.rebuild(true);

    const mesh = brush.mesh!;
    mesh.scale.x = 3;
    mesh.updateMatrixWorld(true);
    model.prepareLiveBrushEdit([mesh], true);
    model.rebuild(true);
    const uvAfterStretch = sampleResultMeshUvNear(model.getResultMeshForSync(), new THREE.Vector3(0, 1, 0));
    const spanAfterStretch = measureFaceUvSpanNear(model.getResultMeshForSync(), new THREE.Vector3(0, 1, 0));

    model.setUvStickToBrush(false);
    model.markBrushesDirty([brush.id]);
    model.rebuild(true);
    const uvAfterUnlock = sampleResultMeshUvNear(model.getResultMeshForSync(), new THREE.Vector3(0, 1, 0));
    const spanAfterUnlock = measureFaceUvSpanNear(model.getResultMeshForSync(), new THREE.Vector3(0, 1, 0));
    expect(uvAfterUnlock.u).toBeCloseTo(uvAfterStretch.u, 2);
    expect(uvAfterUnlock.v).toBeCloseTo(uvAfterStretch.v, 2);
    expect(spanAfterUnlock).toBeCloseTo(spanAfterStretch, 1);
  });

  it('keeps 45-degree UV orientation when scaling under Tex Lock', () => {
    const model = new SolidModel('Rot45Scale');
    model.setUvStickToBrush(true);
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    const normal = brush.faceNormalLocal(0);
    const uv = SurfaceUvMatrix.fromTrs(new THREE.Vector2(0, 0), normal, 45, 1, 1);
    brush.setFaceSurface(0, { textureId: 'rot.png', uv });
    model.rebuild(true);
    const before = sampleTopFaceUvCorners(model.getResultMeshForSync());

    const mesh = brush.mesh!;
    mesh.scale.set(2, 1, 1.5);
    mesh.updateMatrixWorld(true);
    model.prepareLiveBrushEdit([mesh], true);
    model.rebuild(true);
    const after = sampleTopFaceUvCorners(model.getResultMeshForSync());
    expect(uvEdgeAngle(after)).toBeCloseTo(uvEdgeAngle(before), 1);
  });

  it('restores original UV matrices when live scale snaps back to start size', () => {
    const model = new SolidModel('ScaleSnapBack');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    const mapping = createDefaultFaceTextureMapping('snap.png');
    mapping.align = 'face';
    mapping.scaleU = 2;
    mapping.offsetU = 0.25;
    brush.setFaceMapping(0, mapping);
    model.rebuild(true);
    const originalUv = brush.getFaceSurface(0).uv.clone();
    const mesh = brush.mesh!;

    // Stretch lock off: world-fixed UV rewrite during scale drag.
    mesh.scale.set(1.5, 1, 1);
    mesh.updateMatrixWorld(true);
    model.prepareLiveBrushEdit([mesh], { positionLock: true, stretchLock: false });
    expect(brush.getFaceSurface(0).uv.equals(originalUv, 1e-5)).toBe(false);

    // Snap back to the exact start scale — must restore baseline UVs, not keep
    // the intermediate rewritten matrix.
    mesh.scale.set(1, 1, 1);
    mesh.updateMatrixWorld(true);
    model.prepareLiveBrushEdit([mesh], { positionLock: true, stretchLock: false });
    expect(brush.getFaceSurface(0).uv.equals(originalUv, 1e-5)).toBe(true);

    model.finalizeAfterInteractiveEdit();
  });

  it('keeps unmodified brush UVs when another brush is duplicated', () => {
    const model = new SolidModel('DupNeighborUv');
    model.setUvStickToBrush(true);
    const kept = model.addBoxBrush(2, SolidOperation.Additive);
    const source = model.addBoxBrush(2, SolidOperation.Additive);
    kept.mesh!.position.set(-3, 0, 0);
    source.mesh!.position.set(3, 0, 0);
    kept.mesh!.updateMatrixWorld(true);
    source.mesh!.updateMatrixWorld(true);
    const keptMap = createDefaultFaceTextureMapping('kept.png');
    keptMap.scaleU = 2.5;
    keptMap.scaleV = 2.5;
    keptMap.offsetU = 0.2;
    kept.setFaceMapping(0, keptMap);
    model.rebuild(true);
    const uvBefore = sampleResultMeshUvNear(model.getResultMeshForSync(), new THREE.Vector3(-3, 1, 0));

    const clone = model.duplicateBrush(source.id, new THREE.Vector3(0, 2, 0));
    expect(clone).toBeTruthy();
    const uvAfter = sampleResultMeshUvNear(model.getResultMeshForSync(), new THREE.Vector3(-3, 1, 0));
    expect(uvAfter.u).toBeCloseTo(uvBefore.u, 4);
    expect(uvAfter.v).toBeCloseTo(uvBefore.v, 4);
  });
});

/**
 * Samples the UV attribute of the nearest result-mesh vertex to a world point.
 *
 * @param mesh Compiled solid result mesh.
 * @param worldPoint Query point near a surface.
 * @returns UV at the closest vertex.
 */
function sampleResultMeshUvNear(mesh: THREE.Mesh, worldPoint: THREE.Vector3): { u: number; v: number } {
  mesh.updateMatrixWorld(true);
  const inverse = mesh.matrixWorld.clone().invert();
  const localQuery = worldPoint.clone().applyMatrix4(inverse);
  const positions = mesh.geometry.getAttribute('position');
  const uvs = mesh.geometry.getAttribute('uv');
  let bestIndex = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  const candidate = new THREE.Vector3();
  for (let index = 0; index < positions.count; index++) {
    candidate.fromBufferAttribute(positions, index);
    const dist = candidate.distanceToSquared(localQuery);
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = index;
    }
  }
  return {
    u: uvs.getX(bestIndex),
    v: uvs.getY(bestIndex),
  };
}

/**
 * Copies result-mesh UV attribute values for equality checks.
 *
 * @param mesh Solid result mesh.
 * @returns Flat UV array.
 */
function cloneUvAttribute(mesh: THREE.Mesh): number[] {
  const uv = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute;
  return Array.from(uv.array as ArrayLike<number>);
}

/**
 * Samples UV of the top (+Y) face corners ordered by local XZ for angle tests.
 *
 * @param mesh Solid result mesh.
 * @returns Four UV corners roughly at min/max XZ of the top face.
 */
function sampleTopFaceUvCorners(mesh: THREE.Mesh): Array<{ u: number; v: number }> {
  mesh.updateMatrixWorld(true);
  const positions = mesh.geometry.getAttribute('position');
  const uvs = mesh.geometry.getAttribute('uv');
  const top: Array<{ x: number; z: number; u: number; v: number }> = [];
  const candidate = new THREE.Vector3();
  for (let index = 0; index < positions.count; index++) {
    candidate.fromBufferAttribute(positions, index);
    if (candidate.y < 0.9) continue;
    top.push({
      x: candidate.x,
      z: candidate.z,
      u: uvs.getX(index),
      v: uvs.getY(index),
    });
  }
  expect(top.length).toBeGreaterThan(3);
  const byXZ = (a: { x: number; z: number }, b: { x: number; z: number }) => a.x - b.x || a.z - b.z;
  top.sort(byXZ);
  return top.slice(0, 4).map((point) => ({ u: point.u, v: point.v }));
}

/**
 * Angle of the dominant UV edge between first two sampled corners.
 *
 * @param corners UV samples.
 * @returns Angle in degrees.
 */
function uvEdgeAngle(corners: Array<{ u: number; v: number }>): number {
  const du = corners[1]!.u - corners[0]!.u;
  const dv = corners[1]!.v - corners[0]!.v;
  return (Math.atan2(dv, du) * 180) / Math.PI;
}

/**
 * Measures UV span of the coplanar face region nearest a world point.
 *
 * @param mesh Solid result mesh.
 * @param worldPoint Query point near a surface.
 * @returns Sum of U and V spans for the nearest face region.
 */
function measureFaceUvSpanNear(mesh: THREE.Mesh, worldPoint: THREE.Vector3): number {
  mesh.updateMatrixWorld(true);
  const inverse = mesh.matrixWorld.clone().invert();
  const localQuery = worldPoint.clone().applyMatrix4(inverse);
  const positions = mesh.geometry.getAttribute('position');
  const uvs = mesh.geometry.getAttribute('uv');
  let bestIndex = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  const candidate = new THREE.Vector3();
  for (let index = 0; index < positions.count; index++) {
    candidate.fromBufferAttribute(positions, index);
    const dist = candidate.distanceToSquared(localQuery);
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = index;
    }
  }
  const triangleIndex = Math.floor(bestIndex / 3);
  let minU = Number.POSITIVE_INFINITY;
  let maxU = Number.NEGATIVE_INFINITY;
  let minV = Number.POSITIVE_INFINITY;
  let maxV = Number.NEGATIVE_INFINITY;
  for (let corner = 0; corner < 3; corner++) {
    const vertexIndex = triangleIndex * 3 + corner;
    minU = Math.min(minU, uvs.getX(vertexIndex));
    maxU = Math.max(maxU, uvs.getX(vertexIndex));
    minV = Math.min(minV, uvs.getY(vertexIndex));
    maxV = Math.max(maxV, uvs.getY(vertexIndex));
  }
  return maxU - minU + (maxV - minV);
}

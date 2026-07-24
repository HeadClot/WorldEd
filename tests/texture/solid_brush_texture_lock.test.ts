import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '../../src/solid/model/solid_model.js';
import { SolidOperation } from '../../src/solid/types/solid_operation.js';
import { createDefaultFaceTextureMapping } from '../../src/texture/face_texture_mapping.js';
import {
  lockFaceMappingForBrushTransform,
  lockSolidBrushTexturesToTransform
} from '../../src/texture/solid_brush_texture_lock.js';
import {
  projectWorldPositionToUv,
  resolveProjectionBasis
} from '../../src/texture/planar_uv_projector.js';

/**
 * Texture lock must keep solid-brush face UVs glued when brushes translate.
 */
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
    const uvBefore = sampleResultMeshUvNear(
      model.getResultMeshForSync(),
      new THREE.Vector3(0, 1, 0)
    );

    const mesh = brush.mesh!;
    mesh.position.x += 1.5;
    mesh.position.z -= 0.75;
    mesh.updateMatrixWorld(true);
    model.setUvStickToBrush(true);
    model.prepareLiveBrushEdit([mesh], true);
    model.rebuild(true);

    const uvAfter = sampleResultMeshUvNear(
      model.getResultMeshForSync(),
      new THREE.Vector3(mesh.position.x, 1, mesh.position.z)
    );
    expect(uvAfter.u).toBeCloseTo(uvBefore.u, 4);
    expect(uvAfter.v).toBeCloseTo(uvBefore.v, 4);
  });

  it('shifts offsets when translating without changing scale', () => {
    const mapping = createDefaultFaceTextureMapping();
    mapping.align = 'face';
    mapping.offsetU = 0;
    mapping.offsetV = 0;
    mapping.scaleU = 1;
    mapping.scaleV = 1;
    const model = new SolidModel('OffsetShift');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    brush.setFaceMapping(0, mapping);
    const prev = new THREE.Matrix4().identity();
    const next = new THREE.Matrix4().makeTranslation(2, 0, 0);
    const locked = lockFaceMappingForBrushTransform(
      mapping,
      brush.brush,
      0,
      prev,
      next
    );
    expect(locked.offsetU).not.toBeCloseTo(mapping.offsetU, 5);
    expect(locked.scaleU).toBeCloseTo(1, 5);
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
    const uvBefore = sampleResultMeshUvNear(
      model.getResultMeshForSync(),
      new THREE.Vector3(0, 1, 0)
    );

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
      new THREE.Vector3(mesh.position.x, 1, mesh.position.z)
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
    const uvBefore = sampleResultMeshUvNear(
      model.getResultMeshForSync(),
      new THREE.Vector3(0, 1, 0)
    );

    const mesh = brush.mesh!;
    mesh.position.x += 2;
    mesh.updateMatrixWorld(true);
    model.setUvStickToBrush(false);
    model.prepareLiveBrushEdit([mesh], false);
    model.rebuild(true);

    const uvAfter = sampleResultMeshUvNear(
      model.getResultMeshForSync(),
      new THREE.Vector3(2, 1, 0)
    );
    expect(Math.abs(uvAfter.u - uvBefore.u)).toBeGreaterThan(0.5);
  });
});

/**
 * Samples projected UV for a brush face at a local point.
 * @param brush Brush instance.
 * @param faceIndex Face index.
 * @param localPoint Local sample point.
 * @returns UV pair.
 */
function sampleBrushFaceUv(
  brush: {
    position: THREE.Vector3;
    rotation: THREE.Euler;
    scale: THREE.Vector3;
    brush: { planes: Array<{ normal: THREE.Vector3 }> };
    getSurfaceMapping: (index: number) => ReturnType<
      typeof createDefaultFaceTextureMapping
    >;
  },
  faceIndex: number,
  localPoint: THREE.Vector3
): { u: number; v: number } {
  const mapping = brush.getSurfaceMapping(faceIndex);
  const world = new THREE.Matrix4().compose(
    brush.position.clone(),
    new THREE.Quaternion().setFromEuler(brush.rotation),
    brush.scale.clone()
  );
  const worldPoint = localPoint.clone().applyMatrix4(world);
  const normal = brush.brush.planes[faceIndex].normal
    .clone()
    .applyMatrix3(new THREE.Matrix3().getNormalMatrix(world))
    .normalize();
  return projectWorldPositionToUv(
    worldPoint,
    resolveProjectionBasis(normal, mapping),
    mapping
  );
}

/**
 * Centroid of a brush face in local space.
 * @param solidBrush Brush geometry.
 * @param face Face record.
 * @returns Centroid.
 */
function faceLocalCentroid(
  solidBrush: {
    getFaceVertices: (face: unknown) => THREE.Vector3[];
  },
  face: unknown
): THREE.Vector3 {
  const vertices = solidBrush.getFaceVertices(face);
  const centroid = new THREE.Vector3();
  for (const vertex of vertices) {
    centroid.add(vertex);
  }
  return centroid.multiplyScalar(1 / Math.max(1, vertices.length));
}

/**
 * Samples the UV attribute of the nearest result-mesh vertex to a world point.
 * @param mesh Compiled solid result mesh.
 * @param worldPoint Query point near a surface.
 * @returns UV at the closest vertex.
 */
function sampleResultMeshUvNear(
  mesh: THREE.Mesh,
  worldPoint: THREE.Vector3
): { u: number; v: number } {
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
    v: uvs.getY(bestIndex)
  };
}

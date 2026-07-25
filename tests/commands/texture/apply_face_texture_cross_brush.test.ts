import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '../../../src/solid/model/solid_model.js';
import { SolidOperation } from '../../../src/solid/types/solid_operation.js';
import {
  createDefaultFaceTextureMapping,
  FaceTextureMapping,
  FaceTextureMappingTrs,
  getFaceTextureMappingTrs,
} from '../../../src/texture/uv/face_texture_mapping.js';
import { ApplyFaceTextureCommand } from '../../../src/commands/texture/apply_face_texture_command.js';
import { expandFaceSelectionIndices } from '../../../src/selection/face/solid_result_face_indices.js';
import { SOLID_TRIANGLE_SOURCES_USERDATA_KEY } from '../../../src/solid/model/solid_model.js';

/** Runtime TRS proxy fields used by texture mapping tests. */
type MappingWithTrs = FaceTextureMapping & FaceTextureMappingTrs;

/** Default TRS normal used by face texture mapping proxies. */
const DEFAULT_TRS_NORMAL = new THREE.Vector3(0, 1, 0);

/**
 * Reads TRS scale/offset from a mapping via the public TRS API.
 *
 * @param mapping Face texture mapping.
 * @returns TRS fields in meters-per-tile units.
 */
function mappingTrs(mapping: FaceTextureMapping): FaceTextureMappingTrs {
  return getFaceTextureMappingTrs(mapping, DEFAULT_TRS_NORMAL);
}

/**
 * Face texture apply must only rewrite the selected brush faces — never
 * coplanar neighbors after VMF-style multi-brush solids.
 */
describe('ApplyFaceTextureCommand cross-brush isolation', () => {
  it('does not change a neighboring coplanar brush mapping when editing one face', () => {
    const model = new SolidModel('CrossBrushUv');
    const left = model.addBoxBrush(2, SolidOperation.Additive);
    const right = model.addBoxBrush(2, SolidOperation.Additive);
    left.mesh!.position.set(-1, 0, 0);
    right.mesh!.position.set(1, 0, 0);
    left.mesh!.updateMatrixWorld(true);
    right.mesh!.updateMatrixWorld(true);
    const keptMap = createDefaultFaceTextureMapping('kept.png') as MappingWithTrs;
    keptMap.scaleU = 2.5;
    keptMap.scaleV = 2.5;
    keptMap.offsetU = 0.35;
    right.setFaceMapping(0, keptMap);
    model.rebuild(true);

    const rightBefore = right.getSurfaceMapping(0);
    const rightBeforeTrs = mappingTrs(rightBefore);
    const result = model.getResultMeshForSync();
    const sources =
      (result.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] as Array<{ brushId: string; surfaceIndex: number }>) ?? [];
    const leftSeed = sources.findIndex((source) => source.brushId === left.id);
    expect(leftSeed).toBeGreaterThanOrEqual(0);
    const leftFaces = expandFaceSelectionIndices(result, leftSeed);
    const edited = createDefaultFaceTextureMapping('edited.png') as MappingWithTrs;
    edited.scaleU = 4;
    edited.scaleV = 4;
    edited.offsetU = 0.1;
    new ApplyFaceTextureCommand(
      [{ mesh: result, triangleIndices: leftFaces, previousMapping: null }],
      edited,
    ).execute();

    const rightAfter = right.getSurfaceMapping(0);
    const rightAfterTrs = mappingTrs(rightAfter);
    expect(rightAfter.textureId).toBe(rightBefore.textureId);
    expect(rightAfterTrs.scaleU).toBeCloseTo(rightBeforeTrs.scaleU, 5);
    expect(rightAfterTrs.scaleV).toBeCloseTo(rightBeforeTrs.scaleV, 5);
    expect(rightAfterTrs.offsetU).toBeCloseTo(rightBeforeTrs.offsetU, 5);
    expect(left.getSurfaceMapping(0).textureId).toBe('edited.png');
  });

  it('keeps neighbor UVs after undo of a face edit', () => {
    const model = new SolidModel('CrossBrushUndo');
    const left = model.addBoxBrush(2, SolidOperation.Additive);
    const right = model.addBoxBrush(2, SolidOperation.Additive);
    left.mesh!.position.set(-1, 0, 0);
    right.mesh!.position.set(1, 0, 0);
    left.mesh!.updateMatrixWorld(true);
    right.mesh!.updateMatrixWorld(true);
    const keptMap = createDefaultFaceTextureMapping('keep.png') as MappingWithTrs;
    keptMap.scaleU = 3;
    right.setFaceMapping(0, keptMap);
    model.rebuild(true);
    const uvBefore = sampleResultMeshUvNear(model.getResultMeshForSync(), new THREE.Vector3(1, 1, 0));

    const result = model.getResultMeshForSync();
    const sources =
      (result.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] as Array<{ brushId: string; surfaceIndex: number }>) ?? [];
    const leftSeed = sources.findIndex((source) => source.brushId === left.id);
    const leftFaces = expandFaceSelectionIndices(result, leftSeed);
    const command = new ApplyFaceTextureCommand(
      [{ mesh: result, triangleIndices: leftFaces, previousMapping: null }],
      createDefaultFaceTextureMapping('temp.png'),
    );
    command.execute();
    command.undo();

    const uvAfter = sampleResultMeshUvNear(model.getResultMeshForSync(), new THREE.Vector3(1, 1, 0));
    expect(uvAfter.u).toBeCloseTo(uvBefore.u, 3);
    expect(uvAfter.v).toBeCloseTo(uvBefore.v, 3);
    expect(mappingTrs(right.getSurfaceMapping(0)).scaleU).toBeCloseTo(3, 3);
  });

  it('keeps neighbor triangle order and UVs after VMF-style offset brush UV edit and undo', () => {
    const model = new SolidModel('VmfStyleCrossBrushUv');
    const left = model.addBoxBrush(2, SolidOperation.Additive);
    const right = model.addBoxBrush(2, SolidOperation.Additive);
    left.mesh!.position.set(-12, 3, 7);
    right.mesh!.position.set(15, -4, -9);
    left.mesh!.updateMatrixWorld(true);
    right.mesh!.updateMatrixWorld(true);
    left.pullTransformFromMesh();
    right.pullTransformFromMesh();
    const keptMap = createDefaultFaceTextureMapping('neighbor.png') as MappingWithTrs;
    keptMap.scaleU = 2.25;
    keptMap.offsetU = 0.4;
    right.setFaceMapping(0, keptMap);
    model.rebuild(true);

    const result = model.getResultMeshForSync();
    const positionsBefore = captureAllPositions(result);
    const neighborUvBefore = sampleResultMeshUvNear(result, new THREE.Vector3(15, -3, -9));
    const sources =
      (result.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] as Array<{ brushId: string; surfaceIndex: number }>) ?? [];
    const leftSeed = sources.findIndex((source) => source.brushId === left.id);
    expect(leftSeed).toBeGreaterThanOrEqual(0);
    const leftFaces = expandFaceSelectionIndices(result, leftSeed);
    const edited = createDefaultFaceTextureMapping('edited.png') as MappingWithTrs;
    edited.scaleU = 5;
    edited.scaleV = 5;
    edited.offsetU = 0.2;
    const command = new ApplyFaceTextureCommand(
      [{ mesh: result, triangleIndices: leftFaces, previousMapping: null }],
      edited,
    );
    command.execute();

    expectPositionsUnchanged(result, positionsBefore);
    const neighborUvAfterEdit = sampleResultMeshUvNear(result, new THREE.Vector3(15, -3, -9));
    expect(neighborUvAfterEdit.u).toBeCloseTo(neighborUvBefore.u, 3);
    expect(neighborUvAfterEdit.v).toBeCloseTo(neighborUvBefore.v, 3);
    expect(right.getSurfaceMapping(0).textureId).toBe('neighbor.png');
    expect(mappingTrs(right.getSurfaceMapping(0)).scaleU).toBeCloseTo(2.25, 4);

    command.undo();
    expectPositionsUnchanged(result, positionsBefore);
    const neighborUvAfterUndo = sampleResultMeshUvNear(result, new THREE.Vector3(15, -3, -9));
    expect(neighborUvAfterUndo.u).toBeCloseTo(neighborUvBefore.u, 3);
    expect(neighborUvAfterUndo.v).toBeCloseTo(neighborUvBefore.v, 3);
    expect(mappingTrs(right.getSurfaceMapping(0)).scaleU).toBeCloseTo(2.25, 4);
    const uvAttr = result.geometry.getAttribute('uv');
    for (let index = 0; index < uvAttr.count; index++) {
      expect(Number.isFinite(uvAttr.getX(index))).toBe(true);
      expect(Number.isFinite(uvAttr.getY(index))).toBe(true);
    }
  });
});

/**
 * Samples UV of the nearest result-mesh vertex to a world point.
 *
 * @param mesh Result mesh.
 * @param worldPoint Query point.
 * @returns UV pair.
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
  return { u: uvs.getX(bestIndex), v: uvs.getY(bestIndex) };
}

/**
 * Captures a copy of all result-mesh positions.
 *
 * @param mesh Result mesh.
 * @returns Position floats.
 */
function captureAllPositions(mesh: THREE.Mesh): Float32Array {
  const positions = mesh.geometry.getAttribute('position');
  return new Float32Array(positions.array as ArrayLike<number>);
}

/**
 * Asserts result-mesh vertex positions match a prior capture (no triangle
 * reorder from material rebuild).
 *
 * @param mesh Result mesh.
 * @param expected Prior positions.
 */
function expectPositionsUnchanged(mesh: THREE.Mesh, expected: Float32Array): void {
  const positions = mesh.geometry.getAttribute('position');
  expect(positions.array.length).toBe(expected.length);
  for (let index = 0; index < expected.length; index++) {
    expect(positions.array[index]!).toBeCloseTo(expected[index]!, 5);
  }
}

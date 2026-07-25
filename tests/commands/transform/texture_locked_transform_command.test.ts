import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '../../../src/solid/model/solid_model.js';
import { SolidOperation } from '../../../src/solid/types/solid_operation.js';
import {
  createDefaultFaceTextureMapping,
  FaceTextureMapping,
  FaceTextureMappingTrs,
} from '../../../src/texture/uv/face_texture_mapping.js';
import { TranslateCommand } from '../../../src/commands/transform/translate_command.js';
import { TextureLockedTransformCommand } from '../../../src/commands/transform/texture_locked_transform_command.js';
import {
  captureTransformTextureState,
  restoreTransformTextureState,
} from '../../../src/commands/transform/transform_texture_state.js';
import { CommandStack } from '../../../src/commands/command_stack.js';

/** Runtime TRS proxy fields used by texture mapping tests. */
type MappingWithTrs = FaceTextureMapping & FaceTextureMappingTrs;

/**
 * With brush-local UV matrices, position lock leaves the matrix alone and baked
 * UVs stick. Undo still restores any captured surface state with pose.
 */
describe('TextureLockedTransformCommand', () => {
  it('keeps solid UV matrices stable under position lock and restores pose on undo', () => {
    const model = new SolidModel('UndoPosLock');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    const mapping = createDefaultFaceTextureMapping('locked.png') as MappingWithTrs;
    mapping.align = 'face';
    mapping.offsetU = 0.25;
    mapping.offsetV = -0.1;
    mapping.scaleU = 2;
    mapping.scaleV = 2;
    brush.setFaceMapping(0, mapping);
    model.rebuild(true);

    const mesh = brush.mesh!;
    const beforeTexture = captureTransformTextureState([mesh]);
    const beforeSurface = brush.getFaceSurface(0);
    const uvBefore = sampleResultMeshUvNear(model.getResultMeshForSync(), new THREE.Vector3(0, 1, 0));

    mesh.position.x += 2;
    mesh.updateMatrixWorld(true);
    model.prepareLiveBrushEdit([mesh], { positionLock: true, stretchLock: true });
    model.rebuild(true);
    const afterTexture = captureTransformTextureState([mesh]);
    // Brush-local stick: UV matrix rows stay the same under full lock.
    expect(brush.getFaceSurface(0).uv.equals(beforeSurface.uv, 1e-5)).toBe(true);
    const uvAfterMove = sampleResultMeshUvNear(model.getResultMeshForSync(), new THREE.Vector3(2, 1, 0));
    expect(uvAfterMove.u).toBeCloseTo(uvBefore.u, 3);
    expect(uvAfterMove.v).toBeCloseTo(uvBefore.v, 3);

    const stack = new CommandStack(16);
    stack.push(
      new TextureLockedTransformCommand(
        new TranslateCommand(
          [{ object: mesh, position: new THREE.Vector3(0, 0, 0), finalPosition: mesh.position.clone() }],
          new THREE.Vector3(2, 0, 0),
        ),
        beforeTexture,
        afterTexture,
      ),
    );

    stack.undo();
    model.refreshAfterHistoryChange();

    expect(mesh.position.x).toBeCloseTo(0, 5);
    const restoredUv = brush.getFaceSurface(0).uv;
    expect(restoredUv.u.x).toBeCloseTo(beforeSurface.uv.u.x, 4);
    expect(restoredUv.u.y).toBeCloseTo(beforeSurface.uv.u.y, 4);
    expect(restoredUv.u.z).toBeCloseTo(beforeSurface.uv.u.z, 4);
    expect(restoredUv.u.w).toBeCloseTo(beforeSurface.uv.u.w, 4);
    expect(restoredUv.v.x).toBeCloseTo(beforeSurface.uv.v.x, 4);
    expect(restoredUv.v.y).toBeCloseTo(beforeSurface.uv.v.y, 4);
    expect(restoredUv.v.z).toBeCloseTo(beforeSurface.uv.v.z, 4);
    expect(restoredUv.v.w).toBeCloseTo(beforeSurface.uv.v.w, 4);
    const afterUndoUv = sampleResultMeshUvNear(model.getResultMeshForSync(), new THREE.Vector3(0, 1, 0));
    expect(afterUndoUv.u).toBeCloseTo(uvBefore.u, 3);
    expect(afterUndoUv.v).toBeCloseTo(uvBefore.v, 3);
  });

  it('restores content vertex UVs when undoing under position lock', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.geometry.setAttribute(
      'uv',
      new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1]), 2),
    );
    const before = captureTransformTextureState([mesh]);
    const uvBefore = Array.from((mesh.geometry.getAttribute('uv') as THREE.BufferAttribute).array as Float32Array);

    mesh.position.x = 3;
    const uv = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute;
    const uvArray = uv.array as Float32Array;
    for (let i = 0; i < uvArray.length; i++) {
      uvArray[i] = (uvArray[i] ?? 0) + 0.5;
    }
    uv.needsUpdate = true;
    const after = captureTransformTextureState([mesh]);

    const stack = new CommandStack(8);
    stack.push(
      new TextureLockedTransformCommand(
        new TranslateCommand(
          [{ object: mesh, position: new THREE.Vector3(0, 0, 0), finalPosition: new THREE.Vector3(3, 0, 0) }],
          new THREE.Vector3(3, 0, 0),
        ),
        before,
        after,
      ),
    );
    stack.undo();

    expect(mesh.position.x).toBeCloseTo(0, 5);
    const uvAfter = Array.from((mesh.geometry.getAttribute('uv') as THREE.BufferAttribute).array as Float32Array);
    expect(uvAfter).toEqual(Array.from(uvBefore));
  });

  it('capture/restore is a no-op for empty selection', () => {
    const empty = captureTransformTextureState([]);
    expect(empty).toEqual([]);
    expect(() => restoreTransformTextureState([])).not.toThrow();
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

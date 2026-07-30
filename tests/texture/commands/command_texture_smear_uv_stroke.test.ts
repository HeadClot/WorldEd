import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import { CommandTextureSmearUvStroke } from '@/texture/commands/command_texture_smear_uv_stroke.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import {
  createDefaultFaceTextureMapping,
  FaceTextureMapping,
  FaceTextureMappingTrs,
  getFaceTextureMappingTrs,
} from '@/texture/uv/face_texture_mapping.js';
import { setFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';

/** Runtime TRS proxy fields used by texture mapping tests. */
type MappingWithTrs = FaceTextureMapping & FaceTextureMappingTrs;

/**
 * Reads meters-per-tile TRS from a mapping.
 *
 * @param mapping Face texture mapping.
 * @returns TRS fields.
 */
function mappingTrs(mapping: FaceTextureMapping): FaceTextureMappingTrs {
  return getFaceTextureMappingTrs(mapping, new THREE.Vector3(0, 1, 0));
}

/** Unit tests for UV smear undo/redo including solid brush mapping restore. */
describe('CommandTextureSmearUvStroke', () => {
  it('undo restores solid brush face mappings after a live smear stroke', () => {
    const model = new SolidModel('SmearUndo');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    const original = createDefaultFaceTextureMapping('original.png') as MappingWithTrs;
    original.scaleU = 4;
    original.scaleV = 4;
    original.offsetU = 0.1;
    for (let i = 0; i < brush.brush.faces.length; i++) {
      brush.setFaceMapping(i, original);
    }
    model.rebuild(true);
    const result = model.getResultMesh();

    const before = CommandTextureSmearUvStroke.captureMesh(result);
    expect(before.solidBrushUvs).not.toBeNull();

    const smeared = createDefaultFaceTextureMapping('smeared.png') as MappingWithTrs;
    smeared.scaleU = 1;
    smeared.scaleV = 1;
    for (let i = 0; i < brush.brush.faces.length; i++) {
      brush.setFaceMapping(i, smeared);
    }
    setFaceTextureMaps(result, [
      {
        triangleIndices: [0, 1],
        mapping: smeared,
      },
    ]);
    const after = CommandTextureSmearUvStroke.captureMesh(result);
    expect(after.solidBrushUvs![0]!.faceMappings[0]?.textureId).toBe('smeared.png');

    const stack = new CommandStack(16);
    stack.recordExecuted(new CommandTextureSmearUvStroke([before], [after]));
    expect(brush.getSurfaceMapping(0).textureId).toBe('smeared.png');

    stack.undo();
    expect(brush.getSurfaceMapping(0).textureId).toBe('original.png');
    expect(mappingTrs(brush.getSurfaceMapping(0)).scaleU).toBeCloseTo(4, 5);

    SolidModel.rebuildAllUnder(model.root);
    expect(brush.getSurfaceMapping(0).textureId).toBe('original.png');
    expect(mappingTrs(brush.getSurfaceMapping(0)).scaleU).toBeCloseTo(4, 5);

    stack.redo();
    expect(brush.getSurfaceMapping(0).textureId).toBe('smeared.png');
    SolidModel.rebuildAllUnder(model.root);
    expect(brush.getSurfaceMapping(0).textureId).toBe('smeared.png');
  });

  it('captures solid brush UVs in mesh snapshots', () => {
    const model = new SolidModel('CaptureSolid');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    const mapping = createDefaultFaceTextureMapping('cap.png') as MappingWithTrs;
    mapping.scaleU = 2.5;
    brush.setFaceMapping(0, mapping);
    model.rebuild(true);
    const snapshot = CommandTextureSmearUvStroke.captureMesh(model.getResultMesh());
    expect(snapshot.solidBrushUvs).not.toBeNull();
    expect(snapshot.solidBrushUvs!.length).toBe(1);
    expect(snapshot.solidBrushUvs![0]!.brushId).toBe(brush.id);
  });

  it('undo restores UV maps on a plain mesh without solid brushes', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(24).fill(0.25), 2));
    const before = CommandTextureSmearUvStroke.captureMesh(mesh);
    const uv = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute;
    (uv.array as Float32Array).fill(0.9);
    uv.needsUpdate = true;
    const after = CommandTextureSmearUvStroke.captureMesh(mesh);
    const stack = new CommandStack(8);
    stack.push(new CommandTextureSmearUvStroke([before], [after]));
    stack.undo();
    const restored = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute;
    expect(restored.getX(0)).toBeCloseTo(0.25, 5);
    stack.redo();
    expect((mesh.geometry.getAttribute('uv') as THREE.BufferAttribute).getX(0)).toBeCloseTo(0.9, 5);
  });
});

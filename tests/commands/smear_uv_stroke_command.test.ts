import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CommandStack } from '../../src/commands/command_stack.js';
import { SmearUvStrokeCommand } from '../../src/commands/smear_uv_stroke_command.js';
import { SolidModel } from '../../src/solid/model/solid_model.js';
import { SolidOperation } from '../../src/solid/types/solid_operation.js';
import { createDefaultFaceTextureMapping } from '../../src/texture/face_texture_mapping.js';
import { setFaceTextureMaps } from '../../src/texture/face_texture_storage.js';

/**
 * Unit tests for UV smear undo/redo including solid brush mapping restore.
 */
describe('SmearUvStrokeCommand', () => {
  it('undo restores solid brush face mappings after a live smear stroke', () => {
    const model = new SolidModel('SmearUndo');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    const original = createDefaultFaceTextureMapping('original.png');
    original.scaleU = 4;
    original.scaleV = 4;
    original.offsetU = 0.1;
    for (let i = 0; i < brush.brush.faces.length; i++) {
      brush.setFaceMapping(i, original);
    }
    model.rebuild(true);
    const result = model.getResultMesh();

    const before = SmearUvStrokeCommand.captureMesh(result);
    expect(before.solidBrushUvs).not.toBeNull();

    const smeared = createDefaultFaceTextureMapping('smeared.png');
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
    const after = SmearUvStrokeCommand.captureMesh(result);
    expect(after.solidBrushUvs![0].faceMappings[0]?.textureId).toBe('smeared.png');

    const stack = new CommandStack(16);
    stack.recordExecuted(new SmearUvStrokeCommand([before], [after]));
    expect(brush.getSurfaceMapping(0).textureId).toBe('smeared.png');

    stack.undo();
    expect(brush.getSurfaceMapping(0).textureId).toBe('original.png');
    expect(brush.getSurfaceMapping(0).scaleU).toBeCloseTo(4, 5);

    // History handler rebuilds solids from brush maps after every undo.
    SolidModel.rebuildAllUnder(model.root);
    expect(brush.getSurfaceMapping(0).textureId).toBe('original.png');
    expect(brush.getSurfaceMapping(0).scaleU).toBeCloseTo(4, 5);

    stack.redo();
    expect(brush.getSurfaceMapping(0).textureId).toBe('smeared.png');
    SolidModel.rebuildAllUnder(model.root);
    expect(brush.getSurfaceMapping(0).textureId).toBe('smeared.png');
  });

  it('captures solid brush UVs in mesh snapshots', () => {
    const model = new SolidModel('CaptureSolid');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    const mapping = createDefaultFaceTextureMapping('cap.png');
    mapping.scaleU = 2.5;
    brush.setFaceMapping(0, mapping);
    model.rebuild(true);
    const snapshot = SmearUvStrokeCommand.captureMesh(model.getResultMesh());
    expect(snapshot.solidBrushUvs).not.toBeNull();
    expect(snapshot.solidBrushUvs!.length).toBe(1);
    expect(snapshot.solidBrushUvs![0].brushId).toBe(brush.id);
  });

  it('undo restores UV maps on a plain mesh without solid brushes', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(24).fill(0.25), 2));
    const before = SmearUvStrokeCommand.captureMesh(mesh);
    const uv = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute;
    (uv.array as Float32Array).fill(0.9);
    uv.needsUpdate = true;
    const after = SmearUvStrokeCommand.captureMesh(mesh);
    const stack = new CommandStack(8);
    stack.push(new SmearUvStrokeCommand([before], [after]));
    stack.undo();
    const restored = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute;
    expect(restored.getX(0)).toBeCloseTo(0.25, 5);
    stack.redo();
    expect((mesh.geometry.getAttribute('uv') as THREE.BufferAttribute).getX(0)).toBeCloseTo(0.9, 5);
  });
});

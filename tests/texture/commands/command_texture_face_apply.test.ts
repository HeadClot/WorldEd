import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CommandTextureFaceApply } from '@/texture/commands/command_texture_face_apply.js';
import { buildTargetsFromMeshes } from '@/texture/uv/face_texture_applier.js';
import {
  createDefaultFaceTextureMapping,
  FaceTextureMapping,
  FaceTextureMappingTrs,
  getFaceTextureMappingTrs,
} from '@/texture/uv/face_texture_mapping.js';
import { getFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';

/** Runtime TRS proxy fields used by texture mapping tests. */
type MappingWithTrs = FaceTextureMapping & FaceTextureMappingTrs;

describe('CommandTextureFaceApply', () => {
  it('should apply mapping on execute and restore on undo', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.position.set(0, 0.5, 0);
    mesh.updateMatrixWorld(true);
    const targets = buildTargetsFromMeshes([mesh]);
    const mapping = createDefaultFaceTextureMapping() as MappingWithTrs;
    mapping.align = 'floor';
    mapping.scaleU = 2;
    const command = new CommandTextureFaceApply(targets, mapping);
    command.execute();
    expect(getFaceTextureMaps(mesh).length).toBeGreaterThan(0);
    const applied = getFaceTextureMaps(mesh)[0]!.mapping;
    expect(getFaceTextureMappingTrs(applied, new THREE.Vector3(0, 1, 0)).scaleU).toBe(2);
    command.undo();
    expect(getFaceTextureMaps(mesh).length).toBe(0);
  });
});

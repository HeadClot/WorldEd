import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { CommandTextureAssignSurface } from '@/texture/commands/command_texture_assign_surface.js';
import { buildTargetsFromMeshes, initializeMeshTextureUVs } from '@/texture/uv/face_texture_applier.js';
import { getFaceTextureMaps, setFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';
import {
  cloneFaceTextureMapping,
  FaceTextureMapping,
  FaceTextureMappingTrs,
  getFaceTextureMappingTrs,
} from '@/texture/uv/face_texture_mapping.js';
import { createContentMaterial } from '@/materials/factory_content_material.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import { setStateTexturePaintForTests, StateTexturePaint } from '@/texture/paint/state_texture_paint.js';
import { setTextureMapCacheForTests, TextureMapCache } from '@/texture/library/texture_map_cache.js';

/** Runtime TRS proxy fields used by texture mapping tests. */
type MappingWithTrs = FaceTextureMapping & FaceTextureMappingTrs;

describe('CommandTextureAssignSurface', () => {
  beforeEach(() => {
    setStateTexturePaintForTests(new StateTexturePaint());
    setTextureMapCacheForTests(new TextureMapCache());
  });

  afterEach(() => {
    setStateTexturePaintForTests(null);
    setTextureMapCacheForTests(null);
  });

  it('should assign texture id on execute and restore on undo', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), createContentMaterial(0x888888));
    mesh.position.set(0, 0.5, 0);
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh, DEFAULT_CHECKER_TEXTURE_ID);
    const targets = buildTargetsFromMeshes([mesh]);
    const command = new CommandTextureAssignSurface(targets, 'walls/brick.png');
    command.execute();
    const after = getFaceTextureMaps(mesh);
    expect(after.length).toBeGreaterThan(0);
    after.forEach((entry) => {
      expect(entry.mapping.textureId).toBe('walls/brick.png');
    });
    command.undo();
    const restored = getFaceTextureMaps(mesh);
    restored.forEach((entry) => {
      expect(entry.mapping.textureId).toBe(DEFAULT_CHECKER_TEXTURE_ID);
    });
  });

  it('should preserve UV scale when only the texture id changes', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), createContentMaterial(0x888888));
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh, DEFAULT_CHECKER_TEXTURE_ID);
    const mapsBefore = getFaceTextureMaps(mesh).map((entry) => {
      const mapping = cloneFaceTextureMapping(entry.mapping) as MappingWithTrs;
      mapping.scaleU = 2.5;
      return {
        triangleIndices: entry.triangleIndices.slice(),
        mapping,
      };
    });
    setFaceTextureMaps(mesh, mapsBefore);
    const targets = buildTargetsFromMeshes([mesh]);
    const command = new CommandTextureAssignSurface(targets, 'floor.png');
    command.execute();
    getFaceTextureMaps(mesh).forEach((entry) => {
      expect(entry.mapping.textureId).toBe('floor.png');
      expect(getFaceTextureMappingTrs(entry.mapping, new THREE.Vector3(0, 1, 0)).scaleU).toBe(2.5);
    });
  });
});

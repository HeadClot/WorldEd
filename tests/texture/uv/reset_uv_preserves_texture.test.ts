import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { CommandTextureFaceApply } from '@/texture/commands/command_texture_face_apply.js';
import {
  applyTextureIdToTargets,
  buildTargetsFromMeshes,
  initializeMeshTextureUVs,
  resetUvParamsOnTargets,
} from '@/texture/uv/face_texture_applier.js';
import { getFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';
import { computeRegionWorldNormal } from '@/texture/uv/planar_uv_projector.js';
import { createContentMaterial } from '@/materials/factory_content_material.js';
import { createDefaultFaceTextureMapping } from '@/texture/uv/face_texture_mapping.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import { setStateTexturePaintForTests, StateTexturePaint } from '@/texture/paint/state_texture_paint.js';
import { setTextureMapCacheForTests, TextureMapCache } from '@/texture/library/texture_map_cache.js';

describe('reset UV preserves texture assignment', () => {
  beforeEach(() => {
    setStateTexturePaintForTests(new StateTexturePaint());
    setTextureMapCacheForTests(new TextureMapCache());
  });

  afterEach(() => {
    setStateTexturePaintForTests(null);
    setTextureMapCacheForTests(null);
  });

  it('should reset scale/offset while keeping texture id', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), createContentMaterial(0x888888));
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh, DEFAULT_CHECKER_TEXTURE_ID);
    const targets = buildTargetsFromMeshes([mesh]);
    applyTextureIdToTargets(targets, 'walls/brick.png');
    const scaled = createDefaultFaceTextureMapping('walls/brick.png');
    scaled.scaleU = 4;
    scaled.offsetV = 0.5;
    new CommandTextureFaceApply(targets, scaled).execute();
    expect(getFaceTextureMaps(mesh)[0]!.mapping.scaleU).toBe(4);
    resetUvParamsOnTargets(targets);
    const maps = getFaceTextureMaps(mesh);
    maps.forEach((entry) => {
      expect(entry.mapping.textureId).toBe('walls/brick.png');
      expect(entry.mapping.scaleU!).toBe(1);
      expect(entry.mapping.offsetV!).toBeCloseTo(0, 5);
      expect(entry.mapping.align).toBe('auto');
    });
  });

  it('should support undoable resetUvOnly command without clearing texture', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), createContentMaterial(0x888888));
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh, DEFAULT_CHECKER_TEXTURE_ID);
    const targets = buildTargetsFromMeshes([mesh]);
    applyTextureIdToTargets(targets, 'floor.png');
    const scaled = createDefaultFaceTextureMapping('floor.png');
    scaled.scaleU = 3;
    new CommandTextureFaceApply(targets, scaled).execute();
    const reset = new CommandTextureFaceApply(targets, createDefaultFaceTextureMapping(), {
      resetUvOnly: true,
    });
    reset.execute();
    expect(getFaceTextureMaps(mesh)[0]!.mapping.textureId).toBe('floor.png');
    expect(getFaceTextureMaps(mesh)[0]!.mapping.scaleU).toBe(1);
    reset.undo();
    expect(getFaceTextureMaps(mesh)[0]!.mapping.textureId).toBe('floor.png');
    expect(getFaceTextureMaps(mesh)[0]!.mapping.scaleU).toBeCloseTo(3, 4);
  });

  it('should restore cylinder side unwrap on full-mesh UV reset', () => {
    const segments = 8;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2, segments), createContentMaterial(0x888888));
    mesh.position.set(0, 1, 0);
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh, DEFAULT_CHECKER_TEXTURE_ID);
    const targets = buildTargetsFromMeshes([mesh]);
    applyTextureIdToTargets(targets, 'brick.png');
    targets.forEach((target) => {
      const mapping = createDefaultFaceTextureMapping('brick.png');
      mapping.scaleU = 4;
      mapping.offsetU = 0;
      new CommandTextureFaceApply([target], mapping).execute();
    });
    resetUvParamsOnTargets(targets);
    const maps = getFaceTextureMaps(mesh);
    maps.forEach((entry) => {
      expect(entry.mapping.textureId).toBe('brick.png');
      expect(entry.mapping.scaleU!).toBe(1);
    });
    const uniqueSideOffsets = new Set(
      maps
        .filter((entry) => {
          const normal = computeRegionWorldNormal(mesh, entry.triangleIndices);
          return Math.abs(normal.y) <= 0.35;
        })
        .map((entry) => entry.mapping.uv.u.w.toFixed(5)),
    );
    expect(uniqueSideOffsets.size).toBeGreaterThanOrEqual(segments - 3);
  });
});

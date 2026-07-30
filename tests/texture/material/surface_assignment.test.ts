import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { BuilderCsgMesh } from '@/csg/builder_csg_mesh.js';
import { createContentMaterial } from '@/materials/factory_content_material.js';
import {
  applyTextureIdToTargets,
  buildTargetsFromMeshes,
  initializeMeshTextureUVs,
} from '@/texture/uv/face_texture_applier.js';
import { getFaceTextureMaps } from '@/texture/uv/face_texture_storage.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import { setStateTexturePaintForTests, StateTexturePaint } from '@/texture/paint/state_texture_paint.js';
import { setTextureMapCacheForTests, TextureMapCache } from '@/texture/library/texture_map_cache.js';

describe('surface texture assignment', () => {
  beforeEach(() => {
    setStateTexturePaintForTests(new StateTexturePaint());
    setTextureMapCacheForTests(new TextureMapCache());
  });

  afterEach(() => {
    setStateTexturePaintForTests(null);
    setTextureMapCacheForTests(null);
  });

  it('should store texture ids on face maps when assigning', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), createContentMaterial(0xaaaaaa));
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh, DEFAULT_CHECKER_TEXTURE_ID);
    const targets = buildTargetsFromMeshes([mesh]);
    applyTextureIdToTargets(targets, 'metal.png');
    const maps = getFaceTextureMaps(mesh);
    expect(maps.length).toBeGreaterThan(0);
    maps.forEach((entry) => {
      expect(entry.mapping.textureId).toBe('metal.png');
    });
  });

  it('should carry texture ids through CSG mesh rebuild', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), createContentMaterial(0xcccccc));
    mesh.position.set(0, 1, 0);
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh, DEFAULT_CHECKER_TEXTURE_ID);
    applyTextureIdToTargets(buildTargetsFromMeshes([mesh]), 'brick.png');
    const builder = new BuilderCsgMesh();
    const polygons = builder.meshToPolygons(mesh);
    expect(polygons.length).toBeGreaterThan(0);
    polygons.forEach((polygon) => {
      expect(polygon.getSurfaceMapping()?.textureId).toBe('brick.png');
    });
    const rebuilt = builder.polygonsToMesh(polygons, 0xcccccc, 'Rebuilt');
    const maps = getFaceTextureMaps(rebuilt);
    expect(maps.length).toBeGreaterThan(0);
    maps.forEach((entry) => {
      expect(entry.mapping.textureId).toBe('brick.png');
    });
  });

  it('should tag new fill surfaces with the last paint texture id', () => {
    const paint = new StateTexturePaint();
    paint.setLastTextureId('fill_paint.png');
    setStateTexturePaintForTests(paint);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), createContentMaterial(0xffffff));
    initializeMeshTextureUVs(mesh);
    const maps = getFaceTextureMaps(mesh);
    expect(maps.length).toBeGreaterThan(0);
    maps.forEach((entry) => {
      expect(entry.mapping.textureId).toBe('fill_paint.png');
    });
  });

  it('should rebake stable per-face UVs after CSG rebuild (not one blended plane)', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), createContentMaterial(0xdddddd));
    mesh.position.set(0, 1, 0);
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh, DEFAULT_CHECKER_TEXTURE_ID);
    applyTextureIdToTargets(buildTargetsFromMeshes([mesh]), 'brick.png');
    const builder = new BuilderCsgMesh();
    const rebuilt = builder.polygonsToMesh(builder.meshToPolygons(mesh), 0xdddddd, 'UvCheck');
    const maps = getFaceTextureMaps(rebuilt);
    expect(maps.length).toBeGreaterThanOrEqual(6);
    const uv = rebuilt.geometry.getAttribute('uv') as THREE.BufferAttribute;
    expect(uv).toBeTruthy();
    let maxAbs = 0;
    for (let i = 0; i < uv.count; i++) {
      maxAbs = Math.max(maxAbs, Math.abs(uv.getX(i)), Math.abs(uv.getY(i)));
      expect(Number.isFinite(uv.getX(i))).toBe(true);
      expect(Number.isFinite(uv.getY(i))).toBe(true);
    }
    // 2m box at 1m/tile scale: UVs should stay near a few tiles, not thousands.
    expect(maxAbs).toBeLessThan(20);
  });
});

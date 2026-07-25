import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { initializeMeshTextureUVs } from '../../../src/texture/uv/face_texture_applier.js';
import { getFaceTextureMaps } from '../../../src/texture/uv/face_texture_storage.js';
import { applyCylinderSideUnwrapOffsets } from '../../../src/texture/uv/cylinder_side_unwrap.js';
import {
  cloneFaceTextureMapEntry,
  createDefaultFaceTextureMapping,
  createFaceTextureMappingFromTrs,
} from '../../../src/texture/uv/face_texture_mapping.js';
import { computeRegionWorldNormal, splitMeshIntoCoplanarRegions } from '../../../src/texture/uv/planar_uv_projector.js';
import { captureGeometrySourceIfNeeded } from '../../../src/texture/uv/geometry_source.js';

describe('cylinder_side_unwrap', () => {
  it('should assign increasing offsetU around cylinder sides', () => {
    const segments = 12;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2, segments));
    mesh.position.set(0, 1, 0);
    mesh.updateMatrixWorld(true);
    captureGeometrySourceIfNeeded(mesh);
    const regions = splitMeshIntoCoplanarRegions(mesh);
    const entries = regions.map((triangleIndices) => {
      const normal = computeRegionWorldNormal(mesh, triangleIndices);
      return {
        triangleIndices,
        mapping: createFaceTextureMappingFromTrs(
          createDefaultFaceTextureMapping().textureId,
          normal,
          { scaleU: 1, scaleV: 1, offsetU: 0, offsetV: 0, rotationDeg: 0 },
          'face',
        ),
      };
    });
    applyCylinderSideUnwrapOffsets(mesh, entries);
    const sideOffsets = entries
      .filter((entry) => {
        const normal = computeRegionWorldNormal(mesh, entry.triangleIndices);
        return Math.abs(normal.y) <= 0.35;
      })
      .map((entry) => entry.mapping.uv.u.w);
    expect(sideOffsets.length).toBe(segments);
    const unique = new Set(sideOffsets.map((value) => value.toFixed(5)));
    expect(unique.size).toBe(segments);
  });

  it('should leave box face offsets untouched', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    mesh.updateMatrixWorld(true);
    const regions = splitMeshIntoCoplanarRegions(mesh);
    const entries = regions.map((triangleIndices) =>
      cloneFaceTextureMapEntry({
        triangleIndices,
        mapping: createDefaultFaceTextureMapping(),
      }),
    );
    applyCylinderSideUnwrapOffsets(mesh, entries);
    entries.forEach((entry) => {
      expect(entry.mapping.offsetU).toBeCloseTo(0, 5);
    });
  });

  it('should persist unwrap offsets through mesh initialization', () => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 8));
    mesh.position.set(2, 0.5, -1);
    mesh.updateMatrixWorld(true);
    initializeMeshTextureUVs(mesh);
    const maps = getFaceTextureMaps(mesh);
    const sideMaps = maps.filter((entry) => {
      const normal = computeRegionWorldNormal(mesh, entry.triangleIndices);
      return Math.abs(normal.y) <= 0.35;
    });
    expect(sideMaps.length).toBe(8);
    const offsets = sideMaps.map((entry) => entry.mapping.offsetU);
    const unique = new Set(offsets.map((value) => value.toFixed(5)));
    expect(unique.size).toBe(8);
  });
});

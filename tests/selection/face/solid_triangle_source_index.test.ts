import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SOLID_TRIANGLE_SOURCES_USERDATA_KEY } from '@/solid/model/solid_model_keys.js';
import {
  buildFacePickRegionKey,
  findSameSolidBrushSurfaceIndicesFast,
} from '@/selection/face/solid_triangle_source_index.js';

describe('solid_triangle_source_index', () => {
  it('returns every triangle that shares the seed brush face', () => {
    const mesh = createSolidResultMesh([
      { brushId: 'a', surfaceIndex: 0 },
      { brushId: 'a', surfaceIndex: 0 },
      { brushId: 'a', surfaceIndex: 1 },
      { brushId: 'b', surfaceIndex: 0 },
      { brushId: 'a', surfaceIndex: 0 },
    ]);
    const indices = findSameSolidBrushSurfaceIndicesFast(mesh, 0);
    expect(indices).toEqual([0, 1, 4]);
  });

  it('reuses the cached multimap for repeated expansions on the same sources', () => {
    const sources = [
      { brushId: 'wall', surfaceIndex: 2 },
      { brushId: 'wall', surfaceIndex: 2 },
      { brushId: 'floor', surfaceIndex: 0 },
    ];
    const mesh = createSolidResultMesh(sources);
    const first = findSameSolidBrushSurfaceIndicesFast(mesh, 1);
    const second = findSameSolidBrushSurfaceIndicesFast(mesh, 0);
    expect(first).toBe(second);
    expect(first).toEqual([0, 1]);
  });

  it('builds a stable drag region key for solid brush faces', () => {
    const mesh = createSolidResultMesh([
      { brushId: 'brush-9', surfaceIndex: 3 },
      { brushId: 'brush-9', surfaceIndex: 3 },
    ]);
    const first = buildFacePickRegionKey(mesh, 0);
    const second = buildFacePickRegionKey(mesh, 1);
    expect(first).toBe(second);
    expect(first).toContain('brush-9');
  });
});

/**
 * Creates a mesh with solid triangle source userData for indexing tests.
 *
 * @param sources Per-triangle solid sources.
 * @returns Mesh with sources attached.
 */
function createSolidResultMesh(sources: Array<{ brushId: string; surfaceIndex: number }>): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BufferGeometry());
  mesh.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] = sources;
  return mesh;
}

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidBrushFactory } from '../../src/solid/brush/solid_brush_factory.js';
import { SolidBrushInstance } from '../../src/solid/model/solid_brush_instance.js';
import { SolidCsgCompiler } from '../../src/solid/algorithm/solid_csg_compiler.js';
import { SolidOperation } from '../../src/solid/types/solid_operation.js';
import { SolidBrushMeshChunkBuilder } from '../../src/solid/mesh/solid_brush_mesh_chunk.js';
import { SolidMeshChunkCache } from '../../src/solid/mesh/solid_mesh_chunk_cache.js';
import { SolidResultAssembler } from '../../src/solid/mesh/solid_result_assembler.js';
import { createDefaultFaceTextureMapping } from '../../src/texture/face_texture_mapping.js';
import { SolidModel } from '../../src/solid/model/solid_model.js';

/**
 * Builds a box brush instance at a position.
 * @param id Brush id.
 * @param size Edge length.
 * @param position Optional position.
 * @returns Brush instance.
 */
function makeBox(
  id: string,
  size: number,
  position?: THREE.Vector3
): SolidBrushInstance {
  const brush = SolidBrushFactory.createCenteredBox(size, size, size);
  const instance = new SolidBrushInstance(
    id,
    id,
    brush,
    SolidOperation.Additive
  );
  if (position) instance.position.copy(position);
  return instance;
}

/**
 * Unit tests for per-brush mesh chunks and incremental result assembly.
 */
describe('Solid mesh chunk cache', () => {
  it('rebuilds only dirty brush chunks while assembly matches full remesh', () => {
    const brushes = [
      makeBox('a', 2, new THREE.Vector3(0, 0, 0)),
      makeBox('b', 2, new THREE.Vector3(5, 0, 0)),
      makeBox('c', 2, new THREE.Vector3(10, 0, 0))
    ];
    const compiler = new SolidCsgCompiler();
    const cache = new SolidMeshChunkCache();
    const builder = new SolidBrushMeshChunkBuilder();
    const identity = new THREE.Matrix4();
    compiler.compile(brushes, { forceFull: true });
    for (const brushId of compiler.getLastUpdateBrushIds()) {
      const polygons = compiler.getCachedPolygons(brushId) ?? [];
      cache.set(
        brushId,
        builder.build(
          polygons,
          () => createDefaultFaceTextureMapping(),
          { stickToBrush: false, resultWorldMatrix: identity }
        )
      );
    }
    const before = SolidResultAssembler.assemble(
      compiler.getLastBrushOrder(),
      cache
    );
    expect(before.triangleCount).toBeGreaterThan(0);

    brushes[1].position.x += 0.5;
    compiler.compile(brushes, { dirtyBrushIds: ['b'] });
    const updatedIds = compiler.getLastUpdateBrushIds();
    expect(updatedIds).toContain('b');
    expect(updatedIds.length).toBeLessThan(brushes.length);
    for (const brushId of updatedIds) {
      cache.set(
        brushId,
        builder.build(
          compiler.getCachedPolygons(brushId) ?? [],
          () => createDefaultFaceTextureMapping(),
          { stickToBrush: false, resultWorldMatrix: identity }
        )
      );
    }
    const partial = SolidResultAssembler.assemble(
      compiler.getLastBrushOrder(),
      cache
    );
    const fullCompiler = new SolidCsgCompiler();
    fullCompiler.compile(brushes, { forceFull: true });
    const fullCache = new SolidMeshChunkCache();
    for (const brushId of fullCompiler.getLastUpdateBrushIds()) {
      fullCache.set(
        brushId,
        builder.build(
          fullCompiler.getCachedPolygons(brushId) ?? [],
          () => createDefaultFaceTextureMapping(),
          { stickToBrush: false, resultWorldMatrix: identity }
        )
      );
    }
    const full = SolidResultAssembler.assemble(
      fullCompiler.getLastBrushOrder(),
      fullCache
    );
    expect(partial.triangleCount).toBe(full.triangleCount);
    expect(partial.positions.length).toBe(full.positions.length);
    for (let index = 0; index < partial.positions.length; index++) {
      expect(partial.positions[index]).toBeCloseTo(full.positions[index], 5);
    }
  });

  it('live transform of one brush among many keeps result geometry valid', () => {
    const model = new SolidModel('ChunkPerf');
    const spacing = 4;
    const count = 48;
    for (let index = 0; index < count; index++) {
      const brush = model.addBoxBrush(2, SolidOperation.Additive);
      brush.position.set((index % 8) * spacing, 0, Math.floor(index / 8) * spacing);
      brush.pushTransformToMesh();
    }
    model.markDirty();
    model.rebuild(true);
    const first = model.getBrushes()[0];
    expect(first.mesh).toBeTruthy();
    first.mesh!.position.x += 0.35;
    model.syncBrushesFromScene();
    model.rebuildLive();
    const position = model.getResultMesh().geometry.getAttribute('position');
    expect(position.count).toBeGreaterThan(count * 12);
    const uv = model.getResultMesh().geometry.getAttribute('uv');
    expect(uv).toBeDefined();
    expect(uv.count).toBe(position.count);
  });
});

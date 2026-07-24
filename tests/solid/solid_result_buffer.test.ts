import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidBrushFactory } from '../../src/solid/brush/solid_brush_factory.js';
import { SolidBrushInstance } from '../../src/solid/model/solid_brush_instance.js';
import { SolidCsgCompiler } from '../../src/solid/algorithm/solid_csg_compiler.js';
import { SolidOperation } from '../../src/solid/types/solid_operation.js';
import { SolidBrushMeshChunkBuilder } from '../../src/solid/mesh/solid_brush_mesh_chunk.js';
import { SolidMeshChunkCache } from '../../src/solid/mesh/solid_mesh_chunk_cache.js';
import { SolidResultBuffer } from '../../src/solid/mesh/solid_result_buffer.js';
import { createDefaultFaceTextureMapping } from '../../src/texture/face_texture_mapping.js';
import { SolidModel } from '../../src/solid/model/solid_model.js';

/**
 * Builds a positioned additive box brush.
 *
 * @param id Brush id.
 * @param size Edge length.
 * @param position Center position.
 * @returns Brush instance.
 */
function makeBox(id: string, size: number, position: THREE.Vector3): SolidBrushInstance {
  const brush = SolidBrushFactory.createCenteredBox(size, size, size);
  const instance = new SolidBrushInstance(id, id, brush, SolidOperation.Additive);
  instance.position.copy(position);
  return instance;
}

/**
 * Rebuilds mesh chunks for the given brush ids from compiler caches.
 *
 * @param compiler Compiler with polygon cache.
 * @param chunkCache Destination chunk cache.
 * @param builder Chunk builder.
 * @param brushIds Brush ids to remesh.
 */
function rebuildChunks(
  compiler: SolidCsgCompiler,
  chunkCache: SolidMeshChunkCache,
  builder: SolidBrushMeshChunkBuilder,
  brushIds: string[],
): void {
  const identity = new THREE.Matrix4();
  for (const brushId of brushIds) {
    chunkCache.set(
      brushId,
      builder.build(compiler.getCachedPolygons(brushId) ?? [], () => createDefaultFaceTextureMapping(), {
        stickToBrush: false,
        resultWorldMatrix: identity,
      }),
    );
  }
}

/** Unit tests for segmented solid result buffers and dirty-range patches. */
describe('SolidResultBuffer', () => {
  it('patches only dirty brush slices when vertex counts stay stable', () => {
    const brushes = [
      makeBox('a', 2, new THREE.Vector3(0, 0, 0)),
      makeBox('b', 2, new THREE.Vector3(6, 0, 0)),
      makeBox('c', 2, new THREE.Vector3(12, 0, 0)),
    ];
    const compiler = new SolidCsgCompiler();
    const chunkCache = new SolidMeshChunkCache();
    const builder = new SolidBrushMeshChunkBuilder();
    const buffer = new SolidResultBuffer();
    compiler.compile(brushes, { forceFull: true, skipPolygonAssembly: true });
    rebuildChunks(compiler, chunkCache, builder, compiler.getLastUpdateBrushIds());
    buffer.rebuildFull(compiler.getLastBrushOrder(), chunkCache);
    const before = buffer.getTriangleSources().map((source) => source.brushId);

    brushes[1].position.x += 0.4;
    compiler.compile(brushes, {
      dirtyBrushIds: ['b'],
      skipPolygonAssembly: true,
    });
    const dirty = compiler.getLastUpdateBrushIds();
    expect(dirty).toContain('b');
    rebuildChunks(compiler, chunkCache, builder, dirty);
    const patched = buffer.tryPatchDirty(dirty, compiler.getLastBrushOrder(), chunkCache);
    expect(patched).toBe(true);
    expect(buffer.wasLastWritePartial()).toBe(true);
    expect(buffer.getLastUpdateRanges().length).toBeGreaterThan(0);
    expect(buffer.getTriangleSources().map((source) => source.brushId)).toEqual(before);

    const full = new SolidResultBuffer();
    full.rebuildFull(compiler.getLastBrushOrder(), chunkCache);
    const geometry = new THREE.BufferGeometry();
    buffer.uploadToGeometry(geometry);
    const fullGeometry = new THREE.BufferGeometry();
    full.uploadToGeometry(fullGeometry);
    const patchedPos = geometry.getAttribute('position').array as Float32Array;
    const fullPos = fullGeometry.getAttribute('position').array as Float32Array;
    expect(patchedPos.length).toBe(fullPos.length);
    for (let index = 0; index < patchedPos.length; index++) {
      expect(patchedPos[index]).toBeCloseTo(fullPos[index], 5);
    }
  });

  it('live-moves one brush among many without dropping result triangles', () => {
    const model = new SolidModel('BufferLive');
    const spacing = 5;
    for (let index = 0; index < 36; index++) {
      const brush = model.addBoxBrush(2, SolidOperation.Additive);
      brush.position.set((index % 6) * spacing, 0, Math.floor(index / 6) * spacing);
      brush.pushTransformToMesh();
    }
    model.markDirty();
    model.rebuild(true);
    const beforeCount = model.getResultMesh().geometry.getAttribute('position').count;
    const mover = model.getBrushes()[3];
    mover.mesh!.position.x += 0.2;
    model.syncBrushesFromScene();
    model.rebuildLive();
    const afterCount = model.getResultMesh().geometry.getAttribute('position').count;
    expect(afterCount).toBe(beforeCount);
    expect(afterCount).toBeGreaterThan(36 * 12);
  });

  it('rebuilds only the suffix when an early-stable brush changes topology later', () => {
    const brushes = [
      makeBox('a', 2, new THREE.Vector3(0, 0, 0)),
      makeBox('b', 2, new THREE.Vector3(6, 0, 0)),
      makeBox('c', 2, new THREE.Vector3(12, 0, 0)),
      makeBox('d', 2, new THREE.Vector3(18, 0, 0)),
    ];
    const compiler = new SolidCsgCompiler();
    const chunkCache = new SolidMeshChunkCache();
    const builder = new SolidBrushMeshChunkBuilder();
    const buffer = new SolidResultBuffer();
    compiler.compile(brushes, { forceFull: true, skipPolygonAssembly: true });
    rebuildChunks(compiler, chunkCache, builder, compiler.getLastUpdateBrushIds());
    buffer.rebuildFull(compiler.getLastBrushOrder(), chunkCache);
    const prefixA = Array.from(buffer.getTriangleSources().filter((source) => source.brushId === 'a'));

    brushes[2].position.copy(brushes[3].position);
    compiler.compile(brushes, {
      dirtyBrushIds: ['c'],
      skipPolygonAssembly: true,
    });
    const dirty = compiler.getLastUpdateBrushIds();
    rebuildChunks(compiler, chunkCache, builder, dirty);
    const order = compiler.getLastBrushOrder();
    const patched = buffer.tryPatchDirty(dirty, order, chunkCache);
    if (!patched) {
      expect(buffer.tryRebuildFromFirstChanged(dirty, order, chunkCache)).toBe(true);
    }
    const afterA = buffer.getTriangleSources().filter((source) => source.brushId === 'a');
    expect(afterA.length).toBe(prefixA.length);

    const full = new SolidResultBuffer();
    full.rebuildFull(order, chunkCache);
    expect(buffer.getTriangleSources().length).toBe(full.getTriangleSources().length);
  });
});

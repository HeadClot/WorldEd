import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { BrushSpatialIndex } from '@/solid/algorithm/spatial/brush_spatial_index.js';

/**
 * Performance regression checks for live solid brush manipulation. These assert
 * both correctness-scale partial work and wall-clock budgets.
 */
describe('Solid live rebuild performance', () => {
  it('keeps partial recompile small when moving one brush in a 256 grid', () => {
    const model = buildGridModel(256, 4, 2);
    const brushes = model.getBrushes();
    const mover = brushes[0]!;
    mover.position.x += 0.15;
    mover.pushTransformToMesh();
    model.syncBrushesFromScene();
    const start = performance.now();
    model.rebuildLive();
    const elapsed = performance.now() - start;
    const stats = model.getCompilerStatsForTesting();
    expect(stats.fullRebuild).toBe(false);
    expect(stats.recompiledBrushCount).toBeLessThanOrEqual(8);
    expect(elapsed).toBeLessThan(80);
  });

  it('stays interactive when dragging a brush among 400 packed walls', () => {
    const model = buildGridModel(400, 2.05, 2);
    const brushes = model.getBrushes();
    const mover = brushes[Math.floor(brushes.length / 2)]!;
    let worst = 0;
    for (let step = 0; step < 8; step++) {
      mover.position.x += 0.05;
      mover.pushTransformToMesh();
      model.syncBrushesFromScene();
      const start = performance.now();
      model.rebuildLive();
      worst = Math.max(worst, performance.now() - start);
    }
    const stats = model.getCompilerStatsForTesting();
    expect(stats.fullRebuild).toBe(false);
    expect(worst).toBeLessThan(120);
  });

  it('matches full rebuild after live moves that change contact topology', () => {
    const model = buildGridModel(64, 3, 2);
    const mover = model.getBrushes()[0]!;
    mover.position.set(1.5, 0, 0);
    mover.pushTransformToMesh();
    model.syncBrushesFromScene();
    model.rebuildLive();
    const liveSources = model.getResultMesh().userData['solidTriangleSources'] as Array<{
      brushId: string;
    }>;
    model.rebuild(true);
    const fullSources = model.getResultMesh().userData['solidTriangleSources'] as Array<{
      brushId: string;
    }>;
    expect(liveSources.length).toBe(fullSources.length);
    expect(liveSources.map((s) => s.brushId).sort()).toEqual(fullSources.map((s) => s.brushId).sort());
  });
});

/** Unit tests for the brush spatial index used by membership queries. */
describe('BrushSpatialIndex', () => {
  it('finds containing brushes without scanning the full set', () => {
    const entries = [];
    for (let index = 0; index < 100; index++) {
      const x = (index % 10) * 5;
      const z = Math.floor(index / 10) * 5;
      entries.push({
        bounds: new THREE.Box3(new THREE.Vector3(x - 1, -1, z - 1), new THREE.Vector3(x + 1, 1, z + 1)),
      });
    }
    const index = new BrushSpatialIndex(entries, 0.01);
    const hits = index.queryPoint(new THREE.Vector3(0, 0, 0));
    expect(hits).toContain(0);
    expect(hits.length).toBeLessThan(5);
    const overlaps = index.queryBounds(entries[0]!.bounds, 0);
    expect(overlaps.length).toBe(0);
  });
});

/**
 * Builds a solid model filled with a square grid of additive boxes.
 *
 * @param count Brush count.
 * @param spacing Center spacing.
 * @param size Box size.
 * @returns Built solid model after full rebuild.
 */
function buildGridModel(count: number, spacing: number, size: number): SolidModel {
  const model = new SolidModel(`Perf${count}`);
  const columns = Math.ceil(Math.sqrt(count));
  const instances: SolidBrushInstance[] = [];
  for (let index = 0; index < count; index++) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const brush = SolidBrushFactory.createCenteredBox(size, size, size);
    const instance = new SolidBrushInstance(`brush-${index}`, `Brush${index}`, brush, SolidOperation.Additive);
    instance.position.set(column * spacing, 0, row * spacing);
    instances.push(instance);
  }
  model.addBrushInstancesBatch(instances, size, true);
  return model;
}

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { SolidBrushEdgeBatch, SOLID_BRUSH_EDGE_BATCH_USERDATA_KEY } from '@/solid/model/solid_brush_edge_batch.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';

/** Unit tests for static solid-brush edge batching. */
describe('SolidBrushEdgeBatch', () => {
  beforeEach(() => {
    SolidBrushEdgeBatch.endLivePoseTracking();
    SolidBrushEdgeBatch.setIndividualMeshesAndSync(null, []);
  });

  it('merges unselected brush edges into solid-root batches after rebuild', () => {
    const model = new SolidModel('BatchSolid');
    model.addBoxBrush(1, SolidOperation.Additive);
    model.addBoxBrush(1, SolidOperation.Additive);
    model.addBoxBrush(1, SolidOperation.Subtractive);
    const brushes = model.getBrushes();
    expect(brushes.length).toBe(3);
    brushes.forEach((brush) => {
      expect(brush.mesh).toBeTruthy();
      expect(SolidBrushVisual.hasLocalEdges(brush.mesh!)).toBe(false);
    });
    const batches = collectBatches(model.root);
    expect(batches.length).toBeGreaterThanOrEqual(1);
    expect(batches.length).toBeLessThanOrEqual(2);
    const totalBatchVerts = batches.reduce((sum, batch) => {
      const position = batch.geometry.getAttribute('position');
      return sum + (position?.count ?? 0);
    }, 0);
    expect(totalBatchVerts).toBeGreaterThan(0);
  });

  it('tracks selection without remounting batches or attaching personal edges', () => {
    const model = new SolidModel('SelectSolid');
    model.addBoxBrush(1, SolidOperation.Additive);
    model.addBoxBrush(1, SolidOperation.Additive);
    const brushes = model.getBrushes();
    const first = brushes[0]!;
    const second = brushes[1]!;
    expect(first.mesh && second.mesh).toBeTruthy();
    const geometryBefore = collectBatches(model.root)[0]!.geometry;
    const vertsBefore = countBatchVertices(model.root);
    SolidBrushEdgeBatch.setIndividualMeshesAndSync(model.root, [first.mesh!]);
    expect(SolidBrushEdgeBatch.isIndividual(first.mesh!)).toBe(true);
    expect(SolidBrushEdgeBatch.isIndividual(second.mesh!)).toBe(false);
    expect(SolidBrushVisual.hasLocalEdges(first.mesh!)).toBe(false);
    expect(collectBatches(model.root)[0]!.geometry).toBe(geometryBefore);
    expect(countBatchVertices(model.root)).toBe(vertsBefore);
  });

  it('uses far fewer line objects than brushes on large solids', () => {
    const model = new SolidModel('ManySolid');
    const count = 40;
    for (let index = 0; index < count; index += 1) {
      model.addBoxBrush(0.5, SolidOperation.Additive);
    }
    let localEdgeCount = 0;
    model.getBrushes().forEach((brush) => {
      if (brush.mesh && SolidBrushVisual.hasLocalEdges(brush.mesh)) localEdgeCount += 1;
    });
    expect(localEdgeCount).toBe(0);
    const batches = collectBatches(model.root);
    expect(batches.length).toBe(1);
    const position = batches[0]!.geometry.getAttribute('position');
    expect(position).toBeTruthy();
    expect(position!.count).toBeGreaterThan(count);
  });

  it('skips work when individual membership is unchanged', () => {
    const model = new SolidModel('NoopSolid');
    model.addBoxBrush(1, SolidOperation.Additive);
    model.addBoxBrush(1, SolidOperation.Additive);
    const selected = model.getBrushes()[0]!.mesh!;
    SolidBrushEdgeBatch.setIndividualMeshesAndSync(model.root, [selected]);
    expect(SolidBrushEdgeBatch.isIndividual(selected)).toBe(true);
    SolidBrushEdgeBatch.setIndividualMeshesAndSync(model.root, [selected]);
    expect(SolidBrushEdgeBatch.isIndividual(selected)).toBe(true);
  });

  it('does not remount other solids when selection changes', () => {
    const world = new THREE.Group();
    const modelA = new SolidModel('SolidA');
    const modelB = new SolidModel('SolidB');
    modelA.addBoxBrush(1, SolidOperation.Additive);
    modelA.addBoxBrush(1, SolidOperation.Additive);
    modelB.addBoxBrush(1, SolidOperation.Additive);
    modelB.addBoxBrush(1, SolidOperation.Additive);
    world.add(modelA.root);
    world.add(modelB.root);
    const brushA = modelA.getBrushes()[0]!.mesh!;
    const batchABefore = collectBatches(modelA.root)[0]!.geometry;
    const batchBBefore = collectBatches(modelB.root)[0]!.geometry;
    SolidBrushEdgeBatch.setIndividualMeshesAndSync(world, [brushA]);
    expect(SolidBrushEdgeBatch.isIndividual(brushA)).toBe(true);
    expect(collectBatches(modelA.root)[0]!.geometry).toBe(batchABefore);
    expect(collectBatches(modelB.root)[0]!.geometry).toBe(batchBBefore);
  });

  it('keeps batch geometry intact when selection clears', () => {
    const model = new SolidModel('DeselectSolid');
    model.addBoxBrush(1, SolidOperation.Additive);
    model.addBoxBrush(1, SolidOperation.Additive);
    const first = model.getBrushes()[0]!.mesh!;
    const vertsBefore = countBatchVertices(model.root);
    SolidBrushEdgeBatch.setIndividualMeshesAndSync(model.root, [first]);
    SolidBrushEdgeBatch.setIndividualMeshesAndSync(model.root, []);
    expect(SolidBrushEdgeBatch.isIndividual(first)).toBe(false);
    expect(countBatchVertices(model.root)).toBe(vertsBefore);
    expect(collectBatches(model.root).length).toBeGreaterThan(0);
  });

  it('keeps batch vertex counts stable across selection toggles', () => {
    const model = new SolidModel('CacheSolid');
    model.addBoxBrush(1, SolidOperation.Additive);
    model.addBoxBrush(1, SolidOperation.Additive);
    const first = model.getBrushes()[0]!.mesh!;
    const second = model.getBrushes()[1]!.mesh!;
    const vertsIdle = countBatchVertices(model.root);
    SolidBrushEdgeBatch.setIndividualMeshesAndSync(model.root, [first]);
    expect(countBatchVertices(model.root)).toBe(vertsIdle);
    SolidBrushEdgeBatch.setIndividualMeshesAndSync(model.root, [second]);
    expect(countBatchVertices(model.root)).toBe(vertsIdle);
    SolidBrushEdgeBatch.setIndividualMeshesAndSync(model.root, []);
    expect(countBatchVertices(model.root)).toBe(vertsIdle);
  });

  it('rebakes batch poses on structural rebuild after brush moves', () => {
    const model = new SolidModel('MoveSolid');
    model.addBoxBrush(1, SolidOperation.Additive);
    const brush = model.getBrushes()[0]!.mesh!;
    const batch = collectBatches(model.root)[0]!;
    const before = (batch.geometry.getAttribute('position') as THREE.BufferAttribute).array.slice(0);
    brush.position.x += 5;
    brush.updateMatrixWorld(true);
    SolidBrushEdgeBatch.rebuildForSolidRoot(model.root);
    const after = (collectBatches(model.root)[0]!.geometry.getAttribute('position') as THREE.BufferAttribute).array;
    let changed = false;
    for (let index = 0; index < before.length; index += 1) {
      if (before[index] !== after[index]) {
        changed = true;
        break;
      }
    }
    expect(changed).toBe(true);
  });

  it('attaches personal edges on structural rebuild while individual', () => {
    const model = new SolidModel('IndividualRebuild');
    model.addBoxBrush(1, SolidOperation.Additive);
    const brush = model.getBrushes()[0]!.mesh!;
    SolidBrushEdgeBatch.setIndividualMeshesAndSync(model.root, [brush]);
    expect(SolidBrushVisual.hasLocalEdges(brush)).toBe(false);
    SolidBrushEdgeBatch.rebuildForSolidRoot(model.root);
    expect(SolidBrushVisual.hasLocalEdges(brush)).toBe(true);
  });

  it('beginLivePoseTracking rebuilds static batches only when membership changes', () => {
    const model = new SolidModel('LivePoseOnce');
    model.addBoxBrush(1, SolidOperation.Additive);
    model.addBoxBrush(1, SolidOperation.Additive);
    const brush = model.getBrushes()[0]!.mesh!;
    const rebuildSpy = vi.spyOn(SolidBrushEdgeBatch, 'rebuildForSolidRoot');
    SolidBrushEdgeBatch.beginLivePoseTracking([brush]);
    expect(rebuildSpy).toHaveBeenCalledTimes(1);
    expect(SolidBrushVisual.hasLocalEdges(brush)).toBe(true);
    SolidBrushEdgeBatch.beginLivePoseTracking([brush]);
    SolidBrushEdgeBatch.beginLivePoseTracking([brush]);
    expect(rebuildSpy).toHaveBeenCalledTimes(1);
    SolidBrushEdgeBatch.endLivePoseTracking();
    expect(rebuildSpy).toHaveBeenCalledTimes(2);
    rebuildSpy.mockRestore();
  });
});

/**
 * Collects static edge batch line objects under a solid root.
 *
 * @param solidRoot Solid model root.
 * @returns Batch LineSegments.
 */
function collectBatches(solidRoot: THREE.Group): THREE.LineSegments[] {
  return solidRoot.children.filter(
    (child): child is THREE.LineSegments =>
      child instanceof THREE.LineSegments && child.userData[SOLID_BRUSH_EDGE_BATCH_USERDATA_KEY] === true,
  );
}

/**
 * Sums position attribute vertex counts across all edge batches on a solid.
 *
 * @param solidRoot Solid model root.
 * @returns Total vertex count.
 */
function countBatchVertices(solidRoot: THREE.Group): number {
  return collectBatches(solidRoot).reduce((sum, batch) => {
    const position = batch.geometry.getAttribute('position');
    return sum + (position?.count ?? 0);
  }, 0);
}

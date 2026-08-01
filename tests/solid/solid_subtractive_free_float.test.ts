import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidBrushFactory } from '@/solid/brush/solid_brush_factory.js';
import { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import { SolidCsgCompiler } from '@/solid/algorithm/compile/solid_csg_compiler.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { markAsSolidCsgGroup } from '@/solid/model/solid_group.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';

/**
 * Builds a box brush instance.
 *
 * @param id Brush id.
 * @param size Edge length.
 * @param operation CSG operation.
 * @param position Optional position.
 * @returns Brush instance.
 */
function makeBox(id: string, size: number, operation: SolidOperation, position?: THREE.Vector3): SolidBrushInstance {
  const brush = SolidBrushFactory.createCenteredBox(size, size, size);
  const instance = new SolidBrushInstance(id, id, brush, operation);
  if (position) {
    instance.position.copy(position);
  }
  return instance;
}

/**
 * Counts compiled polygons owned by a brush id.
 *
 * @param polygons Compiled polygons.
 * @param brushId Brush id.
 * @returns Count.
 */
function countPolygonsForBrush(polygons: Array<{ brushId: string }>, brushId: string): number {
  return polygons.filter((polygon) => polygon.brushId === brushId).length;
}

/**
 * Counts result-mesh triangles attributed to a brush.
 *
 * @param model Solid model.
 * @param brushId Brush id.
 * @returns Triangle count.
 */
function countResultTrianglesForBrush(model: SolidModel, brushId: string): number {
  const sources = model.getResultMesh().userData['solidTriangleSources'] as Array<{ brushId: string }> | undefined;
  if (!sources) {
    return 0;
  }
  return sources.filter((source) => source.brushId === brushId).length;
}

/** Free-floating subtractive brushes must not emit solid result geometry. */
describe('Solid subtractive free-float', () => {
  it('compiler: isolated subtractive emits no polygons (flat non-inverted)', () => {
    const outer = makeBox('outer', 4, SolidOperation.Additive);
    const cutter = makeBox('cutter', 2, SolidOperation.Subtractive, new THREE.Vector3(20, 0, 0));
    const polygons = new SolidCsgCompiler().compile([outer, cutter]);
    expect(countPolygonsForBrush(polygons, 'cutter')).toBe(0);
    expect(countPolygonsForBrush(polygons, 'outer')).toBeGreaterThan(0);
  });

  it('compiler: subtractive that leaves contact drops cavity-wall polygons on partial update', () => {
    const outer = makeBox('outer', 4, SolidOperation.Additive);
    const cutter = makeBox('cutter', 2, SolidOperation.Subtractive, new THREE.Vector3(0, 0, 0));
    const compiler = new SolidCsgCompiler();
    compiler.compile([outer, cutter], { forceFull: true });
    const overlappingCutterPolygons = compiler.getCachedPolygons('cutter')?.length ?? 0;
    expect(overlappingCutterPolygons, 'overlapping subtractive owns cavity walls').toBeGreaterThan(0);

    cutter.position.set(20, 0, 0);
    compiler.compile([outer, cutter], { dirtyBrushIds: ['cutter'] });
    expect(compiler.getLastCompileStats().fullRebuild).toBe(false);
    expect(compiler.getCachedPolygons('cutter')?.length ?? 0).toBe(0);
    expect(compiler.getCachedPolygons('outer')?.length ?? 0).toBeGreaterThan(0);
  });

  it('compiler: additive converted to free-floating subtractive emits no polygons', () => {
    const outer = makeBox('outer', 4, SolidOperation.Additive);
    const mover = makeBox('mover', 2, SolidOperation.Additive, new THREE.Vector3(3, 0, 0));
    const compiler = new SolidCsgCompiler();
    compiler.compile([outer, mover], { forceFull: true });
    expect(compiler.getCachedPolygons('mover')?.length ?? 0).toBeGreaterThan(0);

    mover.operation = SolidOperation.Subtractive;
    compiler.compile([outer, mover], { dirtyBrushIds: ['mover'] });
    const whileTouching = compiler.getCachedPolygons('mover')?.length ?? 0;

    mover.position.set(30, 0, 0);
    compiler.compile([outer, mover], { dirtyBrushIds: ['mover'] });
    expect(compiler.getCachedPolygons('mover')?.length ?? 0).toBe(0);
    void whileTouching;
  });

  it('model: subtractive free after leaving contact has no result triangles', () => {
    const model = new SolidModel('SubFree');
    model.addBoxBrush(6, SolidOperation.Additive);
    const cutter = model.addBoxBrush(2, SolidOperation.Subtractive, null, false);
    cutter.position.set(0, 0, 0);
    cutter.pushTransformToMesh();
    model.markBrushesDirty([cutter.id]);
    model.rebuild(true);
    expect(countResultTrianglesForBrush(model, cutter.id), 'cavity walls while overlapping').toBeGreaterThan(0);

    cutter.position.set(40, 0, 0);
    cutter.pushTransformToMesh();
    model.markBrushesDirty([cutter.id]);
    model.rebuildLive();
    expect(countResultTrianglesForBrush(model, cutter.id)).toBe(0);
    expect(model.getCompilerStatsForTesting().fullRebuild).toBe(false);
  });

  it('model: convert additive to subtractive then free-float leaves no result triangles', () => {
    const model = new SolidModel('AddToSubFree');
    model.addBoxBrush(6, SolidOperation.Additive);
    const mover = model.addBoxBrush(2, SolidOperation.Additive, null, false);
    mover.position.set(2.5, 0, 0);
    mover.pushTransformToMesh();
    model.markBrushesDirty([mover.id]);
    model.rebuild(true);
    expect(countResultTrianglesForBrush(model, mover.id)).toBeGreaterThan(0);

    model.setBrushOperation(mover.id, SolidOperation.Subtractive);
    expect(countResultTrianglesForBrush(model, mover.id), 'still overlapping after op change').toBeGreaterThan(0);

    mover.position.set(40, 0, 0);
    mover.pushTransformToMesh();
    model.markBrushesDirty([mover.id]);
    model.rebuildLive();
    expect(countResultTrianglesForBrush(model, mover.id)).toBe(0);

    model.rebuild(true);
    expect(countResultTrianglesForBrush(model, mover.id)).toBe(0);
  });

  it('model: large map live free-float of subtractive does not resurrect result triangles', () => {
    const model = new SolidModel('LargeSubFree');
    const instances: SolidBrushInstance[] = [];
    for (let index = 0; index < 64; index++) {
      const column = index % 8;
      const row = Math.floor(index / 8);
      const brush = SolidBrushFactory.createCenteredBox(2, 2, 2);
      const instance = new SolidBrushInstance(`brush-${index}`, `Brush${index}`, brush, SolidOperation.Additive);
      instance.position.set(column * 4, 0, row * 4);
      instances.push(instance);
    }
    model.addBrushInstancesBatch(instances, 2, true);
    const mover = model.getBrushes()[0]!;
    model.setBrushOperation(mover.id, SolidOperation.Subtractive);
    expect(countResultTrianglesForBrush(model, mover.id)).toBe(0);

    for (let step = 0; step < 5; step++) {
      mover.position.x += 3;
      mover.pushTransformToMesh();
      model.markBrushesDirty([mover.id]);
      model.rebuildLive();
      expect(countResultTrianglesForBrush(model, mover.id), `step ${step}`).toBe(0);
    }
  });

  it('compiler with solidRoot: free-floating subtractive still emits no polygons', () => {
    const model = new SolidModel('RootSubFree');
    const outer = model.addBoxBrush(6, SolidOperation.Additive);
    const cutter = model.addBoxBrush(2, SolidOperation.Subtractive, null, false);
    cutter.position.set(0, 0, 0);
    cutter.pushTransformToMesh();
    model.markBrushesDirty([outer.id, cutter.id]);
    model.rebuild(true);
    expect(countResultTrianglesForBrush(model, cutter.id)).toBeGreaterThan(0);

    cutter.position.set(50, 0, 0);
    cutter.pushTransformToMesh();
    model.markBrushesDirty([cutter.id]);
    model.rebuildLive();
    expect(countResultTrianglesForBrush(model, cutter.id)).toBe(0);
  });

  it('model with inverted world: free-floating subtractive may emit shell but partial leave-contact clears stale cavity from non-inverted path', () => {
    const model = new SolidModel('InvSub');
    model.setInvertedWorld(false);
    model.addBoxBrush(6, SolidOperation.Additive);
    const cutter = model.addBoxBrush(2, SolidOperation.Subtractive, null, false);
    cutter.position.set(0, 0, 0);
    cutter.pushTransformToMesh();
    model.markBrushesDirty([cutter.id]);
    model.rebuild(true);
    const whileTouching = countResultTrianglesForBrush(model, cutter.id);
    expect(whileTouching).toBeGreaterThan(0);

    cutter.position.set(50, 0, 0);
    cutter.pushTransformToMesh();
    model.markBrushesDirty([cutter.id]);
    model.rebuildLive();
    expect(countResultTrianglesForBrush(model, cutter.id)).toBe(0);
  });

  it('result buffer: shrinking a dirty brush to zero triangles removes its result range', () => {
    const model = new SolidModel('ShrinkZero');
    model.addBoxBrush(4, SolidOperation.Additive);
    const mover = model.addBoxBrush(2, SolidOperation.Additive, null, false);
    mover.position.set(1.5, 0, 0);
    mover.pushTransformToMesh();
    model.markBrushesDirty([mover.id]);
    model.rebuild(true);
    expect(countResultTrianglesForBrush(model, mover.id)).toBeGreaterThan(0);

    model.setBrushOperation(mover.id, SolidOperation.Subtractive);
    mover.position.set(40, 0, 0);
    mover.pushTransformToMesh();
    model.markBrushesDirty([mover.id]);
    model.rebuildLive();
    expect(countResultTrianglesForBrush(model, mover.id)).toBe(0);
    expect(model.getCompilerStatsForTesting().recompiledBrushCount).toBeGreaterThanOrEqual(1);
  });

  it('model: live drag of free-floating subtractive patches without full result rewrite', () => {
    const model = new SolidModel('SubLivePatch');
    const instances: SolidBrushInstance[] = [];
    for (let index = 0; index < 48; index++) {
      const column = index % 8;
      const row = Math.floor(index / 8);
      const brush = SolidBrushFactory.createCenteredBox(2, 2, 2);
      const instance = new SolidBrushInstance(`brush-${index}`, `Brush${index}`, brush, SolidOperation.Additive);
      instance.position.set(column * 5, 0, row * 5);
      instances.push(instance);
    }
    model.addBrushInstancesBatch(instances, 2, true);
    const mover = model.getBrushes()[0]!;
    model.setBrushOperation(mover.id, SolidOperation.Subtractive);
    mover.position.set(500, 0, 0);
    mover.pushTransformToMesh();
    model.markBrushesDirty([mover.id]);
    model.rebuildLive();
    expect(countResultTrianglesForBrush(model, mover.id)).toBe(0);

    for (let step = 0; step < 6; step++) {
      mover.position.x += 0.5;
      mover.pushTransformToMesh();
      model.markBrushesDirty([mover.id]);
      model.rebuildLive();
      expect(model.wasLastResultWritePartialForTesting(), `step ${step} must in-place patch`).toBe(true);
    }
    expect(model.getCompilerStatsForTesting().fullRebuild).toBe(false);
    expect(model.getCompilerStatsForTesting().recompiledBrushCount).toBe(1);
    expect(countResultTrianglesForBrush(model, mover.id)).toBe(0);
  });

  it('hierarchical tree: free-floating subtractive leaf under additive group emits no result triangles', () => {
    const model = new SolidModel('HierSubFree');
    model.addBoxBrush(8, SolidOperation.Additive);
    const group = new THREE.Group();
    markAsSolidCsgGroup(group, SolidOperation.Additive);
    model.root.add(group);
    const far = model.addBoxBrush(2, SolidOperation.Additive, group, false);
    far.position.set(30, 0, 0);
    far.pushTransformToMesh();
    const cutter = model.addBoxBrush(2, SolidOperation.Additive, null, false);
    cutter.position.set(0, 0, 0);
    cutter.pushTransformToMesh();
    model.syncBrushOrderFromScene();
    model.markDirty();
    model.rebuild(true);
    model.setBrushOperation(cutter.id, SolidOperation.Subtractive);
    expect(countResultTrianglesForBrush(model, cutter.id)).toBeGreaterThan(0);

    cutter.position.set(50, 0, 0);
    cutter.pushTransformToMesh();
    model.markBrushesDirty([cutter.id]);
    model.rebuildLive();
    expect(
      countResultTrianglesForBrush(model, cutter.id),
      'free-floating subtractive must not keep cavity or exterior shell',
    ).toBe(0);
  });
});

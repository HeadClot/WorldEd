import { describe, it, expect } from 'vitest';
import { SolidModel } from '../../src/solid/model/solid_model.js';
import { SolidOperation } from '../../src/solid/types/solid_operation.js';

describe('SolidModel intersecting op regression', () => {
  it('keeps result geometry when last brush becomes intersecting over an additive', () => {
    const model = new SolidModel();
    const brushes = [];
    for (let i = 0; i < 12; i++) {
      const brush = model.addBoxBrush(2, SolidOperation.Additive);
      brush.mesh!.position.set(i * 3, 0, 0);
      brushes.push(brush);
    }
    model.syncBrushesFromScene();
    model.rebuild(true);
    const before = model.getResultMesh().geometry.getAttribute('position').count;
    expect(before).toBeGreaterThan(0);

    const target = brushes[3]!;
    const inter = model.addBoxBrush(2, SolidOperation.Additive);
    inter.mesh!.position.copy(target.mesh!.position);
    model.syncBrushesFromScene();
    model.rebuild(true);

    model.setBrushOperation(inter.id, SolidOperation.Intersecting);
    const after = model.getResultMesh().geometry.getAttribute('position').count;
    expect(after, 'result vanished after setBrushOperation Intersecting').toBeGreaterThan(0);

    const stats = (
      model as unknown as {
        pipeline: { compiler: { getLastCompileStats: () => { recompiledBrushCount: number; fullRebuild: boolean } } };
      }
    ).pipeline.compiler.getLastCompileStats();
    expect(stats.fullRebuild).toBe(false);
  });

  it('keeps shared volume when intersecting brush is added at end and only that id is dirty', () => {
    const model = new SolidModel();
    for (let i = 0; i < 10; i++) {
      const brush = model.addBoxBrush(2, SolidOperation.Additive);
      brush.mesh!.position.set(i * 3.5, 0, 0);
    }
    model.syncBrushesFromScene();
    model.rebuild(true);

    const target = model.getBrushes()[2]!;
    const inter = model.addBoxBrush(2, SolidOperation.Intersecting);
    inter.mesh!.position.copy(target.mesh!.position);
    model.syncBrushesFromScene();
    model.markBrushesDirty([inter.id]);
    model.rebuild(true);

    const count = model.getResultMesh().geometry.getAttribute('position').count;
    expect(count, 'partial dirty of new intersecting brush wiped the solid').toBeGreaterThan(0);
  });
});

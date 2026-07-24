import { describe, it, expect } from 'vitest';
import { SolidModel } from '../../src/solid/model/solid_model.js';
import { SolidOperation } from '../../src/solid/types/solid_operation.js';
import { SolidModelController } from '../../src/managers/solid_model_controller.js';
import { CommandStack } from '../../src/commands/command_stack.js';
import { SelectionManager } from '../../src/managers/selection_manager.js';
import * as THREE from 'three';

/** Lightweight mock of the solid tools panel used by the controller. */
class MockSolidPanel {
  setModel(_model: SolidModel | null): void {
    void _model;
  }

  getModel(): SolidModel | null {
    return null;
  }

  refresh(): void {
    return;
  }
}

/** Unit tests for interactive transform commit performance path. */
describe('Solid interactive transform commit', () => {
  it('finalizeAfterInteractiveEdit keeps live geometry without forcing a full rebuild', () => {
    const model = new SolidModel('CommitLive');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    const other = model.addBoxBrush(2, SolidOperation.Additive);
    other.position.set(8, 0, 0);
    other.pushTransformToMesh();
    model.syncBrushesFromScene();
    model.rebuild(true);
    brush.position.x += 0.25;
    brush.pushTransformToMesh();
    model.syncSelectedBrushesFromScene([brush.mesh!]);
    model.rebuildLive();
    const liveStats = model.getCompilerStatsForTesting();
    expect(liveStats.fullRebuild).toBe(false);
    expect(liveStats.recompiledBrushCount).toBeLessThanOrEqual(2);
    const liveCount = model.getResultMesh().geometry.getAttribute('position').count;
    model.finalizeAfterInteractiveEdit();
    const commitCount = model.getResultMesh().geometry.getAttribute('position').count;
    expect(commitCount).toBe(liveCount);
    expect(commitCount).toBeGreaterThan(0);
  });

  it('controller commit returns solid-only so full viewport reclone can be skipped', () => {
    const world = new THREE.Group();
    const model = new SolidModel('CommitCtrl');
    world.add(model.root);
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    const controller = new SolidModelController(
      world,
      new CommandStack(8),
      new SelectionManager(),
      new MockSolidPanel() as never,
    );
    brush.mesh!.position.x += 0.1;
    model.syncSelectedBrushesFromScene([brush.mesh!]);
    model.rebuildLive();
    const solidOnly = controller.onTransformsCommitted([brush.mesh!]);
    expect(solidOnly).toBe(true);
  });

  it('prepareLiveBrushEdit dirties selected brushes even when transforms already match', () => {
    const model = new SolidModel('AlwaysDirty');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    brush.mesh!.position.x += 0.5;
    brush.pullTransformFromMesh();
    model.markBrushesDirty([brush.id]);
    model.rebuildLive();
    const prepared = model.prepareLiveBrushEdit([brush.mesh!]);
    expect(prepared).toBe(true);
    model.finalizeAfterInteractiveEdit();
    const sources = model.getResultMesh().userData.solidTriangleSources as unknown[] | undefined;
    expect(sources?.length).toBeGreaterThan(0);
  });

  it('live samples that arrive during rebuild still update result to the latest pose', () => {
    const world = new THREE.Group();
    const model = new SolidModel('CatchUp');
    world.add(model.root);
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    const other = model.addBoxBrush(2, SolidOperation.Additive);
    other.position.set(10, 0, 0);
    other.pushTransformToMesh();
    model.syncBrushesFromScene();
    model.rebuild(true);
    const controller = new SolidModelController(
      world,
      new CommandStack(8),
      new SelectionManager(),
      new MockSolidPanel() as never,
    );
    brush.mesh!.position.x = 0.2;
    controller.onTransformsLive([brush.mesh!]);
    brush.mesh!.position.x = 1.5;
    controller.onTransformsLive([brush.mesh!]);
    controller.onTransformsCommitted([brush.mesh!]);
    expect(brush.position.x).toBeCloseTo(1.5, 5);
    const stats = model.getCompilerStatsForTesting();
    expect(stats.fullRebuild).toBe(false);
  });

  it('keeps both overlapping additive brushes in the live result mesh', () => {
    const model = new SolidModel('LiveBoth');
    const base = model.addBoxBrush(4, SolidOperation.Additive);
    const mover = model.addBoxBrush(2, SolidOperation.Additive);
    mover.position.set(1.5, 0, 0);
    mover.pushTransformToMesh();
    model.syncBrushesFromScene();
    model.rebuild(true);
    mover.mesh!.position.x = 2.2;
    model.prepareLiveBrushEdit([mover.mesh!]);
    model.rebuildLive();
    const sources = model.getResultMesh().userData.solidTriangleSources as Array<{ brushId: string }> | undefined;
    const brushIds = new Set((sources ?? []).map((source) => source.brushId));
    expect(brushIds.has(base.id)).toBe(true);
    expect(brushIds.has(mover.id)).toBe(true);
    const position = model.getResultMesh().geometry.getAttribute('position');
    expect(position.count).toBeGreaterThan(0);
  });

  it('keeps multiple face textures visible during live brush drag', () => {
    const model = new SolidModel('LiveMultiTex');
    const base = model.addBoxBrush(4, SolidOperation.Additive);
    const mover = model.addBoxBrush(2, SolidOperation.Additive);
    base.setAllFacesTextureId('maps/wall.png');
    mover.setAllFacesTextureId('maps/floor.png');
    mover.position.set(1.5, 0, 0);
    mover.pushTransformToMesh();
    model.syncBrushesFromScene();
    model.rebuild(true);
    const beforeMaterials = model.getResultMesh().material;
    expect(Array.isArray(beforeMaterials)).toBe(true);
    expect((beforeMaterials as THREE.Material[]).length).toBeGreaterThanOrEqual(2);

    mover.mesh!.position.x = 2.0;
    model.prepareLiveBrushEdit([mover.mesh!]);
    model.rebuildLive();

    const afterMaterials = model.getResultMesh().material;
    expect(Array.isArray(afterMaterials)).toBe(true);
    expect((afterMaterials as THREE.Material[]).length).toBeGreaterThanOrEqual(2);
    const position = model.getResultMesh().geometry.getAttribute('position');
    const groups = model.getResultMesh().geometry.groups;
    const covered = groups.reduce((sum, group) => sum + group.count, 0);
    expect(covered).toBe(position.count);
    expect(groups.length).toBeGreaterThanOrEqual(2);
  });
});

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { EditorApi } from '../../../src/ai/client/editor_api.js';
import type { EditorApiHost } from '../../../src/ai/client/editor_api_host.js';
import { CommandStack } from '../../../src/commands/command_stack.js';
import { SelectionManager } from '../../../src/selection/object/selection_manager.js';
import { SolidModel } from '../../../src/solid/model/solid_model.js';
import { SolidOperation } from '../../../src/solid/types/solid_operation.js';
import { CreateSolidModelCommand } from '../../../src/commands/create/create_solid_model_command.js';
import { GridSnap } from '../../../src/transform/snap/grid_snap.js';
import { SnapManager } from '../../../src/transform/snap/snap_manager.js';
import { SolidModelController } from '../../../src/managers/solid/solid_model_controller.js';
import { SolidModelPanel } from '../../../src/ui/solid_model_panel.js';

/**
 * Builds write API fixture.
 *
 * @returns Api, world, stack.
 */
function createApi(): { api: EditorApi; world: THREE.Group; stack: CommandStack } {
  const world = new THREE.Group();
  const stack = new CommandStack(64);
  const selection = new SelectionManager();
  const panelHost = document.createElement('div');
  const panel = new SolidModelPanel(panelHost, { onAddBoxBrush: () => undefined });
  const solidModelController = new SolidModelController(world, stack, selection, panel);
  const host: EditorApiHost = {
    worldObject: world,
    commandStack: stack,
    selectionManager: selection,
    solidModelController,
    gridSnap: new GridSnap(true, 0.25),
    snapManager: new SnapManager(0.25),
    getUserSnapEnabled: () => false,
    refreshAfterWorldMutation: () => undefined,
    refreshOutliner: () => undefined,
    showStatus: () => undefined,
  };
  return { api: new EditorApi(host), world, stack };
}

/** Clip world-plane + CSG vs AABB regression tests. */
describe('clip world plane and CSG vs AABB', () => {
  it('clips a translated brush at its world midplane', () => {
    const { api, world, stack } = createApi();
    const model = new SolidModel('ClipShift');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    brush.position.set(5, 0, 0);
    brush.pushTransformToMesh();
    model.rebuild(true);
    stack.push(new CreateSolidModelCommand(model, world));
    const result = api.invokeTool('clip_brush', {
      brushId: brush.id,
      axis: 'x',
      distance: 5,
      keepFront: false,
    });
    expect(result.ok).toBe(true);
    const updated = model.findBrush(brush.id)!;
    const bounds = updated.brush.computeLocalBounds();
    expect(bounds.max.x).toBeLessThanOrEqual(0.01);
  });

  it('clips when the solid model root is offset in the world', () => {
    const { api, world, stack } = createApi();
    const model = new SolidModel('ClipModelRoot');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    model.root.position.set(10, 0, 0);
    model.root.updateMatrixWorld(true);
    brush.pushTransformToMesh();
    model.rebuild(true);
    stack.push(new CreateSolidModelCommand(model, world));
    const result = api.invokeTool('clip_brush', {
      brushId: brush.id,
      axis: 'x',
      distance: 10,
      keepFront: false,
    });
    expect(result.ok).toBe(true);
    const updated = model.findBrush(brush.id)!;
    expect(updated.brush.computeLocalBounds().max.x).toBeLessThanOrEqual(0.01);
  });

  it('AABB query_point hits subtractives while explain_csg reports void', () => {
    const { api, world, stack } = createApi();
    const model = new SolidModel('CsgPoint');
    const outer = model.addBoxBrush(4, SolidOperation.Additive);
    const cutter = model.addBoxBrush(2, SolidOperation.Subtractive);
    cutter.position.set(0, 0, 0);
    cutter.pushTransformToMesh();
    model.rebuild(true);
    stack.push(new CreateSolidModelCommand(model, world));
    const aabb = api.invokeTool('query_point', { point: { x: 0, y: 0, z: 0 }, modelId: model.root.uuid });
    const csg = api.invokeTool('explain_csg_at_point', {
      point: { x: 0, y: 0, z: 0 },
      modelId: model.root.uuid,
    });
    expect(aabb.ok).toBe(true);
    expect(csg.ok).toBe(true);
    const brushIds = (aabb.data as { brushIds: string[] }).brushIds;
    expect(brushIds).toContain(outer.id);
    expect(brushIds).toContain(cutter.id);
    expect((csg.data as { finalSolid: boolean }).finalSolid).toBe(false);
  });

  it('validate_solid_model warns when a subtractive misses additive solid', () => {
    const { api, world, stack } = createApi();
    const model = new SolidModel('OrphanCut');
    model.addBoxBrush(1, SolidOperation.Additive);
    const floating = model.addBoxBrush(1, SolidOperation.Subtractive);
    floating.position.set(50, 0, 0);
    floating.pushTransformToMesh();
    model.rebuild(true);
    stack.push(new CreateSolidModelCommand(model, world));
    const result = api.invokeTool('validate_solid_model', { modelId: model.root.uuid });
    expect(result.ok).toBe(true);
    const warnings = (result.data as { warnings: string[] }).warnings;
    expect(warnings.some((text) => text.includes(floating.id) || text.includes('does not overlap'))).toBe(true);
  });
});

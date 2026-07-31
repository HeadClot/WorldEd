import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidModelController } from '@/solid/controller/solid_model_controller.js';
import { CommandStack } from '@/commands/command_stack.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { CommandTransformPositionSet } from '@/transform/commands/command_transform_position_set.js';

/** Mock solid tools panel. */
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

/**
 * Returns Y bounds of the solid result mesh.
 *
 * @param model Solid model.
 * @returns Min and max Y of result positions.
 */
function resultYRange(model: SolidModel): { minY: number; maxY: number } {
  const position = model.getResultMesh().geometry.getAttribute('position');
  let minY = Infinity;
  let maxY = -Infinity;
  for (let index = 0; index < position.count; index++) {
    const y = position.getY(index);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { minY, maxY };
}

/**
 * Inspector position edits must move solid CSG result geometry, not only the
 * preview wireframe.
 */
describe('Solid inspector position edit', () => {
  it('moves CSG result when inspector CommandTransformPositionSet commits via controller', () => {
    const world = new THREE.Group();
    const model = new SolidModel('InspectorPos');
    world.add(model.root);
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    model.rebuild(true);
    const before = resultYRange(model);
    expect(before.minY).toBeCloseTo(-1, 4);
    expect(before.maxY).toBeCloseTo(1, 4);

    const mesh = brush.mesh!;
    new CommandTransformPositionSet([mesh], [new THREE.Vector3(0, 5, 0)]).execute();
    expect(mesh.position.y).toBeCloseTo(5, 5);

    const controller = new SolidModelController(
      world,
      new CommandStack(8),
      new ManagerSelection(),
      new MockSolidPanel() as never,
    );
    const solidOnly = controller.onTransformsCommitted([mesh]);
    expect(solidOnly).toBe(true);
    expect(brush.position.y).toBeCloseTo(5, 5);

    const after = resultYRange(model);
    expect(after.minY).toBeCloseTo(4, 4);
    expect(after.maxY).toBeCloseTo(6, 4);
  });

  it('moves CSG result through prepareLiveBrushEdit + finalize path only', () => {
    const model = new SolidModel('InspectorPosDirect');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    model.rebuild(true);
    brush.mesh!.position.set(0, 3, 0);
    model.prepareLiveBrushEdit([brush.mesh!]);
    model.finalizeAfterInteractiveEdit();
    const after = resultYRange(model);
    expect(after.minY).toBeCloseTo(2, 4);
    expect(after.maxY).toBeCloseTo(4, 4);
  });

  it('moves CSG result when only the mesh pose was written (instance still at origin)', () => {
    const model = new SolidModel('MeshOnlyWrite');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    model.rebuild(true);
    // Inspector path: CommandTransformPositionSet writes mesh only.
    brush.mesh!.position.set(0, 4, 0);
    expect(brush.position.y).toBe(0);
    model.prepareLiveBrushEdit([brush.mesh!]);
    model.finalizeAfterInteractiveEdit();
    expect(brush.position.y).toBeCloseTo(4, 5);
    const after = resultYRange(model);
    expect(after.minY).toBeCloseTo(3, 4);
    expect(after.maxY).toBeCloseTo(5, 4);
  });
});

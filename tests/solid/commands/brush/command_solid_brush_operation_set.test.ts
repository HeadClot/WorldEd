import { describe, it, expect } from 'vitest';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { CommandSolidBrushOperationSet } from '@/solid/commands/brush/command_solid_brush_operation_set.js';

/** CSG operation changes must be undoable without leaving stale preview style. */
describe('CommandSolidBrushOperationSet', () => {
  it('changes operation and restores the prior value on undo', () => {
    const model = new SolidModel('OpSolid');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    const command = new CommandSolidBrushOperationSet([brush.mesh!], SolidOperation.Subtractive);
    command.execute();
    expect(model.findBrush(brush.id)?.operation).toBe(SolidOperation.Subtractive);
    command.undo();
    expect(model.findBrush(brush.id)?.operation).toBe(SolidOperation.Additive);
  });

  it('is a no-op when the operation is already active', () => {
    const model = new SolidModel('OpNoop');
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    const command = new CommandSolidBrushOperationSet([brush.mesh!], SolidOperation.Additive);
    command.execute();
    command.undo();
    expect(model.findBrush(brush.id)?.operation).toBe(SolidOperation.Additive);
  });
});

import { describe, it, expect } from 'vitest';
import { SolidModel } from '../../src/solid/model/solid_model.js';
import { SolidOperation } from '../../src/solid/types/solid_operation.js';
import { ReorderSolidBrushesCommand } from '../../src/commands/reorder_solid_brushes_command.js';
import { CommandStack } from '../../src/commands/command_stack.js';

/**
 * Unit tests for moving solid brushes to first/last CSG order.
 */
describe('ReorderSolidBrushesCommand', () => {
  it('moves a brush to first and restores order on undo', () => {
    const model = new SolidModel('OrderFirst');
    const a = model.addBoxBrush(2, SolidOperation.Additive);
    const b = model.addBoxBrush(2, SolidOperation.Subtractive);
    const c = model.addBoxBrush(2, SolidOperation.Additive);
    expect(model.getBrushes().map((brush) => brush.id)).toEqual([
      a.id,
      b.id,
      c.id
    ]);
    const stack = new CommandStack(8);
    stack.push(new ReorderSolidBrushesCommand([c.mesh!], 'first'));
    expect(model.getBrushes().map((brush) => brush.id)).toEqual([
      c.id,
      a.id,
      b.id
    ]);
    stack.undo();
    expect(model.getBrushes().map((brush) => brush.id)).toEqual([
      a.id,
      b.id,
      c.id
    ]);
  });

  it('moves a brush to last and preserves multi-select relative order', () => {
    const model = new SolidModel('OrderLast');
    const a = model.addBoxBrush(2, SolidOperation.Additive);
    const b = model.addBoxBrush(2, SolidOperation.Additive);
    const c = model.addBoxBrush(2, SolidOperation.Subtractive);
    const d = model.addBoxBrush(2, SolidOperation.Additive);
    const stack = new CommandStack(8);
    stack.push(new ReorderSolidBrushesCommand([a.mesh!, b.mesh!], 'last'));
    expect(model.getBrushes().map((brush) => brush.id)).toEqual([
      c.id,
      d.id,
      a.id,
      b.id
    ]);
    stack.undo();
    expect(model.getBrushes().map((brush) => brush.id)).toEqual([
      a.id,
      b.id,
      c.id,
      d.id
    ]);
  });
});

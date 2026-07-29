import type { UndoCommand } from '../../commands/undo_command.js';
import type { SolidModel } from '../../solid/model/solid_model.js';

/** Undoable command that applies an explicit full brush evaluation order. */
export class EditorApiReorderBrushListCommand implements UndoCommand {
  private readonly model: SolidModel;
  private readonly nextOrder: string[];
  private previousOrder: string[];
  private executed: boolean;

  /**
   * Creates a full-list reorder command.
   *
   * @param model Solid model to reorder.
   * @param nextOrder Desired brush id order (must include all brushes).
   */
  constructor(model: SolidModel, nextOrder: string[]) {
    this.model = model;
    this.nextOrder = nextOrder.slice();
    this.previousOrder = [];
    this.executed = false;
  }

  /** Applies the new evaluation order. */
  execute(): void {
    if (this.executed) return;
    this.previousOrder = this.model.getBrushes().map((brush) => brush.id);
    if (!this.model.applyBrushOrder(this.nextOrder)) return;
    this.executed = true;
  }

  /** Restores the previous evaluation order. */
  undo(): void {
    if (!this.executed) return;
    this.model.applyBrushOrder(this.previousOrder);
    this.executed = false;
  }
}

/**
 * Builds a new brush id order moving one brush before/after another.
 *
 * @param orderedIds Current evaluation order.
 * @param brushId Brush to move.
 * @param relativeId Anchor brush id.
 * @param placement Insert before or after the anchor.
 * @returns New order, or null when ids are missing or identical.
 */
export function buildRelativeBrushOrder(
  orderedIds: readonly string[],
  brushId: string,
  relativeId: string,
  placement: 'before' | 'after',
): string[] | null {
  if (brushId === relativeId) return null;
  const without = orderedIds.filter((id) => id !== brushId);
  const relativeIndex = without.indexOf(relativeId);
  if (relativeIndex < 0 || orderedIds.indexOf(brushId) < 0) return null;
  const insertAt = placement === 'before' ? relativeIndex : relativeIndex + 1;
  const next = without.slice();
  next.splice(insertAt, 0, brushId);
  return next;
}

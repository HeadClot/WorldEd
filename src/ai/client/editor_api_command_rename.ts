import type { UndoCommand } from '@/commands/command_undo.js';
import type { SolidModel } from '@/solid/model/solid_model.js';

/** Undoable brush rename for MCP stable names. */
export class EditorApiCommandRenameBrush implements UndoCommand {
  private readonly model: SolidModel;
  private readonly brushId: string;
  private readonly nextName: string;
  private previousName: string;
  private executed: boolean;

  /**
   * Creates a rename command.
   *
   * @param model Owning solid model.
   * @param brushId Brush id.
   * @param nextName New display name.
   */
  constructor(model: SolidModel, brushId: string, nextName: string) {
    this.model = model;
    this.brushId = brushId;
    this.nextName = nextName;
    this.previousName = '';
    this.executed = false;
  }

  /** Applies the new name. */
  execute(): void {
    if (this.executed) return;
    const brush = this.model.findBrush(this.brushId);
    if (!brush) return;
    this.previousName = brush.name;
    this.model.renameBrush(this.brushId, this.nextName);
    this.executed = true;
  }

  /** Restores the previous name. */
  undo(): void {
    if (!this.executed) return;
    this.model.renameBrush(this.brushId, this.previousName);
    this.executed = false;
  }
}

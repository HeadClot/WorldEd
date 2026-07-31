import { UndoCommand } from './command_undo.js';

/**
 * Runs several undoable commands as one history entry. Execute applies steps in
 * order; undo reverses them so one Ctrl+Z restores the whole batch.
 */
export class CommandUndoBatch implements UndoCommand {
  private readonly commands: UndoCommand[];
  private executed: boolean;

  /**
   * Creates a batch from ordered sub-commands.
   *
   * @param commands Steps to run on execute (reverse order on undo).
   */
  constructor(commands: readonly UndoCommand[]) {
    this.commands = commands.slice();
    this.executed = false;
  }

  /** Executes each sub-command in order. */
  execute(): void {
    if (this.executed) {
      return;
    }
    for (const command of this.commands) {
      command.execute();
    }
    this.executed = true;
  }

  /** Undoes each sub-command in reverse order. */
  undo(): void {
    if (!this.executed) {
      return;
    }
    for (let index = this.commands.length - 1; index >= 0; index--) {
      this.commands[index]!.undo();
    }
    this.executed = false;
  }

  /**
   * Disposes sub-commands that implement dispose when this batch is permanently
   * dropped from history.
   */
  dispose(): void {
    for (const command of this.commands) {
      if (typeof command.dispose === 'function') {
        command.dispose();
      }
    }
  }

  /**
   * Returns how many sub-commands this batch holds.
   *
   * @returns Sub-command count.
   */
  getCommandCount(): number {
    return this.commands.length;
  }
}

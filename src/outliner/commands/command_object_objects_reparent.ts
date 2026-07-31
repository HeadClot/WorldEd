import * as THREE from 'three';
import { UndoCommand } from '@/commands/command_undo.js';
import { CommandObjectReparent } from './command_object_reparent.js';

/** One object move within a multi-reparent batch. */
export interface ReparentMove {
  /** Object to reparent. */
  object: THREE.Object3D;

  /** Destination parent. */
  newParent: THREE.Object3D;

  /** Sibling to insert before; null appends at the end. */
  insertBefore: THREE.Object3D | null;
}

/**
 * Undoable batch reparent for multi-select outliner drops. Executes moves in
 * order and undoes them in reverse so one Ctrl+Z restores the whole selection.
 */
export class CommandObjectObjectsReparent implements UndoCommand {
  private commands: CommandObjectReparent[];
  private executed: boolean;

  /**
   * Creates a multi-reparent command from ordered moves.
   *
   * @param moves Objects and destinations in the order they should apply.
   */
  constructor(moves: readonly ReparentMove[]) {
    this.commands = moves.map((move) => new CommandObjectReparent(move.object, move.newParent, move.insertBefore));
    this.executed = false;
  }

  /** Executes each reparent move in order. */
  execute(): void {
    if (this.executed) return;
    for (const command of this.commands) {
      command.execute();
    }
    this.executed = true;
  }

  /** Undoes each reparent move in reverse order. */
  undo(): void {
    if (!this.executed) return;
    for (let index = this.commands.length - 1; index >= 0; index--) {
      this.commands[index]!.undo();
    }
    this.executed = false;
  }

  /**
   * Returns how many objects this command moves.
   *
   * @returns Number of reparent sub-commands.
   */
  getMoveCount(): number {
    return this.commands.length;
  }
}

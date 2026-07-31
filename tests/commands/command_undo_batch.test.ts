import { describe, expect, it } from 'vitest';
import { CommandStack } from '@/commands/command_stack.js';
import type { UndoCommand } from '@/commands/command_undo.js';
import { CommandUndoBatch } from '@/commands/command_undo_batch.js';

/** Simple counter command for batch ordering tests. */
class CounterCommand implements UndoCommand {
  /**
   * Creates a counter command.
   *
   * @param label Step label appended on execute.
   * @param log Shared log of execute/undo labels.
   */
  constructor(
    private readonly label: string,
    private readonly log: string[],
  ) {}

  /** Records execute order. */
  execute(): void {
    this.log.push(`execute:${this.label}`);
  }

  /** Records undo order. */
  undo(): void {
    this.log.push(`undo:${this.label}`);
  }
}

describe('CommandUndoBatch', () => {
  it('executes steps in order and undoes them in reverse as one stack entry', () => {
    const log: string[] = [];
    const batch = new CommandUndoBatch([new CounterCommand('a', log), new CounterCommand('b', log)]);
    const stack = new CommandStack(16);
    stack.push(batch);
    expect(log).toEqual(['execute:a', 'execute:b']);
    expect(stack.canUndo()).toBe(true);
    stack.undo();
    expect(log).toEqual(['execute:a', 'execute:b', 'undo:b', 'undo:a']);
    expect(stack.canUndo()).toBe(false);
    stack.redo();
    expect(log).toEqual(['execute:a', 'execute:b', 'undo:b', 'undo:a', 'execute:a', 'execute:b']);
  });

  it('reports sub-command count', () => {
    const batch = new CommandUndoBatch([
      new CounterCommand('a', []),
      new CounterCommand('b', []),
      new CounterCommand('c', []),
    ]);
    expect(batch.getCommandCount()).toBe(3);
  });
});

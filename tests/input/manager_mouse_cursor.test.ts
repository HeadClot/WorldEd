import { describe, it, expect, beforeEach } from 'vitest';
import { ManagerMouseCursor } from '@/input/manager_mouse_cursor.js';

describe('ManagerMouseCursor', () => {
  let manager: ManagerMouseCursor;
  let target: HTMLElement;

  beforeEach(() => {
    manager = new ManagerMouseCursor();
    target = document.createElement('div');
  });

  it('applies the requested cursor immediately', () => {
    manager.setMouseCursor('ew-resize', target);
    expect(target.style.cursor).toBe('ew-resize');
    expect(manager.getAppliedCursorCss()).toBe('ew-resize');
    expect(manager.getAppliedTargetElement()).toBe(target);
  });

  it('keeps the cursor when refreshed before update and drops it when not', () => {
    manager.setMouseCursor('ns-resize', target);
    manager.update();
    expect(target.style.cursor).toBe('ns-resize');
    manager.setMouseCursor('ns-resize', target);
    manager.update();
    expect(target.style.cursor).toBe('ns-resize');
    manager.update();
    expect(target.style.cursor).toBe('');
    expect(manager.getAppliedCursorCss()).toBe('');
    expect(manager.getAppliedTargetElement()).toBeNull();
  });

  it('restores the previous target when a new element takes the cursor', () => {
    const second = document.createElement('div');
    manager.setMouseCursor('ew-resize', target);
    manager.setMouseCursor('ns-resize', second);
    expect(target.style.cursor).toBe('');
    expect(second.style.cursor).toBe('ns-resize');
    manager.update();
    manager.update();
    expect(second.style.cursor).toBe('');
  });

  it('reset clears applied cursor without needing a frame update', () => {
    manager.setMouseCursor('nwse-resize', target);
    manager.reset();
    expect(target.style.cursor).toBe('');
    expect(manager.getAppliedCursorCss()).toBe('');
  });
});

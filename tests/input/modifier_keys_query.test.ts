import { describe, it, expect } from 'vitest';
import { ManagerInput } from '@/input/manager_input.js';
import {
  isAnyModifierPressedOnInputManagers,
  isCtrlOrMetaPressedOnInputManagers,
  isShiftPressedOnDomFlags,
  isShiftPressedOnInputManagers,
  isCtrlOrMetaPressedOnDomFlags,
} from '@/input/modifier_keys_query.js';

describe('modifier_keys_query', () => {
  it('detects shift on any input manager including a detached window manager', () => {
    const main = new ManagerInput(window);
    const detachedWindow = {
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      document: { addEventListener: () => undefined, removeEventListener: () => undefined, hidden: false },
    } as unknown as Window;
    const detached = new ManagerInput(detachedWindow);
    expect(isShiftPressedOnInputManagers([main, detached])).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' }));
    expect(isShiftPressedOnInputManagers([main, detached])).toBe(true);
    main.reset();
    expect(isShiftPressedOnInputManagers([main, detached])).toBe(false);
    Object.defineProperty(detached, 'isShiftDown', { value: () => true });
    expect(isShiftPressedOnInputManagers([main, detached])).toBe(true);
    main.dispose();
    detached.dispose();
  });

  it('detects ctrl or meta across managers', () => {
    const main = new ManagerInput(window);
    expect(isCtrlOrMetaPressedOnInputManagers([main])).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ControlLeft' }));
    expect(isCtrlOrMetaPressedOnInputManagers([main])).toBe(true);
    main.reset();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'MetaLeft' }));
    expect(isCtrlOrMetaPressedOnInputManagers([main])).toBe(true);
    main.dispose();
  });

  it('reads DOM event flags for bridge-latched samples', () => {
    expect(isShiftPressedOnDomFlags({ shiftKey: true, ctrlKey: false, altKey: false, metaKey: false })).toBe(true);
    expect(isCtrlOrMetaPressedOnDomFlags({ shiftKey: false, ctrlKey: true, altKey: false, metaKey: false })).toBe(true);
    expect(isCtrlOrMetaPressedOnDomFlags({ shiftKey: false, ctrlKey: false, altKey: false, metaKey: true })).toBe(true);
    expect(isAnyModifierPressedOnInputManagers([])).toBe(false);
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ViewportToolModeDropdown } from '@/tools/chrome/options/viewport_tool_mode_dropdown.js';
import { EditorInteractionMode } from '@/types/editor_interaction_mode.js';
import { FloatingPanelStack } from '@/ui/floating_panel/panel_floating_stack.js';
import { UiStackLayers } from '@/ui/stack/ui_stack_layers.js';

describe('ViewportToolModeDropdown', () => {
  let host: HTMLElement;

  beforeEach(() => {
    FloatingPanelStack.resetForTests();
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    document.body.replaceChildren();
    FloatingPanelStack.resetForTests();
  });

  it('opens Object Mode / Edit Mode through PanelMenu on document.body', () => {
    const chosen: EditorInteractionMode[] = [];
    const dropdown = new ViewportToolModeDropdown(host, (mode) => {
      chosen.push(mode);
    });
    const trigger = host.querySelector('button') as HTMLButtonElement;
    Object.defineProperty(trigger, 'getBoundingClientRect', {
      value: () => ({ left: 20, bottom: 50, top: 26, right: 120, width: 100, height: 24 }),
    });
    trigger.click();
    const panel = dropdown.getMenuPanel();
    expect(panel).not.toBeNull();
    expect(panel!.isOpen()).toBe(true);
    const menu = panel!.getElement();
    expect(menu.parentElement).toBe(document.body);
    expect(menu.style.position).toBe('fixed');
    expect(Number(menu.style.zIndex)).toBe(UiStackLayers.menu);
    expect(FloatingPanelStack.containsEventTarget(menu)).toBe(true);
    const editRow = Array.from(menu.querySelectorAll('button')).find((button) =>
      (button.textContent ?? '').includes('Edit Mode'),
    ) as HTMLButtonElement;
    expect(editRow).toBeDefined();
    editRow.click();
    expect(chosen).toEqual([EditorInteractionMode.EDIT_MODE]);
    expect(panel!.isOpen()).toBe(false);
    dropdown.dispose();
  });

  it('marks the active mode with a checkmark when reopened', () => {
    const dropdown = new ViewportToolModeDropdown(host, () => undefined);
    dropdown.setActiveMode(EditorInteractionMode.EDIT_MODE);
    const trigger = host.querySelector('button') as HTMLButtonElement;
    Object.defineProperty(trigger, 'getBoundingClientRect', {
      value: () => ({ left: 0, bottom: 30, top: 6, right: 80, width: 80, height: 24 }),
    });
    trigger.click();
    const menu = dropdown.getMenuPanel()!.getElement();
    const checked = Array.from(menu.querySelectorAll('button')).find((button) =>
      (button.textContent ?? '').startsWith('✓'),
    );
    expect(checked?.textContent).toContain('Edit Mode');
    dropdown.dispose();
  });
});

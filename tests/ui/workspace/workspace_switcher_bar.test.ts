import { describe, expect, it, vi } from 'vitest';
import { WorkspaceSwitcherBar } from '@/ui/workspace/workspace_switcher_bar.js';
import { createDefaultWorkspaces, WORKSPACE_IDS } from '@/layout/workspace/workspace_definition.js';

/**
 * Builds a switcher with vitest action spies.
 *
 * @returns Bar and action mocks.
 */
function createSwitcherFixture() {
  const parent = document.createElement('div');
  document.body.appendChild(parent);
  const actions = {
    onSelectWorkspace: vi.fn(),
    onAddPresetWorkspace: vi.fn(),
    onDuplicateCurrent: vi.fn(),
    onDeleteWorkspace: vi.fn(),
    onRenameWorkspace: vi.fn(),
    onReorderWorkspace: vi.fn(),
  };
  const bar = new WorkspaceSwitcherBar(parent, actions);
  const defaults = createDefaultWorkspaces();
  bar.setWorkspaces(defaults, WORKSPACE_IDS.quad);
  return { bar, actions, defaults };
}

describe('WorkspaceSwitcherBar', () => {
  it('should open a + menu with four presets, a separator, and Duplicate Current', () => {
    const { bar, actions } = createSwitcherFixture();
    bar.getAddButton().click();
    expect(bar.getAddMenuPanel().isOpen()).toBe(true);
    const labels = Array.from(
      bar.getAddMenuPanel().getElement().querySelectorAll('.editor-toolbar-dropdown-label'),
    ).map((node) => node.textContent);
    expect(labels).toEqual(['Quad View', 'Single Perspective', 'Dual', 'Triple', 'Duplicate Current']);
    const duplicate = Array.from(
      bar.getAddMenuPanel().getElement().querySelectorAll('.editor-toolbar-dropdown-item'),
    ).find((button) => button.textContent?.includes('Duplicate Current')) as HTMLButtonElement;
    expect(duplicate.title).toBe('Add a new workspace.');
    duplicate.click();
    expect(actions.onDuplicateCurrent).toHaveBeenCalledTimes(1);
    bar.dispose();
  });

  it('should invoke onAddPresetWorkspace when a default template is chosen', () => {
    const { bar, actions } = createSwitcherFixture();
    bar.getAddButton().click();
    const dual = Array.from(bar.getAddMenuPanel().getElement().querySelectorAll('.editor-toolbar-dropdown-item')).find(
      (button) => button.textContent?.includes('Dual'),
    ) as HTMLButtonElement;
    dual.click();
    expect(actions.onAddPresetWorkspace).toHaveBeenCalledTimes(1);
    expect(actions.onAddPresetWorkspace.mock.calls[0]![0].name).toBe('Dual');
    bar.dispose();
  });

  it('should close a tab on middle-click, not right-click', () => {
    const { bar, actions } = createSwitcherFixture();
    const tab = bar.getTabButton(WORKSPACE_IDS.dual)!;
    expect(tab).toBeTruthy();
    tab.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2 }));
    expect(actions.onDeleteWorkspace).not.toHaveBeenCalled();
    tab.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, button: 1 }));
    expect(actions.onDeleteWorkspace).toHaveBeenCalledWith(WORKSPACE_IDS.dual);
    bar.dispose();
  });

  it('should rename a tab via double-click inline edit using shared rename input', () => {
    const { bar, actions } = createSwitcherFixture();
    const tab = bar.getTabButton(WORKSPACE_IDS.quad)!;
    const nameSpan = tab.querySelector('.editor-workspace-tab-name') as HTMLSpanElement;
    // Simulate a real double-click: first click must not destroy the tab.
    tab.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1, button: 0 }));
    nameSpan.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const input = tab.querySelector('input') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(tab.isConnected).toBe(true);
    input.value = 'Modeling';
    input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true }));
    expect(actions.onRenameWorkspace).toHaveBeenCalledWith(WORKSPACE_IDS.quad, 'Modeling');
    expect(nameSpan.textContent).toBe('Modeling');
    // Tab remains the same element and stays interactive after rename.
    expect(bar.getTabButton(WORKSPACE_IDS.quad)).toBe(tab);
    tab.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1, button: 0 }));
    expect(actions.onSelectWorkspace).not.toHaveBeenCalled();
    bar.dispose();
  });

  it('should select a different tab immediately on single click', () => {
    const { bar, actions } = createSwitcherFixture();
    const tab = bar.getTabButton(WORKSPACE_IDS.dual)!;
    tab.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1, button: 0 }));
    expect(actions.onSelectWorkspace).toHaveBeenCalledWith(WORKSPACE_IDS.dual);
    bar.dispose();
  });

  it('should not re-select the already active tab on click', () => {
    const { bar, actions } = createSwitcherFixture();
    const tab = bar.getTabButton(WORKSPACE_IDS.quad)!;
    tab.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1, button: 0 }));
    expect(actions.onSelectWorkspace).not.toHaveBeenCalled();
    bar.dispose();
  });

  it('should reorder tabs via drag and drop onto another tab', () => {
    const { bar, actions } = createSwitcherFixture();
    const source = bar.getTabButton(WORKSPACE_IDS.quad)!;
    const target = bar.getTabButton(WORKSPACE_IDS.dual)!;
    const transfer = {
      data: '',
      effectAllowed: 'all',
      dropEffect: 'move',
      setData(_type: string, value: string) {
        this.data = value;
      },
      getData() {
        return this.data;
      },
    };
    const dragStart = new Event('dragstart', { bubbles: true }) as DragEvent;
    Object.defineProperty(dragStart, 'dataTransfer', { value: transfer });
    source.dispatchEvent(dragStart);
    const drop = new Event('drop', { bubbles: true }) as DragEvent;
    Object.defineProperty(drop, 'dataTransfer', { value: transfer });
    target.dispatchEvent(drop);
    // Quad (0) dropped on Dual (2) moves to Dual's index.
    expect(actions.onReorderWorkspace).toHaveBeenCalledWith(WORKSPACE_IDS.quad, 2);
    bar.dispose();
  });

  it('should swap with the next tab when dropped on the immediate neighbor', () => {
    const { bar, actions } = createSwitcherFixture();
    const source = bar.getTabButton(WORKSPACE_IDS.quad)!;
    const target = bar.getTabButton(WORKSPACE_IDS.single)!;
    const transfer = {
      data: '',
      effectAllowed: 'all',
      dropEffect: 'move',
      setData(_type: string, value: string) {
        this.data = value;
      },
      getData() {
        return this.data;
      },
    };
    const dragStart = new Event('dragstart', { bubbles: true }) as DragEvent;
    Object.defineProperty(dragStart, 'dataTransfer', { value: transfer });
    source.dispatchEvent(dragStart);
    const drop = new Event('drop', { bubbles: true }) as DragEvent;
    Object.defineProperty(drop, 'dataTransfer', { value: transfer });
    target.dispatchEvent(drop);
    expect(actions.onReorderWorkspace).toHaveBeenCalledWith(WORKSPACE_IDS.quad, 1);
    bar.dispose();
  });

  it('should show an orange insert line on the right when dragging a left tab over a right tab', () => {
    const { bar } = createSwitcherFixture();
    const source = bar.getTabButton(WORKSPACE_IDS.quad)!;
    const target = bar.getTabButton(WORKSPACE_IDS.single)!;
    const transfer = {
      data: '',
      effectAllowed: 'all',
      dropEffect: 'move',
      setData(_type: string, value: string) {
        this.data = value;
      },
      getData() {
        return this.data;
      },
    };
    const dragStart = new Event('dragstart', { bubbles: true }) as DragEvent;
    Object.defineProperty(dragStart, 'dataTransfer', { value: transfer });
    source.dispatchEvent(dragStart);
    const dragOver = new Event('dragover', { bubbles: true }) as DragEvent;
    Object.defineProperty(dragOver, 'dataTransfer', { value: transfer });
    target.dispatchEvent(dragOver);
    const indicator = bar.getInsertIndicatorForTests();
    expect(indicator.style.display).toBe('block');
    expect(indicator.parentElement).toBe(bar.getElement());
    expect(indicator.style.left.length).toBeGreaterThan(0);
    bar.dispose();
  });
});

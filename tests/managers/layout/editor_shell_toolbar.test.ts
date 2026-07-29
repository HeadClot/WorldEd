import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorShellBuilder, type EditorToolbarActions } from '../../../src/managers/layout/editor_shell_builder.js';
import { Toolbar } from '../../../src/ui/toolbar.js';

interface ToolbarButtonBuilder {
  createToolbarButtons(toolbar: Toolbar, actions: EditorToolbarActions): void;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('EditorShellBuilder toolbar', () => {
  it('uses the categorized Add menu without duplicated creation icons', () => {
    const toolbar = new Toolbar(document.body);
    const builder = new EditorShellBuilder() as unknown as ToolbarButtonBuilder;
    builder.createToolbarButtons(toolbar, createToolbarActions());
    const labels = Array.from(document.querySelectorAll('button')).map(getButtonLabel);
    expect(labels).toContain('Add');
    expect(labels.filter((label) => label.startsWith('Add '))).toEqual([]);
    toolbar.dispose();
  });

  it('places MCP as the last toolbar control after a trailing spacer', () => {
    const toolbar = new Toolbar(document.body);
    const builder = new EditorShellBuilder() as unknown as ToolbarButtonBuilder;
    builder.createToolbarButtons(toolbar, createToolbarActions());
    const labels = Array.from(document.querySelectorAll('button')).map(getButtonLabel);
    expect(labels[labels.length - 1]).toBe('MCP');
    expect(document.querySelector('[data-toolbar-trailing-spacer="true"]')).not.toBeNull();
    toolbar.dispose();
  });

  it('starts the MCP button inactive and can glow orange when running', () => {
    const toolbar = new Toolbar(document.body);
    const builder = new EditorShellBuilder() as unknown as ToolbarButtonBuilder;
    builder.createToolbarButtons(toolbar, createToolbarActions());
    const mcpButton = Array.from(document.querySelectorAll('button')).find(
      (button) => getButtonLabel(button) === 'MCP',
    ) as HTMLButtonElement | undefined;
    expect(mcpButton).toBeTruthy();
    expect(mcpButton!.dataset['active']).toBe('false');
    toolbar.setButtonActiveByLabel('MCP', true);
    expect(mcpButton!.dataset['active']).toBe('true');
    expect(mcpButton!.style.background).toContain('232');
    toolbar.dispose();
  });
});

/**
 * Reads the accessible label used to identify a toolbar control.
 *
 * @param button Toolbar or menu button.
 * @returns Accessible label or visible button text.
 */
function getButtonLabel(button: Element): string {
  return button.getAttribute('aria-label') ?? button.getAttribute('title') ?? button.textContent ?? '';
}

/**
 * Creates inert callbacks for rendering the editor toolbar in isolation.
 *
 * @returns Complete toolbar action implementation.
 */
function createToolbarActions(): EditorToolbarActions {
  return new Proxy(
    {},
    {
      get: () => vi.fn(),
    },
  ) as EditorToolbarActions;
}

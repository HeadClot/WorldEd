import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Theme } from '../../../src/theme.js';
import { SelectionManager } from '../../../src/selection/object/selection_manager.js';
import { PropertiesPanel } from '../../../src/ui/properties/properties_panel.js';
import { SolidModel } from '../../../src/solid/model/solid_model.js';
import { SolidOperation } from '../../../src/solid/types/solid_operation.js';

describe('PropertiesPanel solid model section', () => {
  let container: HTMLElement;
  let selectionManager: SelectionManager;
  let panel: PropertiesPanel;
  let model: SolidModel;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    selectionManager = new SelectionManager();
    panel = new PropertiesPanel(container, Theme, selectionManager);
    model = new SolidModel('SolidProps');
    model.addBoxBrush(2, SolidOperation.Additive);
  });

  afterEach(() => {
    panel.dispose();
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  it('shows the solid model section when the solid root is bound', () => {
    panel.bindObjects([model.root]);
    const section = findSolidModelSection(panel.getContainer());
    expect(section).not.toBeNull();
    expect(section!.style.display).not.toBe('none');
    expect(section!.textContent).toContain('Inverted world');
    expect(section!.textContent).toContain('+ Box Brush');
  });

  it('shows the solid model section when only the result mesh is selected', () => {
    selectionManager.selectObject(model.getResultMesh());
    const section = findSolidModelSection(panel.getContainer());
    expect(section).not.toBeNull();
    expect(section!.style.display).not.toBe('none');
  });

  it('shows the solid model section for an empty solid model root', () => {
    const empty = new SolidModel('EmptySolid');
    panel.bindObjects([empty.root]);
    const section = findSolidModelSection(panel.getContainer());
    expect(section).not.toBeNull();
    expect(section!.style.display).not.toBe('none');
    expect(section!.textContent).toContain('Inverted world');
  });

  it('invokes onSetInvertedWorld when the checkbox is toggled', () => {
    const onSetInvertedWorld = vi.fn();
    panel.setSolidBrushHandlers({
      onSetOperation: vi.fn(),
      onAddBoxBrush: vi.fn(),
      onMoveToFirst: vi.fn(),
      onMoveToLast: vi.fn(),
      onSetInvertedWorld,
    });
    panel.bindObjects([model.root]);
    const section = findSolidModelSection(panel.getContainer())!;
    const checkbox = section.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox).toBeTruthy();
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onSetInvertedWorld).toHaveBeenCalledWith(true);
  });

  it('hides the solid section after unbind', () => {
    panel.bindObjects([model.root]);
    panel.unbindObject();
    const section = findSolidModelSection(panel.getContainer());
    expect(section!.style.display).toBe('none');
  });
});

/**
 * Finds the Solid Model section element in the properties panel.
 *
 * @param panelRoot Properties panel container.
 * @returns Section element or null.
 */
function findSolidModelSection(panelRoot: HTMLElement): HTMLElement | null {
  for (const child of Array.from(panelRoot.children)) {
    const element = child as HTMLElement;
    if (element.textContent?.includes('Solid Model') && element.textContent.includes('Inverted world')) {
      return element;
    }
  }
  return null;
}

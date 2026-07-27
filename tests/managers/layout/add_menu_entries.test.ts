import { describe, expect, it, vi } from 'vitest';
import { createAddMenuEntries, type AddMenuActions } from '../../../src/managers/layout/add_menu_entries.js';
import { isMenuAction, isMenuSubmenu, type ToolbarMenuEntry } from '../../../src/ui/menu/menu_types.js';

/**
 * Returns the child entries of a submenu and fails for any other entry type.
 *
 * @param entry Menu entry expected to contain children.
 * @returns Children belonging to the submenu entry.
 */
function getSubmenuChildren(entry: ToolbarMenuEntry): ToolbarMenuEntry[] {
  expect(isMenuSubmenu(entry)).toBe(true);
  return isMenuSubmenu(entry) ? entry.children : [];
}

describe('createAddMenuEntries', () => {
  it('groups every creation action into the expected category', () => {
    const actions = createActionSpies();
    const entries = createAddMenuEntries(actions);
    expect(entries.map((entry) => entry.label)).toEqual(['Geometry', 'Terrain', 'Brushes']);
    expect(getSubmenuChildren(entries[0]!).map((entry) => entry.label)).toEqual([
      'Cube',
      'Sphere',
      'Cylinder',
      'Plane',
    ]);
    expect(getSubmenuChildren(entries[1]!).map((entry) => entry.label)).toEqual(['Terrain']);
    expect(getSubmenuChildren(entries[2]!).map((entry) => entry.label)).toEqual(['Solid Model']);
  });

  it('routes every categorized item to its existing creation callback', () => {
    const actions = createActionSpies();
    const entries = createAddMenuEntries(actions);
    entries.flatMap(getSubmenuChildren).forEach((entry) => {
      expect(isMenuAction(entry)).toBe(true);
      if (isMenuAction(entry)) entry.onClick();
    });
    Object.values(actions).forEach((callback) => expect(callback).toHaveBeenCalledTimes(1));
  });
});

/**
 * Creates isolated spies for every Add menu creation callback.
 *
 * @returns Complete Add menu callback collection.
 */
function createActionSpies(): AddMenuActions {
  return {
    onAddCube: vi.fn(),
    onAddSphere: vi.fn(),
    onAddCylinder: vi.fn(),
    onAddPlane: vi.fn(),
    onAddTerrain: vi.fn(),
    onAddSolidModel: vi.fn(),
  };
}

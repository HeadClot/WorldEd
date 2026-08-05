import { describe, it, expect } from 'vitest';
import { buildViewportToolObjectMenuEntries } from '@/tools/chrome/options/viewport_tool_object_menu.js';
import { ObjectApplyTransformKind } from '@/types/object_apply_transform_kind.js';
import { isMenuSubmenu, isMenuAction, isMenuSeparator } from '@/ui/menu/menu_types.js';

describe('buildViewportToolObjectMenuEntries', () => {
  it('exposes Object → Apply with Blender-style bake actions', () => {
    const chosen: ObjectApplyTransformKind[] = [];
    const entries = buildViewportToolObjectMenuEntries((kind) => {
      chosen.push(kind);
    });
    expect(entries).toHaveLength(1);
    const apply = entries[0]!;
    expect(isMenuSubmenu(apply)).toBe(true);
    if (!isMenuSubmenu(apply)) {
      return;
    }
    expect(apply.label).toBe('Apply');
    const labels = apply.children
      .filter((entry) => isMenuAction(entry))
      .map((entry) => (isMenuAction(entry) ? entry.label : ''));
    expect(labels).toEqual(['Location', 'Rotation', 'Scale', 'All Transforms', 'Rotation & Scale']);
    expect(apply.children.some((entry) => isMenuSeparator(entry))).toBe(true);
    const location = apply.children.find((entry) => isMenuAction(entry) && entry.label === 'Location');
    if (location && isMenuAction(location)) {
      location.onClick();
    }
    expect(chosen).toEqual([ObjectApplyTransformKind.LOCATION]);
  });
});

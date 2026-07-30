import { describe, expect, it } from 'vitest';
import { deserializeAreaLayout, serializeAreaLayout } from '@/layout/area/area_layout_serializer.js';
import { createQuadLayout, DEFAULT_AREA_IDS } from '@/layout/area/area_layout_presets.js';
import { countAreaLeaves, listAreaLeafPlacements } from '@/layout/area/area_layout_tree.js';

describe('area_layout_serializer', () => {
  it('should round-trip a quad layout tree', () => {
    const root = createQuadLayout();
    const document = serializeAreaLayout(root);
    const restored = deserializeAreaLayout(document);
    expect(restored).not.toBeNull();
    expect(countAreaLeaves(restored!)).toBe(4);
    const ids = listAreaLeafPlacements(restored!)
      .map((item) => item.payload.areaId)
      .sort();
    expect(ids).toEqual(
      [DEFAULT_AREA_IDS.top, DEFAULT_AREA_IDS.front, DEFAULT_AREA_IDS.side, DEFAULT_AREA_IDS.perspective].sort(),
    );
  });

  it('should reject unknown versions and corrupt payloads', () => {
    expect(deserializeAreaLayout(null)).toBeNull();
    expect(deserializeAreaLayout({ version: 99, root: {} })).toBeNull();
    expect(deserializeAreaLayout({ version: 1, root: { type: 'leaf' } })).toBeNull();
  });
});

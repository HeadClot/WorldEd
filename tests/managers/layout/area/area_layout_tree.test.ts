import { describe, expect, it } from 'vitest';
import { createViewportLeafPayload } from '../../../../src/managers/layout/area/area_editor_type.js';
import {
  AREA_RECT_EPSILON,
  areaNumbersNearlyEqual,
  createUnitAreaRect,
} from '../../../../src/managers/layout/area/area_rect.js';
import {
  cloneAreaTree,
  countAreaLeaves,
  joinAreaLeaves,
  listAreaLeafPlacements,
  setSplitRatioBetweenAreas,
  splitAreaLeaf,
} from '../../../../src/managers/layout/area/area_layout_tree.js';
import {
  createDualTopPerspectiveLayout,
  createQuadLayout,
  createSinglePerspectiveLayout,
  createTripleLayout,
  DEFAULT_AREA_IDS,
} from '../../../../src/managers/layout/area/area_layout_presets.js';
import { ViewportKind } from '../../../../src/viewports/viewport_kind.js';

/**
 * Sums leaf rect areas; unit square should sum to ~1.
 *
 * @param root Layout tree.
 * @returns Total covered area.
 */
function totalCoveredArea(root: ReturnType<typeof createQuadLayout>): number {
  return listAreaLeafPlacements(root).reduce((sum, item) => sum + item.rect.width * item.rect.height, 0);
}

describe('area_layout_tree', () => {
  it('should list four non-overlapping leaves that fill the unit square for the quad preset', () => {
    const root = createQuadLayout();
    const placements = listAreaLeafPlacements(root);
    expect(placements).toHaveLength(4);
    expect(totalCoveredArea(root)).toBeCloseTo(1, 6);
    const ids = placements.map((item) => item.payload.areaId).sort();
    expect(ids).toEqual(
      [DEFAULT_AREA_IDS.top, DEFAULT_AREA_IDS.front, DEFAULT_AREA_IDS.side, DEFAULT_AREA_IDS.perspective].sort(),
    );
  });

  it('should match historical leaf counts for pane-count presets', () => {
    expect(countAreaLeaves(createSinglePerspectiveLayout())).toBe(1);
    expect(countAreaLeaves(createDualTopPerspectiveLayout())).toBe(2);
    expect(countAreaLeaves(createTripleLayout())).toBe(3);
    expect(countAreaLeaves(createQuadLayout())).toBe(4);
  });

  it('should split a leaf into two and keep coverage of the unit square', () => {
    let root = createSinglePerspectiveLayout();
    const newPayload = createViewportLeafPayload('pane_extra', ViewportKind.TOP);
    root = splitAreaLeaf(root, DEFAULT_AREA_IDS.perspective, 'horizontal', 0.4, newPayload);
    expect(countAreaLeaves(root)).toBe(2);
    expect(totalCoveredArea(root)).toBeCloseTo(1, 6);
    const placements = listAreaLeafPlacements(root);
    const left = placements.find((item) => item.payload.areaId === DEFAULT_AREA_IDS.perspective)!;
    const right = placements.find((item) => item.payload.areaId === 'pane_extra')!;
    expect(left.rect.width).toBeCloseTo(0.4, 6);
    expect(right.rect.width).toBeCloseTo(0.6, 6);
    expect(areaNumbersNearlyEqual(left.rect.x + left.rect.width, right.rect.x)).toBe(true);
  });

  it('should join sibling leaves back into one area', () => {
    let root = createDualTopPerspectiveLayout();
    const joined = joinAreaLeaves(root, DEFAULT_AREA_IDS.perspective, DEFAULT_AREA_IDS.top);
    expect(joined).not.toBeNull();
    if (joined === null) return;
    expect(countAreaLeaves(joined)).toBe(1);
    expect(joined.type).toBe('leaf');
    if (joined.type === 'leaf') {
      expect(joined.payload.areaId).toBe(DEFAULT_AREA_IDS.perspective);
    }
    expect(totalCoveredArea(joined)).toBeCloseTo(1, 6);
  });

  it('should join full-edge non-sibling neighbors in the quad layout', () => {
    const root = createQuadLayout();
    // top (upper-left) and side (lower-left) share a full vertical column edge.
    const joined = joinAreaLeaves(root, DEFAULT_AREA_IDS.top, DEFAULT_AREA_IDS.side);
    expect(joined).not.toBeNull();
    expect(countAreaLeaves(joined!)).toBe(3);
    const placements = listAreaLeafPlacements(joined!);
    const survivor = placements.find((item) => item.payload.areaId === DEFAULT_AREA_IDS.top)!;
    expect(survivor.rect.height).toBeCloseTo(1, 6);
    expect(survivor.rect.width).toBeCloseTo(0.5, 6);
    expect(totalCoveredArea(joined!)).toBeCloseTo(1, 6);
  });

  it('should refuse to join when only one leaf remains', () => {
    const root = createSinglePerspectiveLayout();
    const result = joinAreaLeaves(root, DEFAULT_AREA_IDS.perspective, 'missing');
    expect(result).toBeNull();
  });

  it('should resize non-sibling neighbors by updating the separating ancestor ratio', () => {
    const root = createQuadLayout();
    const resized = setSplitRatioBetweenAreas(root, DEFAULT_AREA_IDS.top, DEFAULT_AREA_IDS.side, 0.25);
    const placements = listAreaLeafPlacements(resized);
    const top = placements.find((item) => item.payload.areaId === DEFAULT_AREA_IDS.top)!;
    const side = placements.find((item) => item.payload.areaId === DEFAULT_AREA_IDS.side)!;
    expect(top.rect.height).toBeCloseTo(0.25, 6);
    expect(side.rect.y).toBeCloseTo(0.25, 6);
    expect(side.rect.height).toBeCloseTo(0.75, 6);
  });

  it('should deep clone trees without sharing node identity', () => {
    const root = createQuadLayout();
    const cloned = cloneAreaTree(root);
    expect(cloned).not.toBe(root);
    expect(countAreaLeaves(cloned)).toBe(4);
    expect(listAreaLeafPlacements(cloned)[0]!.rect).toEqual(listAreaLeafPlacements(root)[0]!.rect);
  });

  it('should keep unit bounds at epsilon for every leaf edge inside the square', () => {
    const placements = listAreaLeafPlacements(createQuadLayout());
    for (const item of placements) {
      expect(item.rect.x).toBeGreaterThanOrEqual(-AREA_RECT_EPSILON);
      expect(item.rect.y).toBeGreaterThanOrEqual(-AREA_RECT_EPSILON);
      expect(item.rect.x + item.rect.width).toBeLessThanOrEqual(1 + AREA_RECT_EPSILON);
      expect(item.rect.y + item.rect.height).toBeLessThanOrEqual(1 + AREA_RECT_EPSILON);
    }
    void createUnitAreaRect;
  });
});

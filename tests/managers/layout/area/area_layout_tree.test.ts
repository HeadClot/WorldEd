import { describe, expect, it } from 'vitest';
import { createViewportLeafPayload } from '../../../../src/managers/layout/area/area_editor_type.js';
import {
  AREA_RECT_EPSILON,
  areaNumbersNearlyEqual,
  createUnitAreaRect,
} from '../../../../src/managers/layout/area/area_rect.js';
import {
  cloneAreaTree,
  computeSplitRatioFromNormalizedPointer,
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

  it('should resize non-sibling neighbors without moving unrelated panes', () => {
    const root = createQuadLayout();
    const before = listAreaLeafPlacements(root);
    const frontBefore = before.find((item) => item.payload.areaId === DEFAULT_AREA_IDS.front)!;
    const resized = setSplitRatioBetweenAreas(root, DEFAULT_AREA_IDS.top, DEFAULT_AREA_IDS.side, 0.25);
    const placements = listAreaLeafPlacements(resized);
    const top = placements.find((item) => item.payload.areaId === DEFAULT_AREA_IDS.top)!;
    const side = placements.find((item) => item.payload.areaId === DEFAULT_AREA_IDS.side)!;
    const frontAfter = placements.find((item) => item.payload.areaId === DEFAULT_AREA_IDS.front)!;
    expect(top.rect.height).toBeCloseTo(0.25, 6);
    expect(side.rect.y).toBeCloseTo(0.25, 6);
    expect(side.rect.height).toBeCloseTo(0.75, 6);
    expect(frontAfter.rect.height).toBeCloseTo(frontBefore.rect.height, 6);
    expect(frontAfter.rect.y).toBeCloseTo(frontBefore.rect.y, 6);
  });

  it('keeps the middle|right T-junction border under the pointer without resizing the left pane', () => {
    const newId = 'pane_split_right';
    let root = createDualTopPerspectiveLayout();
    root = splitAreaLeaf(
      root,
      DEFAULT_AREA_IDS.top,
      'horizontal',
      0.5,
      createViewportLeafPayload(newId, ViewportKind.TOP),
    );
    const placements = listAreaLeafPlacements(root);
    const left = placements.find((item) => item.payload.areaId === DEFAULT_AREA_IDS.top)!;
    const middle = placements.find((item) => item.payload.areaId === newId)!;
    const right = placements.find((item) => item.payload.areaId === DEFAULT_AREA_IDS.perspective)!;
    const borderX = right.rect.x;
    const leftWidthBefore = left.rect.width;
    const ratioAtBorder = computeSplitRatioFromNormalizedPointer(
      root,
      newId,
      DEFAULT_AREA_IDS.perspective,
      'horizontal',
      borderX,
      0.5,
    );
    expect(ratioAtBorder).toBeCloseTo(middle.rect.width / (middle.rect.width + right.rect.width), 6);
    const resized = setSplitRatioBetweenAreas(root, newId, DEFAULT_AREA_IDS.perspective, ratioAtBorder);
    const after = listAreaLeafPlacements(resized);
    const leftAfter = after.find((item) => item.payload.areaId === DEFAULT_AREA_IDS.top)!;
    const middleAfter = after.find((item) => item.payload.areaId === newId)!;
    const rightAfter = after.find((item) => item.payload.areaId === DEFAULT_AREA_IDS.perspective)!;
    expect(middleAfter.rect.x + middleAfter.rect.width).toBeCloseTo(borderX, 6);
    expect(rightAfter.rect.x).toBeCloseTo(borderX, 6);
    expect(leftAfter.rect.width).toBeCloseTo(leftWidthBefore, 6);
    const moved = setSplitRatioBetweenAreas(root, newId, DEFAULT_AREA_IDS.perspective, 0.5);
    const movedPlacements = listAreaLeafPlacements(moved);
    const leftMoved = movedPlacements.find((item) => item.payload.areaId === DEFAULT_AREA_IDS.top)!;
    const middleMoved = movedPlacements.find((item) => item.payload.areaId === newId)!;
    const rightMoved = movedPlacements.find((item) => item.payload.areaId === DEFAULT_AREA_IDS.perspective)!;
    expect(leftMoved.rect.width).toBeCloseTo(leftWidthBefore, 6);
    expect(middleMoved.rect.width + rightMoved.rect.width).toBeCloseTo(middle.rect.width + right.rect.width, 6);
    expect(middleMoved.rect.width).toBeCloseTo(rightMoved.rect.width, 6);
  });

  it('maps pointer on a sibling border within a nested parent without jumping', () => {
    const newId = 'pane_nested';
    let root = createDualTopPerspectiveLayout();
    root = splitAreaLeaf(
      root,
      DEFAULT_AREA_IDS.perspective,
      'horizontal',
      0.4,
      createViewportLeafPayload(newId, ViewportKind.PERSPECTIVE),
    );
    const placements = listAreaLeafPlacements(root);
    const leftOfWorkspace = placements.find((item) => item.payload.areaId === DEFAULT_AREA_IDS.top)!;
    const leftOfPair = placements.find((item) => item.payload.areaId === DEFAULT_AREA_IDS.perspective)!;
    const rightOfPair = placements.find((item) => item.payload.areaId === newId)!;
    const borderX = rightOfPair.rect.x;
    const leftWorkspaceWidth = leftOfWorkspace.rect.width;
    const ratioAtBorder = computeSplitRatioFromNormalizedPointer(
      root,
      DEFAULT_AREA_IDS.perspective,
      newId,
      'horizontal',
      borderX,
      0.5,
    );
    expect(ratioAtBorder).toBeCloseTo(0.4, 6);
    const resized = setSplitRatioBetweenAreas(root, DEFAULT_AREA_IDS.perspective, newId, ratioAtBorder);
    const after = listAreaLeafPlacements(resized);
    const leftAfter = after.find((item) => item.payload.areaId === DEFAULT_AREA_IDS.perspective)!;
    const workspaceLeftAfter = after.find((item) => item.payload.areaId === DEFAULT_AREA_IDS.top)!;
    expect(leftAfter.rect.x + leftAfter.rect.width).toBeCloseTo(borderX, 6);
    expect(workspaceLeftAfter.rect.width).toBeCloseTo(leftWorkspaceWidth, 6);
    void leftOfPair;
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

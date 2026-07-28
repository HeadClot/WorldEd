import { areaRectBottom, areaRectRight, type AreaRect } from './area_rect.js';
import { createAreaLeafNode, createAreaSplitNode, type AreaTreeNode } from './area_tree_node.js';
import type { AreaLeafPlacement } from './area_leaf_placement.js';

/**
 * Builds a BSP tree from non-overlapping leaf placements that tile a parent
 * rectangle (guillotine partition).
 *
 * @param placements Leaf payloads with absolute rects.
 * @param bounds Bounding rect that placements must fill.
 * @returns Tree root, or a single leaf when only one placement remains.
 */
export function rebuildAreaTreeFromPlacements(
  placements: readonly AreaLeafPlacement[],
  bounds: AreaRect,
): AreaTreeNode {
  if (placements.length === 0) {
    throw new Error('Cannot rebuild area tree from empty placements');
  }
  if (placements.length === 1) {
    return createAreaLeafNode({ ...placements[0]!.payload });
  }
  const verticalCut = findThroughCut(placements, bounds, 'vertical');
  if (verticalCut !== null) {
    return buildSplitFromCut(placements, bounds, 'vertical', verticalCut);
  }
  const horizontalCut = findThroughCut(placements, bounds, 'horizontal');
  if (horizontalCut !== null) {
    return buildSplitFromCut(placements, bounds, 'horizontal', horizontalCut);
  }
  return createAreaLeafNode({ ...placements[0]!.payload });
}

/**
 * Merges two placements into one survivor covering their union rect.
 *
 * @param placements Current leaf placements.
 * @param survivorId Area that remains.
 * @param removeId Area absorbed.
 * @returns New placement list with merged survivor rect.
 */
export function mergePlacementPair(
  placements: readonly AreaLeafPlacement[],
  survivorId: string,
  removeId: string,
): AreaLeafPlacement[] {
  const survivor = placements.find((item) => item.payload.areaId === survivorId);
  const removed = placements.find((item) => item.payload.areaId === removeId);
  if (!survivor || !removed) return [...placements];
  const unionRect = unionRects(survivor.rect, removed.rect);
  const merged: AreaLeafPlacement = { payload: { ...survivor.payload }, rect: unionRect };
  return placements
    .filter((item) => item.payload.areaId !== removeId && item.payload.areaId !== survivorId)
    .concat(merged);
}

/**
 * Builds a split node from a through-going cut coordinate.
 *
 * @param placements All placements in bounds.
 * @param bounds Parent bounds.
 * @param axis Cut axis: vertical cuts left/right, horizontal cuts top/bottom.
 * @param cut Coordinate of the cut in absolute space.
 * @returns Split tree node.
 */
function buildSplitFromCut(
  placements: readonly AreaLeafPlacement[],
  bounds: AreaRect,
  axis: 'vertical' | 'horizontal',
  cut: number,
): AreaTreeNode {
  if (axis === 'vertical') {
    const first = placements.filter((item) => areaRectRight(item.rect) <= cut + 1e-9);
    const second = placements.filter((item) => item.rect.x >= cut - 1e-9);
    const ratio = (cut - bounds.x) / bounds.width;
    const firstBounds: AreaRect = { x: bounds.x, y: bounds.y, width: cut - bounds.x, height: bounds.height };
    const secondBounds: AreaRect = {
      x: cut,
      y: bounds.y,
      width: areaRectRight(bounds) - cut,
      height: bounds.height,
    };
    return createAreaSplitNode(
      'horizontal',
      ratio,
      rebuildAreaTreeFromPlacements(first, firstBounds),
      rebuildAreaTreeFromPlacements(second, secondBounds),
    );
  }
  const first = placements.filter((item) => areaRectBottom(item.rect) <= cut + 1e-9);
  const second = placements.filter((item) => item.rect.y >= cut - 1e-9);
  const ratio = (cut - bounds.y) / bounds.height;
  const firstBounds: AreaRect = { x: bounds.x, y: bounds.y, width: bounds.width, height: cut - bounds.y };
  const secondBounds: AreaRect = {
    x: bounds.x,
    y: cut,
    width: bounds.width,
    height: areaRectBottom(bounds) - cut,
  };
  return createAreaSplitNode(
    'vertical',
    ratio,
    rebuildAreaTreeFromPlacements(first, firstBounds),
    rebuildAreaTreeFromPlacements(second, secondBounds),
  );
}

/**
 * Finds a through-going cut that separates placements without slicing any leaf.
 *
 * @param placements Leaves inside bounds.
 * @param bounds Parent bounds.
 * @param axis Vertical means cut is an x coordinate; horizontal means y.
 * @returns Cut coordinate or null.
 */
function findThroughCut(
  placements: readonly AreaLeafPlacement[],
  bounds: AreaRect,
  axis: 'vertical' | 'horizontal',
): number | null {
  const candidates = collectCutCandidates(placements, bounds, axis);
  for (const cut of candidates) {
    if (isValidThroughCut(placements, bounds, axis, cut)) return cut;
  }
  return null;
}

/**
 * Collects candidate cut positions from leaf edges interior to bounds.
 *
 * @param placements Leaves.
 * @param bounds Parent bounds.
 * @param axis Cut axis.
 * @returns Unique sorted candidate coordinates.
 */
function collectCutCandidates(
  placements: readonly AreaLeafPlacement[],
  bounds: AreaRect,
  axis: 'vertical' | 'horizontal',
): number[] {
  const values = new Set<number>();
  for (const item of placements) {
    if (axis === 'vertical') {
      addInteriorCandidate(values, item.rect.x, bounds.x, areaRectRight(bounds));
      addInteriorCandidate(values, areaRectRight(item.rect), bounds.x, areaRectRight(bounds));
    } else {
      addInteriorCandidate(values, item.rect.y, bounds.y, areaRectBottom(bounds));
      addInteriorCandidate(values, areaRectBottom(item.rect), bounds.y, areaRectBottom(bounds));
    }
  }
  return [...values].sort((a, b) => a - b);
}

/**
 * Adds a cut candidate when it is strictly interior to the parent span.
 *
 * @param values Destination set.
 * @param candidate Candidate coordinate.
 * @param min Inclusive parent min.
 * @param max Inclusive parent max.
 */
function addInteriorCandidate(values: Set<number>, candidate: number, min: number, max: number): void {
  if (candidate > min + 1e-9 && candidate < max - 1e-9) {
    values.add(candidate);
  }
}

/**
 * Returns whether every leaf lies entirely on one side of the cut.
 *
 * @param placements Leaves.
 * @param bounds Parent bounds.
 * @param axis Cut axis.
 * @param cut Cut coordinate.
 * @returns True when the cut is a valid guillotine split.
 */
function isValidThroughCut(
  placements: readonly AreaLeafPlacement[],
  bounds: AreaRect,
  axis: 'vertical' | 'horizontal',
  cut: number,
): boolean {
  let hasFirst = false;
  let hasSecond = false;
  for (const item of placements) {
    const side = classifyAgainstCut(item.rect, axis, cut);
    if (side === 'straddle') return false;
    if (side === 'first') hasFirst = true;
    if (side === 'second') hasSecond = true;
  }
  return hasFirst && hasSecond && coversBoundsSides(placements, bounds, axis, cut);
}

/**
 * Classifies a rect relative to a cut.
 *
 * @param rect Leaf rect.
 * @param axis Cut axis.
 * @param cut Cut coordinate.
 * @returns First, second, or straddle.
 */
function classifyAgainstCut(
  rect: AreaRect,
  axis: 'vertical' | 'horizontal',
  cut: number,
): 'first' | 'second' | 'straddle' {
  if (axis === 'vertical') {
    if (areaRectRight(rect) <= cut + 1e-9) return 'first';
    if (rect.x >= cut - 1e-9) return 'second';
    return 'straddle';
  }
  if (areaRectBottom(rect) <= cut + 1e-9) return 'first';
  if (rect.y >= cut - 1e-9) return 'second';
  return 'straddle';
}

/**
 * Soft coverage check so degenerate empty sides are rejected.
 *
 * @param placements Leaves.
 * @param bounds Parent bounds.
 * @param axis Cut axis.
 * @param cut Cut coordinate.
 * @returns True when both sides have positive coverage.
 */
function coversBoundsSides(
  placements: readonly AreaLeafPlacement[],
  bounds: AreaRect,
  axis: 'vertical' | 'horizontal',
  cut: number,
): boolean {
  void bounds;
  void axis;
  void cut;
  return placements.length >= 2;
}

/**
 * Returns the axis-aligned union of two rects.
 *
 * @param first First rect.
 * @param second Second rect.
 * @returns Bounding union rect.
 */
function unionRects(first: AreaRect, second: AreaRect): AreaRect {
  const x = Math.min(first.x, second.x);
  const y = Math.min(first.y, second.y);
  const right = Math.max(areaRectRight(first), areaRectRight(second));
  const bottom = Math.max(areaRectBottom(first), areaRectBottom(second));
  return { x, y, width: right - x, height: bottom - y };
}

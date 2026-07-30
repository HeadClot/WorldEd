import { areaNumbersNearlyEqual, areaRectBottom, areaRectRight, type AreaRect } from './area_rect.js';
import type { AreaLeafPlacement } from './area_leaf_placement.js';
import type { AreaSplitDirection } from './area_split_direction.js';

/** Shared border between two adjacent leaf areas. */
export interface AreaSharedBorder {
  firstAreaId: string;
  secondAreaId: string;
  /** Axis of the border: horizontal means a vertical divider (left|right). */
  direction: AreaSplitDirection;
  /** Normalized border segment as a thin rect for hit testing. */
  borderRect: AreaRect;
}

/**
 * Lists every pair of leaves that share a full edge (for splitters and join).
 *
 * @param placements Current leaf placements.
 * @returns Shared borders (each pair once).
 */
export function listSharedBorders(placements: readonly AreaLeafPlacement[]): AreaSharedBorder[] {
  const borders: AreaSharedBorder[] = [];
  for (let i = 0; i < placements.length; i += 1) {
    for (let j = i + 1; j < placements.length; j += 1) {
      const border = borderBetween(placements[i]!, placements[j]!);
      if (border) borders.push(border);
    }
  }
  return borders;
}

/**
 * Builds a shared border record when two placements share a full edge.
 *
 * @param first First placement.
 * @param second Second placement.
 * @returns Border or null.
 */
function borderBetween(first: AreaLeafPlacement, second: AreaLeafPlacement): AreaSharedBorder | null {
  const vertical = verticalBorderBetween(first, second);
  if (vertical) return vertical;
  return horizontalBorderBetween(first, second);
}

/**
 * Builds a left/right shared border when the placements share a full vertical
 * edge.
 *
 * @param first First placement.
 * @param second Second placement.
 * @returns Horizontal-split border or null.
 */
function verticalBorderBetween(first: AreaLeafPlacement, second: AreaLeafPlacement): AreaSharedBorder | null {
  if (!shareVerticalFullEdge(first.rect, second.rect)) return null;
  const left = areaRectRight(first.rect) <= second.rect.x + 1e-9 ? first : second;
  const right = left === first ? second : first;
  return {
    firstAreaId: left.payload.areaId,
    secondAreaId: right.payload.areaId,
    direction: 'horizontal',
    borderRect: {
      x: areaRectRight(left.rect) - 0.001,
      y: left.rect.y,
      width: 0.002,
      height: left.rect.height,
    },
  };
}

/**
 * Builds a top/bottom shared border when the placements share a full horizontal
 * edge.
 *
 * @param first First placement.
 * @param second Second placement.
 * @returns Vertical-split border or null.
 */
function horizontalBorderBetween(first: AreaLeafPlacement, second: AreaLeafPlacement): AreaSharedBorder | null {
  if (!shareHorizontalFullEdge(first.rect, second.rect)) return null;
  const top = areaRectBottom(first.rect) <= second.rect.y + 1e-9 ? first : second;
  const bottom = top === first ? second : first;
  return {
    firstAreaId: top.payload.areaId,
    secondAreaId: bottom.payload.areaId,
    direction: 'vertical',
    borderRect: {
      x: top.rect.x,
      y: areaRectBottom(top.rect) - 0.001,
      width: top.rect.width,
      height: 0.002,
    },
  };
}

/**
 * Returns whether rects share a full vertical edge.
 *
 * @param a First rect.
 * @param b Second rect.
 * @returns True when aligned as left/right neighbors.
 */
function shareVerticalFullEdge(a: AreaRect, b: AreaRect): boolean {
  const touching = areaNumbersNearlyEqual(areaRectRight(a), b.x) || areaNumbersNearlyEqual(areaRectRight(b), a.x);
  return touching && areaNumbersNearlyEqual(a.y, b.y) && areaNumbersNearlyEqual(a.height, b.height);
}

/**
 * Returns whether rects share a full horizontal edge.
 *
 * @param a First rect.
 * @param b Second rect.
 * @returns True when aligned as top/bottom neighbors.
 */
function shareHorizontalFullEdge(a: AreaRect, b: AreaRect): boolean {
  const touching = areaNumbersNearlyEqual(areaRectBottom(a), b.y) || areaNumbersNearlyEqual(areaRectBottom(b), a.y);
  return touching && areaNumbersNearlyEqual(a.x, b.x) && areaNumbersNearlyEqual(a.width, b.width);
}

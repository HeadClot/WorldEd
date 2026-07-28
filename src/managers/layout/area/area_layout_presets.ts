import { createViewportLeafPayload } from './area_editor_type.js';
import { createAreaLeafNode, createAreaSplitNode, type AreaTreeNode } from './area_tree_node.js';
import { ViewportKind } from '../../../viewports/viewport_kind.js';

/** Stable default area ids matching historical pane ids. */
export const DEFAULT_AREA_IDS = {
  top: 'pane_top',
  front: 'pane_front',
  side: 'pane_side',
  perspective: 'pane_perspective',
} as const;

/**
 * Single full-workspace perspective area.
 *
 * @returns Layout tree root.
 */
export function createSinglePerspectiveLayout(): AreaTreeNode {
  return createAreaLeafNode(createViewportLeafPayload(DEFAULT_AREA_IDS.perspective, ViewportKind.PERSPECTIVE));
}

/**
 * Dual layout: top | perspective (matches historical 2-pane grid).
 *
 * @returns Layout tree root.
 */
export function createDualTopPerspectiveLayout(): AreaTreeNode {
  return createAreaSplitNode(
    'horizontal',
    0.5,
    createAreaLeafNode(createViewportLeafPayload(DEFAULT_AREA_IDS.top, ViewportKind.TOP)),
    createAreaLeafNode(createViewportLeafPayload(DEFAULT_AREA_IDS.perspective, ViewportKind.PERSPECTIVE)),
  );
}

/**
 * Triple layout: top | front on the first row, perspective spanning the bottom
 * (matches historical 3-pane grid structure).
 *
 * @returns Layout tree root.
 */
export function createTripleLayout(): AreaTreeNode {
  const topFront = createAreaSplitNode(
    'horizontal',
    0.5,
    createAreaLeafNode(createViewportLeafPayload(DEFAULT_AREA_IDS.top, ViewportKind.TOP)),
    createAreaLeafNode(createViewportLeafPayload(DEFAULT_AREA_IDS.front, ViewportKind.FRONT)),
  );
  return createAreaSplitNode(
    'vertical',
    0.5,
    topFront,
    createAreaLeafNode(createViewportLeafPayload(DEFAULT_AREA_IDS.perspective, ViewportKind.PERSPECTIVE)),
  );
}

/**
 * Classic quad: top | front over side | perspective.
 *
 * @returns Layout tree root.
 */
export function createQuadLayout(): AreaTreeNode {
  const topRow = createAreaSplitNode(
    'horizontal',
    0.5,
    createAreaLeafNode(createViewportLeafPayload(DEFAULT_AREA_IDS.top, ViewportKind.TOP)),
    createAreaLeafNode(createViewportLeafPayload(DEFAULT_AREA_IDS.front, ViewportKind.FRONT)),
  );
  const bottomRow = createAreaSplitNode(
    'horizontal',
    0.5,
    createAreaLeafNode(createViewportLeafPayload(DEFAULT_AREA_IDS.side, ViewportKind.SIDE)),
    createAreaLeafNode(createViewportLeafPayload(DEFAULT_AREA_IDS.perspective, ViewportKind.PERSPECTIVE)),
  );
  return createAreaSplitNode('vertical', 0.5, topRow, bottomRow);
}

/**
 * Builds a layout matching the historical pane-count presets (1–4).
 *
 * @param paneCount Number of panes from one through four.
 * @returns Layout tree root.
 */
export function createLayoutForPaneCount(paneCount: 1 | 2 | 3 | 4): AreaTreeNode {
  if (paneCount === 1) return createSinglePerspectiveLayout();
  if (paneCount === 2) return createDualTopPerspectiveLayout();
  if (paneCount === 3) return createTripleLayout();
  return createQuadLayout();
}

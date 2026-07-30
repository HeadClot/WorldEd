/**
 * Vertical drop placement relative to an outliner row. Matches the workspace
 * tab strip's edge-insert idea, but for a vertical tree: before / after a row,
 * or into a container that can receive children.
 */
export type OutlinerDropPlacement = 'before' | 'after' | 'into';

/** Tree host padding (matches {@link OutlinerTree} container padding). */
export const OUTLINER_TREE_PADDING_PX = 4;

/** Base left padding on an outliner row (depth 0). */
export const OUTLINER_BASE_PADDING_PX = 4;

/** Extra left padding per hierarchy depth level. */
export const OUTLINER_INDENT_PX = 16;

/** Expand/collapse chevron column width on each row. */
export const OUTLINER_CHEVRON_WIDTH_PX = 16;

/**
 * Object-type icon font size (matches {@link OutlinerItem} icon styling). Used
 * as a fallback width when measuring the live name column is unavailable.
 */
export const OUTLINER_ICON_FONT_PX = 12;

/** Icon trailing margin before the name label. */
export const OUTLINER_ICON_MARGIN_RIGHT_PX = 4;

/**
 * Icon slot after the chevron (font size plus margin). Depth hit-testing treats
 * this chrome as part of the row lead-in so shallow drops do not require aiming
 * at the far-left gutter.
 */
export const OUTLINER_ICON_SLOT_PX = OUTLINER_ICON_FONT_PX + OUTLINER_ICON_MARGIN_RIGHT_PX;

/**
 * Chevron plus icon lead-in after a row's depth padding. Pointers left of the
 * name column claim a shallower insert depth (Unity Hierarchy style).
 */
export const OUTLINER_LEADING_CHROME_PX = OUTLINER_CHEVRON_WIDTH_PX + OUTLINER_ICON_SLOT_PX;

/** Resolved drop after vertical placement and Unity-style horizontal elevation. */
export interface OutlinerResolvedDrop<T> {
  /** Object that receives the drop (may be an ancestor of the hovered row). */
  target: T;
  /** Placement relative to {@link target}. */
  placement: OutlinerDropPlacement;
  /**
   * Row used for insert-line geometry (hovered for after, elevated for
   * before/into).
   */
  visualTarget: T;
  /** Hierarchy depth of the insert (shortens the orange line). */
  insertDepth: number;
}

/**
 * Resolves where a drop lands on a row from the pointer Y and whether the row
 * can accept children (groups). Leaf rows use a simple half-split; container
 * rows reserve a middle band for nesting into the target.
 *
 * @param clientY Pointer Y in viewport coordinates.
 * @param rowTop Top edge of the row in viewport coordinates.
 * @param rowHeight Row height in CSS pixels.
 * @param canAcceptChildren True when dropping in the middle nests under the
 *   row.
 * @returns Placement for the insert line and reparent destination.
 */
export function resolveOutlinerDropPlacement(
  clientY: number,
  rowTop: number,
  rowHeight: number,
  canAcceptChildren: boolean,
): OutlinerDropPlacement {
  if (!Number.isFinite(clientY) || !Number.isFinite(rowTop) || rowHeight <= 0) {
    return 'before';
  }
  const localY = clientY - rowTop;
  if (canAcceptChildren) {
    return resolveContainerRowPlacement(localY, rowHeight);
  }
  return resolveLeafRowPlacement(localY, rowHeight);
}

/**
 * Left edge of a row's depth padding relative to the tree host content origin.
 *
 * @param depth Hierarchy depth starting at 0 for root children.
 * @returns CSS pixel offset from the tree host left padding edge.
 */
export function outlinerRowDepthOffsetPx(depth: number): number {
  const safeDepth = Math.max(0, depth);
  return OUTLINER_TREE_PADDING_PX + OUTLINER_BASE_PADDING_PX + safeDepth * OUTLINER_INDENT_PX;
}

/**
 * Minimum local X (from tree host left) required to claim insert depth {@code
 * depth}. Includes tree padding, row depth indent, and chevron/icon chrome so
 * the name column (not the gutter) is the nested zone.
 *
 * @param depth Hierarchy depth to claim.
 * @returns Local X threshold in CSS pixels.
 */
export function outlinerIndentDepthClaimMinX(depth: number): number {
  if (depth <= 0) return 0;
  return outlinerRowDepthOffsetPx(depth) + OUTLINER_LEADING_CHROME_PX;
}

/**
 * Maps pointer X to a hierarchy indent depth. Shallower depths are claimed when
 * the pointer is still over chevron/icon lead-in of a deeper row, not only the
 * far-left gutter.
 *
 * @param clientX Pointer X in viewport coordinates.
 * @param treeContentLeft Left edge of the tree host in viewport coords.
 * @param maxDepth Deepest depth the hovered row may elevate from (its depth).
 * @returns Depth in {@code [0, maxDepth]}.
 */
export function resolveOutlinerIndentDepth(clientX: number, treeContentLeft: number, maxDepth: number): number {
  if (!Number.isFinite(clientX) || !Number.isFinite(treeContentLeft) || maxDepth < 0) {
    return 0;
  }
  const localX = clientX - treeContentLeft;
  let depth = 0;
  for (let candidate = 1; candidate <= maxDepth; candidate++) {
    if (localX < outlinerIndentDepthClaimMinX(candidate)) break;
    depth = candidate;
  }
  return depth;
}

/**
 * Fallback left inset of the insert line when the name column cannot be
 * measured. Root inserts start at the outliner edge. Nested inserts align to
 * the estimated name column (depth padding + chevron + icon).
 *
 * @param insertDepth Depth of the insertion (0 = root-level full line).
 * @returns Left offset in CSS pixels.
 */
export function outlinerInsertLineLeftPx(insertDepth: number): number {
  if (insertDepth <= 0) return 0;
  return outlinerRowDepthOffsetPx(insertDepth) + OUTLINER_LEADING_CHROME_PX;
}

/**
 * Left inset and width for the insert line at a given hierarchy depth. Prefer
 * {@code nameColumnLeftPx} from the live name label so the line starts exactly
 * where the item text begins.
 *
 * @param hostWidth Tree host client width in CSS pixels.
 * @param insertDepth Depth of the insertion (0 = root-level full line).
 * @param nameColumnLeftPx Optional measured name-column left in host coords.
 * @returns Left offset and line width inside the host.
 */
export function resolveOutlinerInsertLineGeometry(
  hostWidth: number,
  insertDepth: number,
  nameColumnLeftPx: number | null = null,
): { left: number; width: number } {
  if (insertDepth <= 0) {
    return { left: 0, width: Math.max(0, hostWidth) };
  }
  const left =
    nameColumnLeftPx !== null && Number.isFinite(nameColumnLeftPx)
      ? Math.max(0, nameColumnLeftPx)
      : outlinerInsertLineLeftPx(insertDepth);
  return { left, width: Math.max(0, hostWidth - left) };
}

/**
 * When the pointer is on the bottom edge of an expanded parent, the gap looks
 * like "between parent and its children". That must insert as the first child
 * under the parent — never as a full-width sibling after the parent.
 *
 * @param hovered Row under the pointer.
 * @param hoveredDepth Depth of the hovered row.
 * @param placement Vertical placement on the hovered row.
 * @param isExpandedContainer True when the row is an open container with kids.
 * @param getFirstContentChild First content child of a container, or null.
 * @returns Target, depth, and placement after remapping expanded-parent after.
 */
export function remapAfterOnExpandedContainer<T>(
  hovered: T,
  hoveredDepth: number,
  placement: OutlinerDropPlacement,
  isExpandedContainer: (node: T) => boolean,
  getFirstContentChild: (node: T) => T | null,
): { target: T; depth: number; placement: OutlinerDropPlacement } {
  if (placement !== 'after') {
    return { target: hovered, depth: hoveredDepth, placement };
  }
  if (!isExpandedContainer(hovered)) {
    return { target: hovered, depth: hoveredDepth, placement };
  }
  const firstChild = getFirstContentChild(hovered);
  if (!firstChild) {
    return { target: hovered, depth: hoveredDepth, placement: 'into' };
  }
  return { target: firstChild, depth: hoveredDepth + 1, placement: 'before' };
}

/**
 * Elevates an after-drop from a nested row to an ancestor when the pointer
 * indent is shallower. Only walks through last content children so a drop after
 * the final open descendant can land beside the parent (e.g. after an expanded
 * solid). Before/into placements never elevate — hovering before the first
 * child with the pointer left must stay as "before that child" under the
 * parent, not a full-width root sibling of the parent.
 *
 * @param hovered Row object under the pointer.
 * @param hoveredDepth Indent depth of the hovered row.
 * @param placement Vertical placement on the hovered row.
 * @param desiredDepth Indent depth from pointer X.
 * @param getParent Parent of a node, or null at the tree root.
 * @param isLastContentChild True when node is the last content child of parent.
 * @returns Elevated target and its hierarchy depth.
 */
export function elevateOutlinerDropTarget<T>(
  hovered: T,
  hoveredDepth: number,
  placement: OutlinerDropPlacement,
  desiredDepth: number,
  getParent: (node: T) => T | null,
  isLastContentChild: (node: T) => boolean,
): { target: T; depth: number } {
  if (placement !== 'after') return { target: hovered, depth: hoveredDepth };
  let current = hovered;
  let depth = hoveredDepth;
  while (depth > desiredDepth) {
    const parent = getParent(current);
    if (!parent) break;
    if (!isLastContentChild(current)) break;
    current = parent;
    depth -= 1;
  }
  return { target: current, depth };
}

/**
 * Picks which row anchors the insert-line after elevation. After stays on the
 * hovered leaf (end of an expanded block); before/into use the elevated
 * target.
 *
 * @param elevated Elevated drop target.
 * @param hovered Row under the pointer.
 * @param placement Drop placement.
 * @returns Object whose row should show the insert feedback.
 */
export function pickOutlinerDropVisualTarget<T>(elevated: T, hovered: T, placement: OutlinerDropPlacement): T {
  if (placement === 'after') return hovered;
  return elevated;
}

/**
 * Resolves full drop target, placement, and visual row from hover geometry.
 *
 * @param hovered Row object under the pointer.
 * @param hoveredDepth Indent depth of the hovered row.
 * @param clientX Pointer X in viewport coordinates.
 * @param clientY Pointer Y in viewport coordinates.
 * @param rowTop Top of the hovered row in viewport coordinates.
 * @param rowHeight Height of the hovered row.
 * @param treeContentLeft Left edge of the tree content box.
 * @param canAcceptChildren Whether the hovered row can nest children.
 * @param getParent Parent of a node, or null at the tree root.
 * @param isLastContentChild Last-content-child predicate.
 * @param isExpandedContainer Expanded-container predicate for after remapping.
 * @param getFirstContentChild First content child of a container.
 * @returns Elevated target, placement, visual row, and insert depth.
 */
export function resolveOutlinerDropTarget<T>(
  hovered: T,
  hoveredDepth: number,
  clientX: number,
  clientY: number,
  rowTop: number,
  rowHeight: number,
  treeContentLeft: number,
  canAcceptChildren: boolean,
  getParent: (node: T) => T | null,
  isLastContentChild: (node: T) => boolean,
  isExpandedContainer: (node: T) => boolean = () => false,
  getFirstContentChild: (node: T) => T | null = () => null,
): OutlinerResolvedDrop<T> {
  const rawPlacement = resolveOutlinerDropPlacement(clientY, rowTop, rowHeight, canAcceptChildren);
  const remapped = remapAfterOnExpandedContainer(
    hovered,
    hoveredDepth,
    rawPlacement,
    isExpandedContainer,
    getFirstContentChild,
  );
  const desiredDepth = resolveOutlinerIndentDepth(clientX, treeContentLeft, remapped.depth);
  const elevated = elevateOutlinerDropTarget(
    remapped.target,
    remapped.depth,
    remapped.placement,
    desiredDepth,
    getParent,
    isLastContentChild,
  );
  return {
    target: elevated.target,
    placement: remapped.placement,
    visualTarget: pickOutlinerDropVisualTarget(elevated.target, remapped.target, remapped.placement),
    insertDepth: elevated.depth,
  };
}

/**
 * Places a drop on a leaf row: top half before, bottom half after.
 *
 * @param localY Pointer Y relative to the row top.
 * @param rowHeight Row height in CSS pixels.
 * @returns Before or after placement.
 */
function resolveLeafRowPlacement(localY: number, rowHeight: number): OutlinerDropPlacement {
  return localY < rowHeight * 0.5 ? 'before' : 'after';
}

/**
 * Places a drop on a container row: outer quarters reorder as siblings, middle
 * half nests as a child.
 *
 * @param localY Pointer Y relative to the row top.
 * @param rowHeight Row height in CSS pixels.
 * @returns Before, after, or into placement.
 */
function resolveContainerRowPlacement(localY: number, rowHeight: number): OutlinerDropPlacement {
  const topEdge = rowHeight * 0.25;
  const bottomEdge = rowHeight * 0.75;
  if (localY < topEdge) return 'before';
  if (localY > bottomEdge) return 'after';
  return 'into';
}

/**
 * Computes total scrollable content height for a fixed-row virtual list.
 *
 * @param rowCount Number of logical rows.
 * @param rowHeightPx Fixed height of one row in CSS pixels.
 * @param paddingPx Vertical padding applied once at the top and bottom.
 * @returns Content height in CSS pixels.
 */
export function virtualListContentHeightPxResolve(rowCount: number, rowHeightPx: number, paddingPx: number): number {
  const safeCount = Math.max(0, rowCount);
  const safeRow = Math.max(1, rowHeightPx);
  const safePadding = Math.max(0, paddingPx);
  return safeCount * safeRow + safePadding * 2;
}

/**
 * Computes the maximum scroll offset so the last row can reach the viewport.
 *
 * @param contentHeightPx Total content height in CSS pixels.
 * @param viewportHeightPx Visible viewport height in CSS pixels.
 * @returns Maximum scroll offset in CSS pixels (never negative).
 */
export function virtualListMaxScrollOffsetPxResolve(contentHeightPx: number, viewportHeightPx: number): number {
  if (!Number.isFinite(contentHeightPx) || !Number.isFinite(viewportHeightPx)) {
    return 0;
  }
  return Math.max(0, contentHeightPx - Math.max(0, viewportHeightPx));
}

/**
 * Clamps a scroll offset into the valid range.
 *
 * @param scrollOffsetPx Requested scroll offset in CSS pixels.
 * @param maxScrollOffsetPx Maximum allowed offset in CSS pixels.
 * @returns Clamped offset in CSS pixels.
 */
export function virtualListScrollOffsetClamp(scrollOffsetPx: number, maxScrollOffsetPx: number): number {
  if (!Number.isFinite(scrollOffsetPx)) {
    return 0;
  }
  const maxOffset = Math.max(0, maxScrollOffsetPx);
  if (scrollOffsetPx <= 0) {
    return 0;
  }
  if (scrollOffsetPx >= maxOffset) {
    return maxOffset;
  }
  return scrollOffsetPx;
}

/**
 * First logical row index that intersects the viewport at a scroll offset.
 *
 * @param scrollOffsetPx Scroll offset in CSS pixels.
 * @param rowHeightPx Fixed row height in CSS pixels.
 * @param paddingPx Top content padding in CSS pixels.
 * @returns Zero-based first index (may exceed rowCount; caller clamps).
 */
export function virtualListFirstIndexResolve(scrollOffsetPx: number, rowHeightPx: number, paddingPx: number): number {
  const safeRow = Math.max(1, rowHeightPx);
  const y = Math.max(0, scrollOffsetPx - Math.max(0, paddingPx));
  return Math.floor(y / safeRow);
}

/**
 * Pixel remainder after aligning the first row to the scroll offset.
 *
 * @param scrollOffsetPx Scroll offset in CSS pixels.
 * @param rowHeightPx Fixed row height in CSS pixels.
 * @param paddingPx Top content padding in CSS pixels.
 * @returns Clipped amount of the first row in [0, rowHeight).
 */
export function virtualListPixelRemainderResolve(
  scrollOffsetPx: number,
  rowHeightPx: number,
  paddingPx: number,
): number {
  const safeRow = Math.max(1, rowHeightPx);
  const firstIndex = virtualListFirstIndexResolve(scrollOffsetPx, safeRow, paddingPx);
  const rowTop = Math.max(0, paddingPx) + firstIndex * safeRow;
  return Math.max(0, scrollOffsetPx - rowTop);
}

/**
 * CSS translateY for a windowed row strip with no vertical CSS padding. Top and
 * bottom padding are virtual (scroll range only) so both ends of the list show
 * the same inset.
 *
 * @param scrollOffsetPx Scroll offset in CSS pixels.
 * @param rowHeightPx Fixed row height in CSS pixels.
 * @param paddingPx Virtual top/bottom padding in CSS pixels.
 * @returns TranslateY in CSS pixels (positive shifts content down).
 */
export function virtualListContentTranslateYResolve(
  scrollOffsetPx: number,
  rowHeightPx: number,
  paddingPx: number,
): number {
  const safeRow = Math.max(1, rowHeightPx);
  const safePadding = Math.max(0, paddingPx);
  const safeScroll = Number.isFinite(scrollOffsetPx) ? scrollOffsetPx : 0;
  const firstIndex = virtualListFirstIndexResolve(safeScroll, safeRow, safePadding);
  return safePadding + firstIndex * safeRow - safeScroll;
}

/**
 * Number of recycled row slots needed to cover a viewport with overscan.
 *
 * @param viewportHeightPx Visible viewport height in CSS pixels.
 * @param rowHeightPx Fixed row height in CSS pixels.
 * @param overscanRows Extra rows above and below the visible window.
 * @returns Pool size (at least 1).
 */
export function virtualListPoolSizeResolve(
  viewportHeightPx: number,
  rowHeightPx: number,
  overscanRows: number,
): number {
  const safeRow = Math.max(1, rowHeightPx);
  const visible = Math.max(1, Math.ceil(Math.max(0, viewportHeightPx) / safeRow));
  const overscan = Math.max(0, Math.floor(overscanRows));
  return visible + overscan * 2 + 1;
}

/**
 * Exclusive end index of the window starting at firstIndex with a given pool.
 *
 * @param firstIndex First logical index bound to the pool.
 * @param poolSize Number of pool slots.
 * @param rowCount Total logical row count.
 * @returns Exclusive end index clamped to rowCount.
 */
export function virtualListWindowEndIndexResolve(firstIndex: number, poolSize: number, rowCount: number): number {
  const start = Math.max(0, firstIndex);
  const end = start + Math.max(0, poolSize);
  return Math.min(Math.max(0, rowCount), end);
}

/**
 * Scroll offset that keeps a logical row inside the viewport with optional
 * top/bottom breathing room when possible.
 *
 * @param rowIndex Zero-based logical row index.
 * @param rowHeightPx Fixed row height in CSS pixels.
 * @param paddingPx Top content padding in CSS pixels.
 * @param viewportHeightPx Visible viewport height in CSS pixels.
 * @param currentScrollOffsetPx Current scroll offset in CSS pixels.
 * @param maxScrollOffsetPx Maximum scroll offset in CSS pixels.
 * @param marginPx Extra inset from the viewport edges when revealing a row.
 * @returns Next scroll offset in CSS pixels.
 */
export function virtualListScrollOffsetForRowResolve(
  rowIndex: number,
  rowHeightPx: number,
  paddingPx: number,
  viewportHeightPx: number,
  currentScrollOffsetPx: number,
  maxScrollOffsetPx: number,
  marginPx: number = 0,
): number {
  const safeRow = Math.max(1, rowHeightPx);
  const safePadding = Math.max(0, paddingPx);
  const safeViewport = Math.max(0, viewportHeightPx);
  const rowTop = safePadding + Math.max(0, rowIndex) * safeRow;
  const rowBottom = rowTop + safeRow;
  const margin = virtualListRevealMarginClamp(marginPx, safeViewport, safeRow);
  const viewTop = currentScrollOffsetPx;
  const viewBottom = currentScrollOffsetPx + safeViewport;
  const comfortTop = viewTop + margin;
  const comfortBottom = viewBottom - margin;
  if (rowTop >= comfortTop && rowBottom <= comfortBottom) {
    return virtualListScrollOffsetClamp(currentScrollOffsetPx, maxScrollOffsetPx);
  }
  if (rowTop < comfortTop) {
    return virtualListScrollOffsetClamp(rowTop - margin, maxScrollOffsetPx);
  }
  if (rowBottom > comfortBottom) {
    return virtualListScrollOffsetClamp(rowBottom + margin - safeViewport, maxScrollOffsetPx);
  }
  return virtualListScrollOffsetClamp(currentScrollOffsetPx, maxScrollOffsetPx);
}

/**
 * Clamps reveal margin so it never exceeds half the free space around one row.
 *
 * @param marginPx Requested margin in CSS pixels.
 * @param viewportHeightPx Viewport height in CSS pixels.
 * @param rowHeightPx Row height in CSS pixels.
 * @returns Safe margin in CSS pixels.
 */
export function virtualListRevealMarginClamp(marginPx: number, viewportHeightPx: number, rowHeightPx: number): number {
  if (!Number.isFinite(marginPx) || marginPx <= 0) {
    return 0;
  }
  const free = Math.max(0, viewportHeightPx - rowHeightPx);
  return Math.min(marginPx, free * 0.5);
}

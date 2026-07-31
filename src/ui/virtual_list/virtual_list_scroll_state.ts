import {
  virtualListContentHeightPxResolve,
  virtualListContentTranslateYResolve,
  virtualListFirstIndexResolve,
  virtualListMaxScrollOffsetPxResolve,
  virtualListPixelRemainderResolve,
  virtualListPoolSizeResolve,
  virtualListScrollOffsetClamp,
  virtualListScrollOffsetForRowResolve,
  virtualListWindowEndIndexResolve,
} from './virtual_list_metrics.js';

/** Mutable scroll metrics for a fixed-row virtual list. */
export class VirtualListScrollState {
  private scrollOffsetPx: number;
  private rowCount: number;
  private rowHeightPx: number;
  private paddingPx: number;
  private viewportHeightPx: number;
  private overscanRows: number;

  /**
   * Creates scroll state with fixed row geometry defaults.
   *
   * @param rowHeightPx Fixed height of one row in CSS pixels.
   * @param paddingPx Vertical padding applied once at top and bottom.
   * @param overscanRows Extra rows above and below the visible window.
   */
  constructor(rowHeightPx: number, paddingPx: number, overscanRows: number) {
    this.scrollOffsetPx = 0;
    this.rowCount = 0;
    this.rowHeightPx = Math.max(1, rowHeightPx);
    this.paddingPx = Math.max(0, paddingPx);
    this.viewportHeightPx = 0;
    this.overscanRows = Math.max(0, Math.floor(overscanRows));
  }

  /**
   * Returns the current scroll offset in CSS pixels.
   *
   * @returns Scroll offset.
   */
  scrollOffsetPxGet(): number {
    return this.scrollOffsetPx;
  }

  /**
   * Returns the logical row count.
   *
   * @returns Row count.
   */
  rowCountGet(): number {
    return this.rowCount;
  }

  /**
   * Returns the measured viewport height in CSS pixels.
   *
   * @returns Viewport height.
   */
  viewportHeightPxGet(): number {
    return this.viewportHeightPx;
  }

  /**
   * Returns total content height in CSS pixels.
   *
   * @returns Content height.
   */
  contentHeightPxGet(): number {
    return virtualListContentHeightPxResolve(this.rowCount, this.rowHeightPx, this.paddingPx);
  }

  /**
   * Returns the maximum scroll offset in CSS pixels.
   *
   * @returns Maximum offset.
   */
  maxScrollOffsetPxGet(): number {
    return virtualListMaxScrollOffsetPxResolve(this.contentHeightPxGet(), this.viewportHeightPx);
  }

  /**
   * Updates the logical row count and reclamps the scroll offset.
   *
   * @param rowCount New logical row count.
   */
  rowCountSet(rowCount: number): void {
    this.rowCount = Math.max(0, Math.floor(rowCount));
    this.scrollOffsetReclamp();
  }

  /**
   * Updates the measured viewport height and reclamps the scroll offset.
   *
   * @param viewportHeightPx New viewport height in CSS pixels.
   */
  viewportHeightPxSet(viewportHeightPx: number): void {
    this.viewportHeightPx = Math.max(0, viewportHeightPx);
    this.scrollOffsetReclamp();
  }

  /**
   * Sets the scroll offset, clamped to the valid range.
   *
   * @param scrollOffsetPx Requested offset in CSS pixels.
   * @returns True when the offset changed.
   */
  scrollOffsetPxSet(scrollOffsetPx: number): boolean {
    const next = virtualListScrollOffsetClamp(scrollOffsetPx, this.maxScrollOffsetPxGet());
    if (next === this.scrollOffsetPx) {
      return false;
    }
    this.scrollOffsetPx = next;
    return true;
  }

  /**
   * Adds a delta to the scroll offset.
   *
   * @param deltaPx Delta in CSS pixels (positive scrolls down).
   * @returns True when the offset changed.
   */
  scrollByDeltaPx(deltaPx: number): boolean {
    if (!Number.isFinite(deltaPx) || deltaPx === 0) {
      return false;
    }
    return this.scrollOffsetPxSet(this.scrollOffsetPx + deltaPx);
  }

  /**
   * Scrolls so the given row is fully visible when possible.
   *
   * @param rowIndex Zero-based logical row index.
   * @param marginPx Optional inset from the viewport edges when revealing.
   * @returns True when the offset changed.
   */
  scrollToRowIndex(rowIndex: number, marginPx: number = 0): boolean {
    const next = virtualListScrollOffsetForRowResolve(
      rowIndex,
      this.rowHeightPx,
      this.paddingPx,
      this.viewportHeightPx,
      this.scrollOffsetPx,
      this.maxScrollOffsetPxGet(),
      marginPx,
    );
    return this.scrollOffsetPxSet(next);
  }

  /**
   * Sets scroll offset from a 0–1 thumb position along the track.
   *
   * @param percent Normalized position (0 = top, 1 = bottom).
   * @returns True when the offset changed.
   */
  scrollPercentSet(percent: number): boolean {
    if (!Number.isFinite(percent)) {
      return false;
    }
    const clamped = Math.max(0, Math.min(1, percent));
    return this.scrollOffsetPxSet(clamped * this.maxScrollOffsetPxGet());
  }

  /**
   * Returns the normalized thumb position along the track.
   *
   * @returns Value in [0, 1], or 0 when there is no overflow.
   */
  scrollPercentGet(): number {
    const maxOffset = this.maxScrollOffsetPxGet();
    if (maxOffset <= 0) {
      return 0;
    }
    return this.scrollOffsetPx / maxOffset;
  }

  /**
   * Returns whether content overflows the viewport.
   *
   * @returns True when a scrollbar should be interactive.
   */
  overflowIs(): boolean {
    return this.maxScrollOffsetPxGet() > 0;
  }

  /**
   * Returns the first logical index that should bind to the top pool slot.
   *
   * @returns Zero-based index (may exceed rowCount).
   */
  firstIndexGet(): number {
    return virtualListFirstIndexResolve(this.scrollOffsetPx, this.rowHeightPx, this.paddingPx);
  }

  /**
   * Returns the pixel remainder clipped into the first visible row.
   *
   * @returns Remainder in CSS pixels.
   */
  pixelRemainderGet(): number {
    return virtualListPixelRemainderResolve(this.scrollOffsetPx, this.rowHeightPx, this.paddingPx);
  }

  /**
   * Returns the CSS translateY for the windowed row strip.
   *
   * @returns TranslateY in CSS pixels.
   */
  contentTranslateYGet(): number {
    return virtualListContentTranslateYResolve(this.scrollOffsetPx, this.rowHeightPx, this.paddingPx);
  }

  /**
   * Returns how many pool slots are needed for the current viewport.
   *
   * @returns Pool size.
   */
  poolSizeGet(): number {
    return virtualListPoolSizeResolve(this.viewportHeightPx, this.rowHeightPx, this.overscanRows);
  }

  /**
   * Returns the exclusive end logical index for the current window.
   *
   * @returns Exclusive end index.
   */
  windowEndIndexGet(): number {
    return virtualListWindowEndIndexResolve(this.firstIndexGet(), this.poolSizeGet(), this.rowCount);
  }

  /**
   * Returns the top content padding in CSS pixels.
   *
   * @returns Padding.
   */
  paddingPxGet(): number {
    return this.paddingPx;
  }

  /**
   * Returns the fixed row height in CSS pixels.
   *
   * @returns Row height.
   */
  rowHeightPxGet(): number {
    return this.rowHeightPx;
  }

  /** Clamps the current scroll offset after geometry changes. */
  private scrollOffsetReclamp(): void {
    this.scrollOffsetPx = virtualListScrollOffsetClamp(this.scrollOffsetPx, this.maxScrollOffsetPxGet());
  }
}

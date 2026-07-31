import { describe, expect, it } from 'vitest';
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
} from '@/ui/virtual_list/virtual_list_metrics.js';
import { VirtualListScrollState } from '@/ui/virtual_list/virtual_list_scroll_state.js';

describe('virtualListMetrics', () => {
  it('should compute content height from rows and padding', () => {
    expect(virtualListContentHeightPxResolve(10, 22, 4)).toBe(10 * 22 + 8);
  });

  it('should clamp scroll offset to content overflow', () => {
    expect(virtualListMaxScrollOffsetPxResolve(1000, 200)).toBe(800);
    expect(virtualListScrollOffsetClamp(-10, 800)).toBe(0);
    expect(virtualListScrollOffsetClamp(900, 800)).toBe(800);
    expect(virtualListScrollOffsetClamp(100, 800)).toBe(100);
  });

  it('should resolve first index and pixel remainder for smooth scroll', () => {
    expect(virtualListFirstIndexResolve(4 + 22 * 3 + 7, 22, 4)).toBe(3);
    expect(virtualListPixelRemainderResolve(4 + 22 * 3 + 7, 22, 4)).toBe(7);
  });

  it('should keep matching top and bottom padding in content translateY', () => {
    const rowHeight = 22;
    const padding = 4;
    const rowCount = 100;
    const viewport = 200;
    const contentHeight = virtualListContentHeightPxResolve(rowCount, rowHeight, padding);
    const maxScroll = virtualListMaxScrollOffsetPxResolve(contentHeight, viewport);
    expect(virtualListContentTranslateYResolve(0, rowHeight, padding)).toBe(padding);
    const bottomTranslate = virtualListContentTranslateYResolve(maxScroll, rowHeight, padding);
    const firstIndex = virtualListFirstIndexResolve(maxScroll, rowHeight, padding);
    const lastRowOffset = (rowCount - 1 - firstIndex) * rowHeight;
    const lastRowBottom = bottomTranslate + lastRowOffset + rowHeight;
    expect(lastRowBottom).toBe(viewport - padding);
  });

  it('should size the pool from viewport height and overscan', () => {
    const pool = virtualListPoolSizeResolve(220, 22, 2);
    expect(pool).toBe(10 + 4 + 1);
  });

  it('should clamp the window end index to the row count', () => {
    expect(virtualListWindowEndIndexResolve(8, 10, 12)).toBe(12);
    expect(virtualListWindowEndIndexResolve(0, 10, 5)).toBe(5);
  });

  it('should scroll a row into view when above or below the viewport', () => {
    const rowHeight = 22;
    const padding = 4;
    const viewport = 100;
    const maxOffset = 500;
    const up = virtualListScrollOffsetForRowResolve(0, rowHeight, padding, viewport, 80, maxOffset);
    expect(up).toBe(padding);
    const down = virtualListScrollOffsetForRowResolve(20, rowHeight, padding, viewport, 0, maxOffset);
    expect(down).toBeGreaterThan(0);
  });

  it('should leave top and bottom margin when revealing a row', () => {
    const rowHeight = 22;
    const padding = 4;
    const viewport = 200;
    const margin = 44;
    const maxOffset = 2000;
    const down = virtualListScrollOffsetForRowResolve(30, rowHeight, padding, viewport, 0, maxOffset, margin);
    const rowTop = padding + 30 * rowHeight;
    const rowBottom = rowTop + rowHeight;
    expect(down).toBe(rowBottom + margin - viewport);
    const up = virtualListScrollOffsetForRowResolve(5, rowHeight, padding, viewport, 400, maxOffset, margin);
    expect(up).toBe(padding + 5 * rowHeight - margin);
  });

  it('should not scroll when the row already sits inside the comfort zone', () => {
    const rowHeight = 22;
    const padding = 4;
    const viewport = 200;
    const margin = 44;
    const current = 100;
    const rowIndex = 8;
    const next = virtualListScrollOffsetForRowResolve(rowIndex, rowHeight, padding, viewport, current, 2000, margin);
    expect(next).toBe(current);
  });
});

describe('VirtualListScrollState', () => {
  it('should advance first index when scrolling by more than one row', () => {
    const state = new VirtualListScrollState(22, 4, 2);
    state.viewportHeightPxSet(200);
    state.rowCountSet(100);
    const offset = 4 + 22 * 5 + 3;
    expect(state.scrollByDeltaPx(offset)).toBe(true);
    expect(state.firstIndexGet()).toBe(5);
    expect(state.pixelRemainderGet()).toBe(3);
  });

  it('should map scroll percent to the maximum offset', () => {
    const state = new VirtualListScrollState(22, 4, 2);
    state.viewportHeightPxSet(100);
    state.rowCountSet(50);
    expect(state.scrollPercentSet(1)).toBe(true);
    expect(state.scrollOffsetPxGet()).toBe(state.maxScrollOffsetPxGet());
  });
});

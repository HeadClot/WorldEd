import * as THREE from 'three';
import {
  OUTLINER_REVEAL_MARGIN_PX,
  OUTLINER_ROW_HEIGHT_PX,
  OUTLINER_TREE_PADDING_PX,
} from './outliner_drop_placement.js';
import { OutlinerItem } from './outliner_item.js';
import { VirtualListScrollState } from '@/ui/virtual_list/virtual_list_scroll_state.js';
import { VirtualListScrollbar } from '@/ui/virtual_list/virtual_list_scrollbar.js';

/** Extra rows above and below the visible window for smooth scroll rebind. */
const OUTLINER_VIRTUAL_OVERSCAN_ROWS = 3;

/** Fallback viewport height when the host has not been laid out yet. */
const OUTLINER_VIRTUAL_VIEWPORT_FALLBACK_PX = 400;

/**
 * Applies chrome state for a pool slot bound to a logical object.
 *
 * @param item Recycled outliner row.
 * @param object Hierarchy object bound to the slot.
 */
export type OutlinerVirtualSlotChromeApply = (item: OutlinerItem, object: THREE.Object3D) => void;

/**
 * Creates a configured outliner row for the virtual pool.
 *
 * @returns New outliner item ready for rebinding.
 */
export type OutlinerVirtualSlotFactory = () => OutlinerItem;

/**
 * Owns the virtualized row strip, scroll state, and fake scrollbar for the
 * outliner tree host.
 */
export class OutlinerVirtualList {
  private readonly hostElement: HTMLElement;
  private readonly contentElement: HTMLElement;
  private readonly scrollState: VirtualListScrollState;
  private readonly scrollbar: VirtualListScrollbar;
  private readonly pool: OutlinerItem[];
  private readonly itemMap: Map<THREE.Object3D, OutlinerItem>;
  private logicalObjects: readonly THREE.Object3D[];
  private readonly slotFactory: OutlinerVirtualSlotFactory;
  private readonly chromeApply: OutlinerVirtualSlotChromeApply;
  private readonly resizeObserver: ResizeObserver | null;
  private isDisposed: boolean;
  private readonly wheelBound: (event: WheelEvent) => void;
  private readonly keyDownBound: (event: KeyboardEvent) => void;

  /**
   * Creates a virtual list bound to an outliner tree host element.
   *
   * @param hostElement Tree host that clips and positions the strip.
   * @param slotFactory Creates pool rows with callbacks already bound.
   * @param chromeApply Applies selection/expand/visibility/lock for a binding.
   */
  constructor(
    hostElement: HTMLElement,
    slotFactory: OutlinerVirtualSlotFactory,
    chromeApply: OutlinerVirtualSlotChromeApply,
  ) {
    this.hostElement = hostElement;
    this.slotFactory = slotFactory;
    this.chromeApply = chromeApply;
    this.contentElement = document.createElement('div');
    this.scrollState = new VirtualListScrollState(
      OUTLINER_ROW_HEIGHT_PX,
      OUTLINER_TREE_PADDING_PX,
      OUTLINER_VIRTUAL_OVERSCAN_ROWS,
    );
    this.scrollbar = new VirtualListScrollbar();
    this.pool = [];
    this.itemMap = new Map();
    this.logicalObjects = [];
    this.isDisposed = false;
    this.wheelBound = (event) => this.wheelHandle(event);
    this.keyDownBound = (event) => this.keyDownHandle(event);
    this.contentStylesApply();
    this.hostKeyboardFocusEnable();
    this.hostElement.appendChild(this.contentElement);
    this.hostElement.appendChild(this.scrollbar.getElement());
    this.scrollbar.stepRowHeightPxSet(OUTLINER_ROW_HEIGHT_PX);
    this.scrollbar.onPercentChangeSet((percent) => this.scrollPercentFromScrollbarApply(percent));
    this.scrollbar.onStepSet((deltaPx) => this.scrollByDeltaPx(deltaPx));
    this.hostElement.addEventListener('wheel', this.wheelBound, { passive: false });
    this.hostElement.addEventListener('keydown', this.keyDownBound);
    this.resizeObserver = this.resizeObserverCreate();
    this.viewportHeightMeasureOnly();
  }

  /**
   * Returns the map of currently bound logical objects to pool rows.
   *
   * @returns Bound item map (off-screen objects are absent).
   */
  itemMapGet(): Map<THREE.Object3D, OutlinerItem> {
    return this.itemMap;
  }

  /**
   * Returns the ordered logical objects currently shown by the outliner.
   *
   * @returns Logical object list.
   */
  logicalObjectsGet(): readonly THREE.Object3D[] {
    return this.logicalObjects;
  }

  /**
   * Returns the current virtual scroll offset in CSS pixels.
   *
   * @returns Scroll offset.
   */
  scrollOffsetPxGet(): number {
    return this.scrollState.scrollOffsetPxGet();
  }

  /**
   * Returns the content strip element that holds recycled rows.
   *
   * @returns Content element.
   */
  contentElementGet(): HTMLElement {
    return this.contentElement;
  }

  /**
   * Replaces the logical list and rebinds the visible pool window.
   *
   * @param logicalObjects Ordered objects for expanded/filtered hierarchy.
   */
  logicalObjectsSet(logicalObjects: readonly THREE.Object3D[]): void {
    if (this.isDisposed) {
      return;
    }
    this.logicalObjects = logicalObjects;
    this.scrollState.rowCountSet(logicalObjects.length);
    this.poolSizeEnsure();
    this.windowRebind();
  }

  /** Rebinds chrome for every currently visible pool slot. */
  visibleChromeRefresh(): void {
    if (this.isDisposed) {
      return;
    }
    this.itemMap.forEach((item, object) => {
      this.chromeApply(item, object);
    });
  }

  /**
   * Scrolls by a pixel delta and rebinds when the window moves.
   *
   * @param deltaPx Delta in CSS pixels (positive scrolls down).
   * @returns True when the scroll offset changed.
   */
  scrollByDeltaPx(deltaPx: number): boolean {
    if (this.isDisposed) {
      return false;
    }
    const changed = this.scrollState.scrollByDeltaPx(deltaPx);
    if (!changed) {
      return false;
    }
    this.windowRebind();
    return true;
  }

  /**
   * Sets the scroll offset in CSS pixels and rebinds the window.
   *
   * @param scrollOffsetPx Requested offset.
   * @returns True when the offset changed.
   */
  scrollOffsetPxSet(scrollOffsetPx: number): boolean {
    if (this.isDisposed) {
      return false;
    }
    const changed = this.scrollState.scrollOffsetPxSet(scrollOffsetPx);
    if (!changed) {
      return false;
    }
    this.windowRebind();
    return true;
  }

  /**
   * Scrolls so a logical object row is visible when present.
   *
   * @param object Hierarchy object to reveal.
   * @returns True when the scroll offset changed.
   */
  scrollToObject(object: THREE.Object3D): boolean {
    if (this.isDisposed) {
      return false;
    }
    const rowIndex = this.logicalObjects.indexOf(object);
    if (rowIndex < 0) {
      return false;
    }
    const changed = this.scrollState.scrollToRowIndex(rowIndex, OUTLINER_REVEAL_MARGIN_PX);
    if (!changed) {
      this.windowRebind();
      return false;
    }
    this.windowRebind();
    return true;
  }

  /**
   * Returns the logical row count (not the DOM pool size).
   *
   * @returns Logical row count.
   */
  logicalRowCountGet(): number {
    return this.logicalObjects.length;
  }

  /**
   * Returns the number of DOM row elements currently in the pool.
   *
   * @returns Pool size for tests.
   */
  poolSizeGetForTests(): number {
    return this.pool.length;
  }

  /** Disposes the pool, scrollbar, and observers. */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;
    this.hostElement.removeEventListener('wheel', this.wheelBound);
    this.hostElement.removeEventListener('keydown', this.keyDownBound);
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    this.scrollbar.dispose();
    for (const item of this.pool) {
      item.dispose();
    }
    this.pool.length = 0;
    this.itemMap.clear();
    this.logicalObjects = [];
    if (this.contentElement.parentNode) {
      this.contentElement.parentNode.removeChild(this.contentElement);
    }
  }

  /** Styles the content strip that receives the pool rows. */
  private contentStylesApply(): void {
    this.contentElement.style.position = 'relative';
    this.contentElement.style.willChange = 'transform';
    this.contentElement.style.width = '100%';
    this.contentElement.style.minWidth = '0';
    this.contentElement.style.maxWidth = '100%';
    this.contentElement.style.overflow = 'hidden';
    this.contentElement.style.boxSizing = 'border-box';
    this.contentElement.style.paddingTop = '0';
    this.contentElement.style.paddingBottom = '0';
    this.contentElement.style.paddingLeft = `${OUTLINER_TREE_PADDING_PX}px`;
    this.contentElement.style.paddingRight = `${OUTLINER_TREE_PADDING_PX + 10}px`;
  }

  /**
   * Creates a resize observer when the environment supports it.
   *
   * @returns Observer, or null when unavailable.
   */
  private resizeObserverCreate(): ResizeObserver | null {
    if (typeof ResizeObserver === 'undefined') {
      return null;
    }
    const observer = new ResizeObserver(() => {
      this.viewportHeightMeasureAndSync();
    });
    observer.observe(this.hostElement);
    return observer;
  }

  /** Measures host height into scroll state without allocating pool slots. */
  private viewportHeightMeasureOnly(): void {
    if (this.isDisposed) {
      return;
    }
    const measured = this.hostElement.clientHeight;
    const height = measured > 0 ? measured : OUTLINER_VIRTUAL_VIEWPORT_FALLBACK_PX;
    this.scrollState.viewportHeightPxSet(height);
  }

  /** Measures host height, grows the pool, and rebinds the window. */
  private viewportHeightMeasureAndSync(): void {
    if (this.isDisposed) {
      return;
    }
    this.viewportHeightMeasureOnly();
    if (this.logicalObjects.length === 0 && this.pool.length === 0) {
      return;
    }
    this.poolSizeEnsure();
    this.windowRebind();
  }

  /** Grows the pool when the viewport requires more slots. */
  private poolSizeEnsure(): void {
    const needed = this.scrollState.poolSizeGet();
    while (this.pool.length < needed) {
      const item = this.slotFactory();
      this.pool.push(item);
      this.contentElement.appendChild(item.getElement());
    }
  }

  /** Rebinds pool slots to the current scroll window and syncs the scrollbar. */
  private windowRebind(): void {
    const firstIndex = this.scrollState.firstIndexGet();
    const endIndex = this.scrollState.windowEndIndexGet();
    const translateY = this.scrollState.contentTranslateYGet();
    this.contentElement.style.transform = `translateY(${translateY}px)`;
    this.itemMap.clear();
    for (let slotIndex = 0; slotIndex < this.pool.length; slotIndex += 1) {
      this.poolSlotBind(slotIndex, firstIndex + slotIndex, endIndex);
    }
    this.scrollbar.metricsSync(
      this.scrollState.viewportHeightPxGet(),
      this.scrollState.contentHeightPxGet(),
      this.scrollState.scrollPercentGet(),
      this.scrollState.overflowIs(),
    );
  }

  /**
   * Binds one pool slot to a logical index, or hides it when out of range.
   *
   * @param slotIndex Pool slot index.
   * @param logicalIndex Logical row index for this slot.
   * @param endIndex Exclusive end of the active window.
   */
  private poolSlotBind(slotIndex: number, logicalIndex: number, endIndex: number): void {
    const item = this.pool[slotIndex];
    if (!item) {
      return;
    }
    if (logicalIndex < 0 || logicalIndex >= endIndex || logicalIndex >= this.logicalObjects.length) {
      item.poolVisibilitySet(false);
      return;
    }
    const object = this.logicalObjects[logicalIndex];
    if (!object) {
      item.poolVisibilitySet(false);
      return;
    }
    item.poolVisibilitySet(true);
    this.chromeApply(item, object);
    this.itemMap.set(object, item);
  }

  /**
   * Applies scrollbar thumb position as a scroll percent.
   *
   * @param percent Normalized position in [0, 1].
   */
  private scrollPercentFromScrollbarApply(percent: number): void {
    if (!this.scrollState.scrollPercentSet(percent)) {
      return;
    }
    this.windowRebind();
  }

  /**
   * Handles wheel scrolling on the host.
   *
   * @param event Wheel event.
   */
  private wheelHandle(event: WheelEvent): void {
    if (this.isDisposed || !this.scrollState.overflowIs()) {
      return;
    }
    event.preventDefault();
    const delta = event.deltaY;
    if (!Number.isFinite(delta) || delta === 0) {
      return;
    }
    this.scrollByDeltaPx(delta);
  }

  /** Makes the host focusable so arrow keys can scroll the list. */
  private hostKeyboardFocusEnable(): void {
    if (!this.hostElement.hasAttribute('tabindex')) {
      this.hostElement.tabIndex = 0;
    }
    this.hostElement.style.outline = 'none';
    this.hostElement.addEventListener('pointerdown', () => {
      this.hostElement.focus({ preventScroll: true });
    });
  }

  /**
   * Scrolls with arrow keys when the tree host has keyboard focus.
   *
   * @param event Keyboard event.
   */
  private keyDownHandle(event: KeyboardEvent): void {
    if (this.isDisposed || !this.scrollState.overflowIs()) {
      return;
    }
    if (this.keyDownTargetIsEditableIs(event.target)) {
      return;
    }
    const deltaPx = this.keyDownScrollDeltaPxResolve(event.key);
    if (deltaPx === 0) {
      return;
    }
    event.preventDefault();
    this.scrollByDeltaPx(deltaPx);
  }

  /**
   * Returns whether the event target is an editable field that owns arrow keys.
   *
   * @param eventTarget Event target under focus.
   * @returns True when arrow keys should not scroll the list.
   */
  private keyDownTargetIsEditableIs(eventTarget: EventTarget | null): boolean {
    if (!(eventTarget instanceof HTMLElement)) {
      return false;
    }
    const tagName = eventTarget.tagName;
    if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
      return true;
    }
    return eventTarget.isContentEditable;
  }

  /**
   * Maps a key name to a signed scroll delta in CSS pixels.
   *
   * @param key KeyboardEvent.key value.
   * @returns Signed delta, or 0 when the key does not scroll.
   */
  private keyDownScrollDeltaPxResolve(key: string): number {
    if (key === 'ArrowUp') {
      return -OUTLINER_ROW_HEIGHT_PX;
    }
    if (key === 'ArrowDown') {
      return OUTLINER_ROW_HEIGHT_PX;
    }
    if (key === 'PageUp') {
      return -Math.max(OUTLINER_ROW_HEIGHT_PX, this.scrollState.viewportHeightPxGet() - OUTLINER_ROW_HEIGHT_PX);
    }
    if (key === 'PageDown') {
      return Math.max(OUTLINER_ROW_HEIGHT_PX, this.scrollState.viewportHeightPxGet() - OUTLINER_ROW_HEIGHT_PX);
    }
    if (key === 'Home') {
      this.scrollOffsetPxSet(0);
      return 0;
    }
    if (key === 'End') {
      this.scrollOffsetPxSet(this.scrollState.maxScrollOffsetPxGet());
      return 0;
    }
    return 0;
  }
}

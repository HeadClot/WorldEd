import * as THREE from 'three';
import { resolveOutlinerDropTarget, type OutlinerResolvedDrop } from './outliner_drop_placement.js';
import { OutlinerInsertIndicator } from './outliner_insert_indicator.js';
import type { OutlinerItem } from './outliner_item.js';
import type { TreeReparentCallback } from './outliner_tree_types.js';

/** Host surface the drag session needs from the outliner tree. */
export interface OutlinerTreeDragHost {
  /**
   * Returns the hierarchy root bound to the outliner.
   *
   * @returns Tree root object.
   */
  getRoot(): THREE.Object3D;

  /**
   * Returns the scrollable tree host element.
   *
   * @returns Tree DOM element.
   */
  getTreeElement(): HTMLElement;

  /**
   * Returns the current object-to-row map.
   *
   * @returns Visible item map.
   */
  getItemMap(): Map<THREE.Object3D, OutlinerItem>;

  /**
   * Returns whether a node uuid is expanded.
   *
   * @param uuid Object uuid.
   * @returns True when expanded.
   */
  isExpanded(uuid: string): boolean;

  /**
   * Returns content children of a hierarchy node.
   *
   * @param parent Parent object.
   * @returns Content children only.
   */
  getContentChildren(parent: THREE.Object3D): THREE.Object3D[];

  /**
   * Returns the reparent drop callback, if registered.
   *
   * @returns Callback or null.
   */
  getOnReparent(): TreeReparentCallback | null;
}

/** Owns outliner row drag-and-drop session state and insert feedback. */
export class OutlinerTreeDragSession {
  private readonly host: OutlinerTreeDragHost;
  private readonly insertIndicator: OutlinerInsertIndicator;
  private readonly onDocumentDragOver: (event: DragEvent) => void;
  private dragSource: THREE.Object3D | null;
  private lastResolvedDrop: OutlinerResolvedDrop<THREE.Object3D> | null;

  /**
   * Creates a drag session bound to an outliner host.
   *
   * @param host Tree host providing DOM and hierarchy accessors.
   */
  constructor(host: OutlinerTreeDragHost) {
    this.host = host;
    this.insertIndicator = new OutlinerInsertIndicator();
    this.dragSource = null;
    this.lastResolvedDrop = null;
    this.onDocumentDragOver = (event) => this.handleDocumentDragOver(event);
  }

  /**
   * Returns the insert indicator element for tests.
   *
   * @returns Indicator element.
   */
  getInsertIndicatorElement(): HTMLElement {
    return this.insertIndicator.getElement();
  }

  /**
   * Attaches the insert indicator to the tree host.
   *
   * @param treeElement Tree host element.
   */
  attachIndicator(treeElement: HTMLElement): void {
    this.insertIndicator.attachTo(treeElement);
  }

  /**
   * Binds drag-start, hover, drop, and drag-end callbacks for one row.
   *
   * @param item Outliner item.
   */
  bindItemDragDropCallbacks(item: OutlinerItem): void {
    item.onDragStartRequest((obj) => {
      this.beginRowDragSession(obj);
    });
    item.onDragHoverRequest((target, event) => {
      this.handleItemDragHover(target, event);
    });
    item.onDropRequest((target, event) => {
      this.handleItemDrop(target, event);
    });
    item.onDragEndRequest(() => {
      this.endRowDragSession();
    });
  }

  /**
   * Accepts drag-over across the tree host so gaps never show the forbidden
   * cursor.
   *
   * @param treeElement Tree host element.
   */
  bindTreeHostDropTarget(treeElement: HTMLElement): void {
    treeElement.addEventListener('dragover', (event) => this.handleTreeHostDragOver(event));
    treeElement.addEventListener('dragleave', (event) => this.handleTreeHostDragLeave(event));
    treeElement.addEventListener('drop', (event) => this.handleTreeHostDrop(event));
  }

  /**
   * Starts a row drag session and accepts document-level dragover.
   *
   * @param source Object being dragged.
   */
  beginRowDragSession(source: THREE.Object3D): void {
    this.dragSource = source;
    this.lastResolvedDrop = null;
    document.addEventListener('dragover', this.onDocumentDragOver, true);
    document.addEventListener('dragenter', this.onDocumentDragOver, true);
  }

  /** Ends a row drag session and hides the insert marker. */
  endRowDragSession(): void {
    this.dragSource = null;
    this.lastResolvedDrop = null;
    this.clearAllIntoHighlights();
    this.insertIndicator.hide();
    document.removeEventListener('dragover', this.onDocumentDragOver, true);
    document.removeEventListener('dragenter', this.onDocumentDragOver, true);
    this.host.getItemMap().forEach((item) => {
      item.setDragSourceVisual(false);
    });
  }

  /**
   * While a row is dragged, accept drop so the cursor never flickers forbidden.
   *
   * @param event Document dragover / dragenter event.
   */
  private handleDocumentDragOver(event: DragEvent): void {
    if (!this.dragSource) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  /**
   * Updates the insert line while dragging over a row.
   *
   * @param target Row object under the pointer.
   * @param event Native drag event with client coordinates.
   */
  handleItemDragHover(target: THREE.Object3D, event: DragEvent): void {
    if (!this.dragSource) {
      return;
    }
    const resolved = this.resolveDropFromPointer(target, event.clientX, event.clientY);
    if (!resolved || this.dragSource === resolved.target) {
      this.clearDropFeedback();
      return;
    }
    this.applyDropFeedback(resolved);
  }

  /**
   * Completes a drag-and-drop reparent when a valid drop target is hit.
   *
   * @param target The object that received the drop.
   * @param event Native drop event.
   */
  handleItemDrop(target: THREE.Object3D, event: DragEvent): void {
    const source = this.dragSource;
    const resolved = this.resolveDropFromPointer(target, event.clientX, event.clientY) ?? this.lastResolvedDrop;
    this.endRowDragSession();
    const onReparent = this.host.getOnReparent();
    if (!source || !onReparent || !resolved) {
      return;
    }
    if (source === resolved.target) {
      return;
    }
    onReparent(source, resolved.target, resolved.placement);
  }

  /**
   * Resolves elevated drop target from pointer position.
   *
   * @param hovered Row object under the pointer.
   * @param clientX Pointer X in viewport coordinates.
   * @param clientY Pointer Y in viewport coordinates.
   * @returns Resolved drop, or null when the row is unknown.
   */
  private resolveDropFromPointer(
    hovered: THREE.Object3D,
    clientX: number,
    clientY: number,
  ): OutlinerResolvedDrop<THREE.Object3D> | null {
    const item = this.host.getItemMap().get(hovered);
    if (!item) {
      return null;
    }
    const rect = item.getElement().getBoundingClientRect();
    const treeLeft = this.host.getTreeElement().getBoundingClientRect().left;
    return resolveOutlinerDropTarget(
      hovered,
      item.getDepth(),
      clientX,
      clientY,
      rect.top,
      rect.height,
      treeLeft,
      hovered instanceof THREE.Group,
      (node) => this.getDropElevationParent(node),
      (node) => this.isLastContentChildOfParent(node),
      (node) => this.isExpandedDropContainer(node),
      (node) => this.getFirstContentChild(node),
    );
  }

  /**
   * Returns whether a row is an expanded container with content children.
   *
   * @param node Hierarchy node.
   * @returns True when after-on-this-row should insert as first child instead.
   */
  private isExpandedDropContainer(node: THREE.Object3D): boolean {
    if (!(node instanceof THREE.Group)) {
      return false;
    }
    if (!this.host.isExpanded(node.uuid)) {
      return false;
    }
    return this.host.getContentChildren(node).length > 0;
  }

  /**
   * Returns the first content child of a node for expanded-parent after remap.
   *
   * @param node Hierarchy node.
   * @returns First content child, or null when none.
   */
  private getFirstContentChild(node: THREE.Object3D): THREE.Object3D | null {
    const children = this.host.getContentChildren(node);
    return children[0] ?? null;
  }

  /**
   * Returns the parent used for indent elevation (stops at the tree root).
   *
   * @param node Hierarchy node.
   * @returns Parent object, or null at the outliner root.
   */
  private getDropElevationParent(node: THREE.Object3D): THREE.Object3D | null {
    const parent = node.parent;
    if (!parent || parent === this.host.getRoot()) {
      return null;
    }
    return parent;
  }

  /**
   * Returns whether a node is the last non-helper child of its parent.
   *
   * @param node Hierarchy node.
   * @returns True when no later content sibling exists.
   */
  private isLastContentChildOfParent(node: THREE.Object3D): boolean {
    const parent = node.parent;
    if (!parent) {
      return true;
    }
    const contentChildren = this.host.getContentChildren(parent);
    return contentChildren[contentChildren.length - 1] === node;
  }

  /**
   * Applies insert-line or into-highlight feedback for the resolved drop.
   *
   * @param resolved Elevated drop target and placement.
   */
  private applyDropFeedback(resolved: OutlinerResolvedDrop<THREE.Object3D>): void {
    this.lastResolvedDrop = resolved;
    this.clearAllIntoHighlights();
    const itemMap = this.host.getItemMap();
    const visualItem = itemMap.get(resolved.visualTarget);
    if (!visualItem) {
      this.insertIndicator.hide();
      return;
    }
    if (resolved.placement === 'into') {
      this.insertIndicator.hide();
      const targetItem = itemMap.get(resolved.target) ?? visualItem;
      targetItem.setIntoDropHighlight(true);
      return;
    }
    const nameColumnLeftPx = this.measureInsertNameColumnLeft(resolved);
    this.insertIndicator.showForRow(
      this.host.getTreeElement(),
      visualItem.getElement().getBoundingClientRect(),
      resolved.placement,
      resolved.insertDepth,
      nameColumnLeftPx,
    );
  }

  /**
   * Measures the name-column left edge for the insert line.
   *
   * @param resolved Elevated drop target and placement.
   * @returns Host-local name left in CSS pixels, or null when unmeasurable.
   */
  private measureInsertNameColumnLeft(resolved: OutlinerResolvedDrop<THREE.Object3D>): number | null {
    if (resolved.insertDepth <= 0) {
      return null;
    }
    const itemMap = this.host.getItemMap();
    const nameItem = itemMap.get(resolved.target) ?? itemMap.get(resolved.visualTarget);
    if (!nameItem) {
      return null;
    }
    const hostRect = this.host.getTreeElement().getBoundingClientRect();
    const nameRect = nameItem.getNameElement().getBoundingClientRect();
    if (nameRect.width <= 0 && nameRect.height <= 0) {
      return null;
    }
    return nameRect.left - hostRect.left;
  }

  /** Clears insert line and into-highlight state. */
  private clearDropFeedback(): void {
    this.lastResolvedDrop = null;
    this.clearAllIntoHighlights();
    this.insertIndicator.hide();
  }

  /** Removes into-outline from every visible row. */
  private clearAllIntoHighlights(): void {
    this.host.getItemMap().forEach((item) => {
      item.setIntoDropHighlight(false);
    });
  }

  /**
   * Updates the insert indicator while dragging over empty tree chrome.
   *
   * @param event Drag-over event on the tree host.
   */
  private handleTreeHostDragOver(event: DragEvent): void {
    if (!this.dragSource) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    const hit = this.resolveRowDropTargetAtClientY(event.clientY);
    if (!hit) {
      this.clearDropFeedback();
      return;
    }
    if (hit.object === this.dragSource) {
      this.clearDropFeedback();
      return;
    }
    this.handleItemDragHover(hit.object, event);
  }

  /**
   * Hides feedback when the pointer leaves the tree host entirely.
   *
   * @param event Drag-leave event on the tree host.
   */
  private handleTreeHostDragLeave(event: DragEvent): void {
    const related = event.relatedTarget;
    if (related instanceof Node && this.host.getTreeElement().contains(related)) {
      return;
    }
    this.clearDropFeedback();
  }

  /**
   * Completes a drop on the tree host (including inter-row gaps).
   *
   * @param event Drop event on the tree host.
   */
  private handleTreeHostDrop(event: DragEvent): void {
    if (!this.dragSource) {
      return;
    }
    event.preventDefault();
    const hit = this.resolveRowDropTargetAtClientY(event.clientY);
    if (!hit) {
      this.endRowDragSession();
      return;
    }
    this.handleItemDrop(hit.object, event);
  }

  /**
   * Finds the row under or nearest to a client Y.
   *
   * @param clientY Pointer Y in viewport coordinates.
   * @returns Hit object and item, or null when the tree is empty.
   */
  private resolveRowDropTargetAtClientY(clientY: number): { object: THREE.Object3D; item: OutlinerItem } | null {
    const entries = this.listVisibleRowEntries();
    if (entries.length === 0) {
      return null;
    }
    const direct = this.findRowContainingClientY(entries, clientY);
    if (direct) {
      return direct;
    }
    return this.findNearestRowByClientY(entries, clientY);
  }

  /**
   * Lists visible outliner rows with their objects.
   *
   * @returns Visible object/item pairs in display order.
   */
  private listVisibleRowEntries(): { object: THREE.Object3D; item: OutlinerItem }[] {
    const entries: { object: THREE.Object3D; item: OutlinerItem }[] = [];
    this.host.getItemMap().forEach((item, object) => {
      entries.push({ object, item });
    });
    return entries;
  }

  /**
   * Returns the row whose bounds contain the client Y, if any.
   *
   * @param entries Visible rows.
   * @param clientY Pointer Y in viewport coordinates.
   * @returns Hit entry or null.
   */
  private findRowContainingClientY(
    entries: readonly { object: THREE.Object3D; item: OutlinerItem }[],
    clientY: number,
  ): { object: THREE.Object3D; item: OutlinerItem } | null {
    if (!Number.isFinite(clientY)) {
      return null;
    }
    for (const entry of entries) {
      const rect = entry.item.getElement().getBoundingClientRect();
      if (clientY >= rect.top && clientY <= rect.bottom) {
        return entry;
      }
    }
    return null;
  }

  /**
   * Returns the row whose vertical center is nearest to the client Y.
   *
   * @param entries Visible rows.
   * @param clientY Pointer Y in viewport coordinates.
   * @returns Nearest entry or null.
   */
  private findNearestRowByClientY(
    entries: readonly { object: THREE.Object3D; item: OutlinerItem }[],
    clientY: number,
  ): { object: THREE.Object3D; item: OutlinerItem } | null {
    if (!Number.isFinite(clientY)) {
      return null;
    }
    let best: { object: THREE.Object3D; item: OutlinerItem } | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const entry of entries) {
      const rect = entry.item.getElement().getBoundingClientRect();
      const mid = (rect.top + rect.bottom) / 2;
      const distance = Math.abs(clientY - mid);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = entry;
      }
    }
    return best;
  }
}

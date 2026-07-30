import * as THREE from 'three';
import { OutlinerItem } from './outliner_item.js';
import { isObjectLocked } from '@/utils/object_lock.js';
import { Theme } from '@/theme.js';
import { hexToRgb } from '@/utils/utils_color.js';
import { OUTLINER_TREE_PADDING_PX } from './outliner_drop_placement.js';
import { OutlinerTreeDragSession } from './session_outliner_tree_drag.js';
import {
  computeOutlinerDepth,
  getOutlinerContentChildren,
  outlinerPassesSearchFilter,
} from './outliner_tree_hierarchy.js';
import {
  areOutlinerObjectListsEqual,
  findOutlinerSingleInsertionIndex,
  findOutlinerSingleRemovalIndex,
} from './outliner_tree_list_diff.js';
import { computeOutlinerRowSelected } from './outliner_tree_selection.js';
import type {
  TreeContextMenuCallback,
  TreeLockCallback,
  TreeRenameCallback,
  TreeReparentCallback,
  TreeSelectCallback,
  TreeVisibilityCallback,
} from './outliner_tree_types.js';

export type {
  TreeContextMenuCallback,
  TreeLockCallback,
  TreeRenameCallback,
  TreeReparentCallback,
  TreeSelectCallback,
  TreeVisibilityCallback,
} from './outliner_tree_types.js';

/**
 * Tree view component that renders a hierarchical outliner. Manages
 * expand/collapse state, search filtering, and item synchronization.
 */
export class OutlinerTree {
  private container: HTMLElement;
  private treeElement: HTMLElement;
  private searchElement: HTMLInputElement;
  private root: THREE.Object3D;
  private itemMap: Map<THREE.Object3D, OutlinerItem>;
  private expandedSet: Set<string>;
  /**
   * UUIDs that already received a default expand/collapse policy (user choice
   * sticks).
   */
  private expandPolicyInitialized: Set<string>;
  private isDisposed: boolean;
  private searchQuery: string;
  private onSelect: TreeSelectCallback | null;
  private onVisibility: TreeVisibilityCallback | null;
  private onLock: TreeLockCallback | null;
  private onRename: TreeRenameCallback | null;
  private contextMenuCallback: TreeContextMenuCallback | null;
  private onReparent: TreeReparentCallback | null;
  private readonly dragSession: OutlinerTreeDragSession;
  private lastSelectedObjects: Set<THREE.Mesh>;
  private lastHierarchySelection: Set<THREE.Object3D>;

  /**
   * Creates a new outliner tree bound to a root Three.js object.
   *
   * @param container The parent DOM element to append the tree into.
   * @param root The root Three.js object representing the scene hierarchy.
   */
  constructor(container: HTMLElement, root: THREE.Object3D) {
    this.container = container;
    this.root = root;
    this.itemMap = new Map();
    this.expandedSet = new Set();
    this.expandedSet.add(this.root.uuid);
    this.expandPolicyInitialized = new Set();
    this.expandPolicyInitialized.add(this.root.uuid);
    this.isDisposed = false;
    this.searchQuery = '';
    this.onSelect = null;
    this.onVisibility = null;
    this.onLock = null;
    this.onRename = null;
    this.contextMenuCallback = null;
    this.onReparent = null;
    this.lastSelectedObjects = new Set();
    this.lastHierarchySelection = new Set();
    this.treeElement = document.createElement('div');
    this.searchElement = document.createElement('input');
    this.dragSession = new OutlinerTreeDragSession({
      getRoot: () => this.root,
      getTreeElement: () => this.treeElement,
      getItemMap: () => this.itemMap,
      isExpanded: (uuid) => this.expandedSet.has(uuid),
      getContentChildren: (parent) => getOutlinerContentChildren(parent),
      getOnReparent: () => this.onReparent,
    });
    this.buildSearchBar();
    this.buildTreeContainer();
    this.dragSession.bindTreeHostDropTarget(this.treeElement);
    this.container.appendChild(this.searchElement);
    this.container.appendChild(this.treeElement);
  }

  /**
   * Returns the root Three.js object this tree is bound to.
   *
   * @returns The root object.
   */
  getRoot(): THREE.Object3D {
    return this.root;
  }

  /**
   * Registers the callback for selection events.
   *
   * @param callback The function to call on item selection.
   */
  onSelectObject(callback: TreeSelectCallback): void {
    this.onSelect = callback;
  }

  /**
   * Registers the callback for visibility toggle events.
   *
   * @param callback The function to call on visibility toggle.
   */
  onToggleVisibility(callback: TreeVisibilityCallback): void {
    this.onVisibility = callback;
  }

  /**
   * Registers the callback for lock toggle events.
   *
   * @param callback The function to call on lock toggle.
   */
  onToggleLock(callback: TreeLockCallback): void {
    this.onLock = callback;
  }

  /**
   * Registers the callback for rename events.
   *
   * @param callback The function to call on rename completion.
   */
  onRenameObject(callback: TreeRenameCallback): void {
    this.onRename = callback;
  }

  /**
   * Registers the callback for context menu events.
   *
   * @param callback The function to call on context menu trigger.
   */
  onContextMenu(callback: TreeContextMenuCallback): void {
    this.contextMenuCallback = callback;
  }

  /**
   * Registers the callback for hierarchy reparent drop events.
   *
   * @param callback The function to call when an item is dropped onto another.
   */
  onReparentObject(callback: TreeReparentCallback): void {
    this.onReparent = callback;
  }

  /**
   * Returns the insert indicator element for tests.
   *
   * @returns Indicator element.
   */
  getInsertIndicatorForTests(): HTMLElement {
    return this.dragSession.getInsertIndicatorElement();
  }

  /**
   * Refreshes the tree to match the current scene hierarchy.
   *
   * @param selectedObjects The set of currently selected meshes.
   * @param hierarchySelection Optional hierarchy nodes selected in the
   *   outliner.
   */
  refresh(selectedObjects: Set<THREE.Mesh>, hierarchySelection: Set<THREE.Object3D> = new Set()): void {
    if (this.isDisposed) {
      return;
    }
    this.lastSelectedObjects = selectedObjects;
    this.lastHierarchySelection = hierarchySelection;
    if (this.tryIncrementalStructureRefresh(selectedObjects, hierarchySelection)) {
      return;
    }
    this.reconcileVisibleTree(selectedObjects, hierarchySelection);
  }

  /**
   * Reconciles visible rows with the desired hierarchy (and search filter).
   *
   * @param selectedObjects Currently selected meshes.
   * @param hierarchySelection Hierarchy nodes selected in the outliner.
   */
  private reconcileVisibleTree(selectedObjects: Set<THREE.Mesh>, hierarchySelection: Set<THREE.Object3D>): void {
    const desired = this.collectVisibleContentObjects();
    this.disposeItemsNotInDesiredSet(new Set(desired));
    const nextMap = this.buildReconciledItemMap(desired, selectedObjects, hierarchySelection);
    this.replaceTreeDomFromItemMap(nextMap);
  }

  /**
   * Disposes outliner rows whose objects are no longer in the visible list.
   *
   * @param desiredSet Objects that should remain listed.
   */
  private disposeItemsNotInDesiredSet(desiredSet: Set<THREE.Object3D>): void {
    this.itemMap.forEach((item, object) => {
      if (desiredSet.has(object)) {
        return;
      }
      item.dispose();
      this.itemMap.delete(object);
    });
  }

  /**
   * Builds an ordered item map for the desired visible objects, reusing rows.
   *
   * @param desired Ordered visible hierarchy objects.
   * @param selectedObjects Currently selected meshes.
   * @param hierarchySelection Hierarchy nodes selected in the outliner.
   * @returns Map from object to outliner item in display order.
   */
  private buildReconciledItemMap(
    desired: readonly THREE.Object3D[],
    selectedObjects: Set<THREE.Mesh>,
    hierarchySelection: Set<THREE.Object3D>,
  ): Map<THREE.Object3D, OutlinerItem> {
    const nextMap = new Map<THREE.Object3D, OutlinerItem>();
    for (const object of desired) {
      const item = this.reuseOrCreateVisibleItem(object, selectedObjects, hierarchySelection);
      if (item) {
        nextMap.set(object, item);
      }
    }
    return nextMap;
  }

  /**
   * Reuses an existing row or creates a configured item for a visible object.
   *
   * @param object Hierarchy object for the row.
   * @param selectedObjects Currently selected meshes.
   * @param hierarchySelection Hierarchy nodes selected in the outliner.
   * @returns Configured item, or null when the object is not under the root.
   */
  private reuseOrCreateVisibleItem(
    object: THREE.Object3D,
    selectedObjects: Set<THREE.Mesh>,
    hierarchySelection: Set<THREE.Object3D>,
  ): OutlinerItem | null {
    const depth = computeOutlinerDepth(object, this.root);
    if (depth < 0) {
      return null;
    }
    const hasChildren = getOutlinerContentChildren(object).length > 0;
    const existing = this.itemMap.get(object);
    if (!existing) {
      return this.createConfiguredItem(object, depth, hasChildren, selectedObjects, hierarchySelection);
    }
    this.refreshExistingItemChrome(existing, object, depth, hasChildren, selectedObjects, hierarchySelection);
    return existing;
  }

  /**
   * Updates depth, expand, visibility, lock, and selection on a reused row.
   *
   * @param item Existing outliner item.
   * @param object Hierarchy object for the row.
   * @param depth Indentation depth.
   * @param hasChildren Whether the object has content children.
   * @param selectedObjects Currently selected meshes.
   * @param hierarchySelection Hierarchy nodes selected in the outliner.
   */
  private refreshExistingItemChrome(
    item: OutlinerItem,
    object: THREE.Object3D,
    depth: number,
    hasChildren: boolean,
    selectedObjects: Set<THREE.Mesh>,
    hierarchySelection: Set<THREE.Object3D>,
  ): void {
    item.setDepth(depth);
    item.setHasChildren(hasChildren);
    item.refreshIcon();
    this.applySelectionState(item, object, selectedObjects, hierarchySelection);
    this.applyExpandedState(item, object);
    this.applyVisibilityState(item, object);
    this.applyLockState(item, object);
  }

  /**
   * Replaces tree DOM children from an ordered item map.
   *
   * @param nextMap Ordered map of visible items.
   */
  private replaceTreeDomFromItemMap(nextMap: Map<THREE.Object3D, OutlinerItem>): void {
    const fragment = document.createDocumentFragment();
    nextMap.forEach((item) => {
      fragment.appendChild(item.getElement());
    });
    this.itemMap = nextMap;
    this.treeElement.replaceChildren(fragment);
    this.dragSession.attachIndicator(this.treeElement);
  }

  /**
   * Attempts a single-row add/remove or selection-only update when the visible
   * hierarchy barely changed.
   *
   * @param selectedObjects Currently selected meshes.
   * @param hierarchySelection Hierarchy nodes selected in the outliner.
   * @returns True when the tree was updated without a full rebuild.
   */
  private tryIncrementalStructureRefresh(
    selectedObjects: Set<THREE.Mesh>,
    hierarchySelection: Set<THREE.Object3D>,
  ): boolean {
    const desired = this.collectVisibleContentObjects();
    const current = Array.from(this.itemMap.keys());
    if (desired.length === current.length && areOutlinerObjectListsEqual(desired, current)) {
      this.updateSelectionStates(selectedObjects, hierarchySelection);
      this.syncVisibleItemChrome(desired);
      return true;
    }
    if (desired.length === current.length + 1) {
      return this.tryInsertSingleVisibleObject(desired, current, selectedObjects, hierarchySelection);
    }
    if (desired.length === current.length - 1) {
      return this.tryRemoveSingleVisibleObject(desired, current, selectedObjects, hierarchySelection);
    }
    return false;
  }

  /**
   * Collects content objects currently visible in the outliner.
   *
   * @returns Ordered list of visible hierarchy objects.
   */
  private collectVisibleContentObjects(): THREE.Object3D[] {
    const result: THREE.Object3D[] = [];
    const query = this.searchQuery.toLowerCase();
    this.collectVisibleContentObjectsUnder(this.root, result, query);
    return result;
  }

  /**
   * Appends visible content descendants of a parent into the accumulator.
   *
   * @param parent Parent object in the hierarchy.
   * @param result Accumulator for visible objects.
   * @param query Lowercase search query (empty shows all).
   */
  private collectVisibleContentObjectsUnder(parent: THREE.Object3D, result: THREE.Object3D[], query: string): void {
    for (const child of getOutlinerContentChildren(parent)) {
      if (!outlinerPassesSearchFilter(child, query)) {
        continue;
      }
      result.push(child);
      if (getOutlinerContentChildren(child).length === 0) {
        continue;
      }
      this.applyDefaultExpandPolicy(child);
      if (this.expandedSet.has(child.uuid)) {
        this.collectVisibleContentObjectsUnder(child, result, query);
      }
    }
  }

  /**
   * Expands groups the first time they appear with children.
   *
   * @param object Hierarchy node that has content children.
   */
  private applyDefaultExpandPolicy(object: THREE.Object3D): void {
    if (this.expandPolicyInitialized.has(object.uuid)) {
      return;
    }
    this.expandPolicyInitialized.add(object.uuid);
    if (object instanceof THREE.Group) {
      this.expandedSet.add(object.uuid);
    }
  }

  /**
   * Inserts one newly visible object when the rest of the list is unchanged.
   *
   * @param desired Desired visible object list.
   * @param current Current itemMap key order.
   * @param selectedObjects Currently selected meshes.
   * @param hierarchySelection Hierarchy nodes selected in the outliner.
   * @returns True when the insert succeeded.
   */
  private tryInsertSingleVisibleObject(
    desired: readonly THREE.Object3D[],
    current: readonly THREE.Object3D[],
    selectedObjects: Set<THREE.Mesh>,
    hierarchySelection: Set<THREE.Object3D>,
  ): boolean {
    const insertIndex = findOutlinerSingleInsertionIndex(desired, current);
    if (insertIndex < 0) {
      return false;
    }
    const objectToInsert = desired[insertIndex];
    if (!objectToInsert) {
      return false;
    }
    const depth = computeOutlinerDepth(objectToInsert, this.root);
    if (depth < 0) {
      return false;
    }
    const hasChildren = getOutlinerContentChildren(objectToInsert).length > 0;
    const item = this.createConfiguredItem(objectToInsert, depth, hasChildren, selectedObjects, hierarchySelection);
    const beforeElement = this.treeElement.children[insertIndex] ?? null;
    this.treeElement.insertBefore(item.getElement(), beforeElement);
    this.rebuildItemMapOrder(desired, item, objectToInsert);
    this.syncChromeAfterSingleInsert(objectToInsert);
    this.updateSelectionStates(selectedObjects, hierarchySelection);
    return true;
  }

  /**
   * Updates only the inserted row and its parent after a single-row insert.
   *
   * @param insertedObject Newly visible hierarchy object.
   */
  private syncChromeAfterSingleInsert(insertedObject: THREE.Object3D): void {
    this.syncVisibleItemChrome([insertedObject]);
    const parent = insertedObject.parent;
    if (!parent || parent === this.root) {
      return;
    }
    if (!this.itemMap.has(parent)) {
      return;
    }
    this.syncVisibleItemChrome([parent]);
  }

  /**
   * Removes one object that left the visible list when the rest is unchanged.
   *
   * @param desired Desired visible object list.
   * @param current Current itemMap key order.
   * @param selectedObjects Currently selected meshes.
   * @param hierarchySelection Hierarchy nodes selected in the outliner.
   * @returns True when the remove succeeded.
   */
  private tryRemoveSingleVisibleObject(
    desired: readonly THREE.Object3D[],
    current: readonly THREE.Object3D[],
    selectedObjects: Set<THREE.Mesh>,
    hierarchySelection: Set<THREE.Object3D>,
  ): boolean {
    const removeIndex = findOutlinerSingleRemovalIndex(desired, current);
    if (removeIndex < 0) {
      return false;
    }
    const objectToRemove = current[removeIndex];
    if (!objectToRemove) {
      return false;
    }
    const item = this.itemMap.get(objectToRemove);
    if (!item) {
      return false;
    }
    item.dispose();
    this.itemMap.delete(objectToRemove);
    this.rebuildItemMapOrder(desired, null, null);
    this.updateSelectionStates(selectedObjects, hierarchySelection);
    this.syncVisibleItemChrome(desired);
    return true;
  }

  /**
   * Creates an outliner row with selection, expand, visibility, and lock state.
   *
   * @param object Hierarchy object for the row.
   * @param depth Indentation depth.
   * @param hasChildren Whether the object has content children.
   * @param selectedObjects Currently selected meshes.
   * @param hierarchySelection Hierarchy nodes selected in the outliner.
   * @returns Configured outliner item.
   */
  private createConfiguredItem(
    object: THREE.Object3D,
    depth: number,
    hasChildren: boolean,
    selectedObjects: Set<THREE.Mesh>,
    hierarchySelection: Set<THREE.Object3D>,
  ): OutlinerItem {
    const item = new OutlinerItem(object, depth, hasChildren);
    this.applySelectionState(item, object, selectedObjects, hierarchySelection);
    this.applyExpandedState(item, object);
    this.applyVisibilityState(item, object);
    this.applyLockState(item, object);
    this.bindItemCallbacks(item);
    return item;
  }

  /**
   * Rebuilds itemMap insertion order to match the desired visible list.
   *
   * @param desired Desired visible objects.
   * @param insertedItem Optional newly created item.
   * @param insertedObject Optional object for the inserted item.
   */
  private rebuildItemMapOrder(
    desired: readonly THREE.Object3D[],
    insertedItem: OutlinerItem | null,
    insertedObject: THREE.Object3D | null,
  ): void {
    const nextMap = new Map<THREE.Object3D, OutlinerItem>();
    for (const object of desired) {
      if (insertedObject && object === insertedObject && insertedItem) {
        nextMap.set(object, insertedItem);
        continue;
      }
      const existing = this.itemMap.get(object);
      if (existing) {
        nextMap.set(object, existing);
      }
    }
    this.itemMap = nextMap;
  }

  /**
   * Refreshes depth, children chevron, expand, visibility, and lock chrome.
   *
   * @param visibleObjects Currently visible hierarchy objects.
   */
  private syncVisibleItemChrome(visibleObjects: readonly THREE.Object3D[]): void {
    for (const object of visibleObjects) {
      const item = this.itemMap.get(object);
      if (!item) {
        continue;
      }
      const depth = computeOutlinerDepth(object, this.root);
      if (depth >= 0) {
        item.setDepth(depth);
      }
      item.setHasChildren(getOutlinerContentChildren(object).length > 0);
      item.refreshIcon();
      this.applyExpandedState(item, object);
      this.applyVisibilityState(item, object);
      this.applyLockState(item, object);
    }
  }

  /**
   * Updates selection highlighting without rebuilding the tree.
   *
   * @param selectedObjects Currently selected meshes.
   * @param hierarchySelection Hierarchy nodes selected in the outliner.
   */
  updateSelectionStates(selectedObjects: Set<THREE.Mesh>, hierarchySelection: Set<THREE.Object3D>): void {
    if (this.isDisposed) {
      return;
    }
    this.lastSelectedObjects = selectedObjects;
    this.lastHierarchySelection = hierarchySelection;
    this.itemMap.forEach((item, obj) => {
      item.setSelectionState(computeOutlinerRowSelected(obj, selectedObjects, hierarchySelection));
    });
  }

  /**
   * Expands ancestor groups, refreshes if needed, and scrolls to the object
   * row.
   *
   * @param focusObject Mesh or hierarchy node to reveal.
   * @param selectedObjects Currently selected meshes.
   * @param hierarchySelection Hierarchy nodes selected in the outliner.
   */
  revealObject(
    focusObject: THREE.Object3D,
    selectedObjects: Set<THREE.Mesh>,
    hierarchySelection: Set<THREE.Object3D>,
  ): void {
    if (this.isDisposed) {
      return;
    }
    const expanded = this.expandAncestorsOf(focusObject);
    if (expanded || !this.itemMap.has(focusObject)) {
      this.refresh(selectedObjects, hierarchySelection);
    } else {
      this.updateSelectionStates(selectedObjects, hierarchySelection);
    }
    this.scrollToObject(focusObject);
  }

  /**
   * Expands every ancestor of an object up to (and including) the tree root.
   *
   * @param obj Object whose ancestors should be expanded.
   * @returns True when the expanded set changed.
   */
  expandAncestorsOf(obj: THREE.Object3D): boolean {
    let changed = false;
    if (!this.expandedSet.has(this.root.uuid)) {
      this.expandedSet.add(this.root.uuid);
      changed = true;
    }
    let current: THREE.Object3D | null = obj.parent;
    while (current) {
      if (!this.expandedSet.has(current.uuid)) {
        this.expandedSet.add(current.uuid);
        changed = true;
      }
      if (current === this.root) {
        break;
      }
      current = current.parent;
    }
    return changed;
  }

  /**
   * Scrolls the tree so the row for an object is visible.
   *
   * @param obj Object whose outliner row should scroll into view.
   */
  scrollToObject(obj: THREE.Object3D): void {
    const item = this.itemMap.get(obj);
    if (!item) {
      return;
    }
    const row = item.getElement();
    if (typeof row.scrollIntoView === 'function') {
      row.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  /**
   * Toggles the expanded state of an object in the tree.
   *
   * @param obj The Three.js object to toggle.
   */
  toggleExpand(obj: THREE.Object3D): void {
    const key = obj.uuid;
    this.expandPolicyInitialized.add(key);
    if (this.expandedSet.has(key)) {
      this.expandedSet.delete(key);
    } else {
      this.expandedSet.add(key);
    }
    this.refresh(this.lastSelectedObjects, this.lastHierarchySelection);
  }

  /**
   * Returns the currently active search query string.
   *
   * @returns The search query.
   */
  getSearchQuery(): string {
    return this.searchQuery;
  }

  /** Disposes the tree and removes all DOM elements. */
  dispose(): void {
    this.isDisposed = true;
    this.dragSession.endRowDragSession();
    this.clearItems();
    if (this.searchElement.parentNode) {
      this.searchElement.parentNode.removeChild(this.searchElement);
    }
    if (this.treeElement.parentNode) {
      this.treeElement.parentNode.removeChild(this.treeElement);
    }
  }

  /** Builds and styles the search input element. */
  private buildSearchBar(): void {
    this.searchElement.type = 'text';
    this.searchElement.placeholder = 'Search...';
    this.searchElement.style.display = 'block';
    this.searchElement.style.width = '100%';
    this.searchElement.style.boxSizing = 'border-box';
    this.searchElement.style.padding = '4px 8px';
    this.searchElement.style.border = 'none';
    this.searchElement.style.borderBottom = `1px solid ${hexToRgb(Theme.separatorColor)}`;
    this.searchElement.style.background = hexToRgb(Theme.outlinerBackground);
    this.searchElement.style.color = Theme.buttonTextColor;
    this.searchElement.style.fontFamily = 'monospace';
    this.searchElement.style.fontSize = '12px';
    this.searchElement.style.outline = 'none';
    this.searchElement.addEventListener('input', () => {
      this.onSearchInputChanged();
    });
  }

  /** Applies the search box text and refreshes visible rows. */
  private onSearchInputChanged(): void {
    this.searchQuery = this.searchElement.value;
    this.refresh(this.lastSelectedObjects, this.lastHierarchySelection);
  }

  /** Builds and styles the tree container element. */
  private buildTreeContainer(): void {
    this.treeElement.style.flex = '1';
    this.treeElement.style.overflowY = 'auto';
    this.treeElement.style.padding = `${OUTLINER_TREE_PADDING_PX}px`;
    this.treeElement.style.position = 'relative';
    this.dragSession.attachIndicator(this.treeElement);
  }

  /** Removes all existing items from the DOM and clears state maps. */
  private clearItems(): void {
    this.itemMap.forEach((item) => {
      item.dispose();
    });
    this.itemMap.clear();
    this.treeElement.replaceChildren();
    this.dragSession.attachIndicator(this.treeElement);
  }

  /**
   * Returns the number of visible content rows (excludes the insert indicator).
   *
   * @returns Visible row count for tests and layout helpers.
   */
  getVisibleRowCountForTests(): number {
    return this.itemMap.size;
  }

  /**
   * Applies the selection highlight to an item based on mesh and hierarchy
   * selection.
   *
   * @param item The outliner item to update.
   * @param obj The Three.js object associated with the item.
   * @param selectedObjects The set of selected meshes.
   * @param hierarchySelection Hierarchy nodes selected in the outliner.
   */
  private applySelectionState(
    item: OutlinerItem,
    obj: THREE.Object3D,
    selectedObjects: Set<THREE.Mesh>,
    hierarchySelection: Set<THREE.Object3D>,
  ): void {
    item.setSelectionState(computeOutlinerRowSelected(obj, selectedObjects, hierarchySelection));
  }

  /**
   * Applies the expanded state to an item based on the expanded set.
   *
   * @param item The outliner item to update.
   * @param obj The Three.js object associated with the item.
   */
  private applyExpandedState(item: OutlinerItem, obj: THREE.Object3D): void {
    item.setExpandedState(this.expandedSet.has(obj.uuid));
  }

  /**
   * Applies the visibility state to an item from the object's visible property.
   *
   * @param item The outliner item to update.
   * @param obj The Three.js object associated with the item.
   */
  private applyVisibilityState(item: OutlinerItem, obj: THREE.Object3D): void {
    item.setVisibilityState(obj.visible);
  }

  /**
   * Applies the lock state to an item from the object's lock userData.
   *
   * @param item The outliner item to update.
   * @param obj The Three.js object associated with the item.
   */
  private applyLockState(item: OutlinerItem, obj: THREE.Object3D): void {
    item.setLockState(isObjectLocked(obj));
  }

  /**
   * Binds all callback handlers to an outliner item.
   *
   * @param item The item to bind callbacks to.
   */
  private bindItemCallbacks(item: OutlinerItem): void {
    this.bindSelectionCallback(item);
    this.bindVisibilityCallback(item);
    this.bindLockCallback(item);
    this.bindExpandCallback(item);
    this.bindRenameCallback(item);
    this.bindContextMenuCallback(item);
    this.dragSession.bindItemDragDropCallbacks(item);
  }

  /**
   * Binds the row selection callback.
   *
   * @param item Outliner item.
   */
  private bindSelectionCallback(item: OutlinerItem): void {
    item.onSelection((obj, event) => {
      this.onSelect?.(obj, event);
    });
  }

  /**
   * Binds the visibility toggle callback.
   *
   * @param item Outliner item.
   */
  private bindVisibilityCallback(item: OutlinerItem): void {
    item.onVisibilityToggle((obj) => {
      this.onVisibility?.(obj);
    });
  }

  /**
   * Binds the lock toggle callback.
   *
   * @param item Outliner item.
   */
  private bindLockCallback(item: OutlinerItem): void {
    item.onLockToggle((obj) => {
      this.onLock?.(obj);
    });
  }

  /**
   * Binds the expand/collapse callback.
   *
   * @param item Outliner item.
   */
  private bindExpandCallback(item: OutlinerItem): void {
    item.onExpandToggle((obj) => {
      this.toggleExpand(obj);
    });
  }

  /**
   * Binds the rename callback.
   *
   * @param item Outliner item.
   */
  private bindRenameCallback(item: OutlinerItem): void {
    item.onRenameRequest((obj, newName) => {
      this.onRename?.(obj, newName);
    });
  }

  /**
   * Binds the context menu callback.
   *
   * @param item Outliner item.
   */
  private bindContextMenuCallback(item: OutlinerItem): void {
    item.onContextMenuRequest((obj, x, y) => {
      this.contextMenuCallback?.(obj, x, y);
    });
  }
}

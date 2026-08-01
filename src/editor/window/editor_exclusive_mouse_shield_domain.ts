import { EditorExclusiveMouseShield } from './editor_exclusive_mouse_shield.js';

/** Pointer and wheel listeners attached to every mounted exclusive shield. */
export interface EditorExclusiveMouseShieldDomainListeners {
  onPointerDown: (event: PointerEvent) => void;
  onPointerUp: (event: PointerEvent) => void;
  onPointerMove: (event: PointerEvent) => void;
  onContextMenu: (event: Event) => void;
  onWheel: (event: WheelEvent) => void;
}

/**
 * Mounts one exclusive mouse shield per document so the main application and
 * every detached viewport window block chrome while a tool is busy. Hit-testing
 * is document-scoped so multi-window client coordinates never cross-match: a
 * detached shield only considers detached pick elements, and the main shield
 * only considers main pick elements.
 */
export class EditorExclusiveMouseShieldDomain {
  private readonly shieldsByDocument: Map<Document, EditorExclusiveMouseShield>;
  private readonly shieldByRootElement: Map<HTMLElement, EditorExclusiveMouseShield>;
  private listeners: EditorExclusiveMouseShieldDomainListeners | null;

  /** Creates an empty multi-document shield domain. */
  constructor() {
    this.shieldsByDocument = new Map();
    this.shieldByRootElement = new Map();
    this.listeners = null;
  }

  /**
   * Stores the shared handlers applied to each shield root when mounted.
   *
   * @param listeners Pointer and wheel handlers from the input bridge.
   */
  setListeners(listeners: EditorExclusiveMouseShieldDomainListeners | null): void {
    this.detachListenersFromAllShields();
    this.listeners = listeners;
    this.attachListenersToAllShields();
  }

  /**
   * Mounts shields on the given documents and unmounts any that are no longer
   * required.
   *
   * @param documents Documents that must host a blocking overlay.
   */
  syncMountedDocuments(documents: readonly Document[]): void {
    const needed = new Set(documents);
    this.unmountDocumentsNotInSet(needed);
    this.mountDocumentsInSet(needed);
  }

  /** Unmounts every shield and clears the domain. */
  unmountAll(): void {
    for (const shield of this.shieldsByDocument.values()) {
      this.detachListenersFromShield(shield);
      this.shieldByRootElement.delete(shield.getRootElement());
      shield.unmount();
    }
    this.shieldsByDocument.clear();
  }

  /**
   * Returns whether any shield is currently mounted.
   *
   * @returns True when at least one document has an active overlay.
   */
  isAnyMounted(): boolean {
    for (const shield of this.shieldsByDocument.values()) {
      if (shield.isActive()) {
        return true;
      }
    }
    return false;
  }

  /**
   * Returns the number of mounted exclusive shields.
   *
   * @returns Mounted shield count.
   */
  getMountedShieldCount(): number {
    let count = 0;
    for (const shield of this.shieldsByDocument.values()) {
      if (shield.isActive()) {
        count += 1;
      }
    }
    return count;
  }

  /**
   * Returns the mounted shield root for a document, if any.
   *
   * @param ownerDocument Document that may host a shield.
   * @returns Shield element, or null when not mounted.
   */
  getMountedShieldElement(ownerDocument: Document): HTMLElement | null {
    const shield = this.resolveShieldForEventDocument(ownerDocument);
    if (!shield || !shield.isActive()) {
      return null;
    }
    return shield.getRootElement();
  }

  /**
   * Returns every mounted shield root element.
   *
   * @returns Mounted shield roots in insertion order.
   */
  getMountedShieldElements(): HTMLElement[] {
    const elements: HTMLElement[] = [];
    for (const shield of this.shieldsByDocument.values()) {
      if (shield.isActive()) {
        elements.push(shield.getRootElement());
      }
    }
    return elements;
  }

  /**
   * Finds which exclusive viewport content owns a client point in the event's
   * document. Never cross-matches main and detached coordinates.
   *
   * @param clientX Pointer client X in the event document.
   * @param clientY Pointer client Y in the event document.
   * @param exclusiveRoots Pinned viewport content elements across all windows.
   * @param eventDocument Document that received the pointer event.
   * @returns Matching root in that document, or null when over chrome.
   */
  findExclusiveRootAtClientPoint(
    clientX: number,
    clientY: number,
    exclusiveRoots: readonly HTMLElement[],
    eventDocument: Document | null,
  ): HTMLElement | null {
    if (!eventDocument) {
      return null;
    }
    const rootsInDocument = this.filterRootsForDocument(exclusiveRoots, eventDocument);
    const shield = this.resolveShieldForEventDocument(eventDocument);
    if (shield) {
      return shield.findExclusiveRootAtClientPoint(clientX, clientY, rootsInDocument);
    }
    if (rootsInDocument.length === 0) {
      return null;
    }
    return this.findSmallestRootContainingClientPointByBounds(clientX, clientY, rootsInDocument);
  }

  /**
   * Resolves a navigation/wheel target for the event document (sole detached
   * pane falls back to that root when geometry misses).
   *
   * @param clientX Pointer client X in the event document.
   * @param clientY Pointer client Y in the event document.
   * @param exclusiveRoots Pinned viewport content elements across all windows.
   * @param eventDocument Document that received the pointer event.
   * @returns Navigation target in that document, or null.
   */
  findNavigationRootAtClientPoint(
    clientX: number,
    clientY: number,
    exclusiveRoots: readonly HTMLElement[],
    eventDocument: Document | null,
  ): HTMLElement | null {
    if (!eventDocument) {
      return null;
    }
    const rootsInDocument = this.filterRootsForDocument(exclusiveRoots, eventDocument);
    const shield = this.resolveShieldForEventDocument(eventDocument);
    if (shield) {
      return shield.findNavigationRootAtClientPoint(clientX, clientY, rootsInDocument);
    }
    if (rootsInDocument.length === 1) {
      return rootsInDocument[0] ?? null;
    }
    return this.findSmallestRootContainingClientPointByBounds(clientX, clientY, rootsInDocument);
  }

  /**
   * Enables or disables pointer hit-testing on the shield for a document so
   * viewport navigation can receive real (trusted) pointer events underneath.
   *
   * @param ownerDocument Document whose shield should change hit-testing.
   * @param blocks True when the shield must capture pointer hits.
   */
  setBlocksPointerEventsForDocument(ownerDocument: Document, blocks: boolean): void {
    const shield = this.resolveShieldForEventDocument(ownerDocument);
    if (!shield) {
      return;
    }
    shield.setBlocksPointerEvents(blocks);
  }

  /**
   * Resolves the bound document for a shield event from the event target.
   *
   * @param event Browser event raised on a shield root.
   * @returns Bound document, or null when the event is not from a known shield.
   */
  resolveBoundDocumentFromEvent(event: Event): Document | null {
    const currentTarget = event.currentTarget;
    if (currentTarget instanceof HTMLElement) {
      const shield = this.shieldByRootElement.get(currentTarget);
      if (shield) {
        return shield.getBoundDocument();
      }
      return currentTarget.ownerDocument;
    }
    const target = event.target;
    if (target instanceof Node) {
      return target.ownerDocument;
    }
    return null;
  }

  /**
   * Resolves the shield for the document that raised the event.
   *
   * @param eventDocument Document that received the event.
   * @returns Shield for that document, or null (never guesses another window).
   */
  private resolveShieldForEventDocument(eventDocument: Document | null): EditorExclusiveMouseShield | null {
    if (!eventDocument) {
      return null;
    }
    const direct = this.shieldsByDocument.get(eventDocument);
    if (direct) {
      return direct;
    }
    for (const shield of this.shieldsByDocument.values()) {
      if (shield.getBoundDocument() === eventDocument) {
        return shield;
      }
      if (shield.getRootElement().ownerDocument === eventDocument) {
        return shield;
      }
    }
    return null;
  }

  /**
   * Filters exclusive roots to one document.
   *
   * @param exclusiveRoots All pinned roots.
   * @param ownerDocument Document that must own the roots.
   * @returns Roots in that document.
   */
  private filterRootsForDocument(exclusiveRoots: readonly HTMLElement[], ownerDocument: Document): HTMLElement[] {
    const filtered: HTMLElement[] = [];
    for (const root of exclusiveRoots) {
      if (root.ownerDocument === ownerDocument) {
        filtered.push(root);
      }
    }
    return filtered;
  }

  /**
   * Bounds hit test picking the smallest containing root.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param exclusiveRoots Same-document exclusive roots.
   * @returns Matching root, or null.
   */
  private findSmallestRootContainingClientPointByBounds(
    clientX: number,
    clientY: number,
    exclusiveRoots: readonly HTMLElement[],
  ): HTMLElement | null {
    let best: HTMLElement | null = null;
    let bestArea = Number.POSITIVE_INFINITY;
    for (const root of exclusiveRoots) {
      if (!this.isClientPointInsideElementBounds(clientX, clientY, root)) {
        continue;
      }
      const rect = root.getBoundingClientRect();
      const area = Math.max(rect.width, 0) * Math.max(rect.height, 0);
      if (area < bestArea) {
        best = root;
        bestArea = area;
      }
    }
    return best;
  }

  /**
   * Geometry test for a client point against an element bounding box.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param element Element whose bounds are tested.
   * @returns True when the point is inside the element.
   */
  private isClientPointInsideElementBounds(clientX: number, clientY: number, element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }

  /**
   * Unmounts shields whose documents are not in the needed set.
   *
   * @param needed Documents that must remain mounted.
   */
  private unmountDocumentsNotInSet(needed: ReadonlySet<Document>): void {
    for (const [doc, shield] of [...this.shieldsByDocument.entries()]) {
      if (needed.has(doc)) {
        continue;
      }
      this.detachListenersFromShield(shield);
      this.shieldByRootElement.delete(shield.getRootElement());
      shield.unmount();
      this.shieldsByDocument.delete(doc);
    }
  }

  /**
   * Ensures every needed document has a mounted shield with listeners.
   *
   * @param needed Documents that must host a shield.
   */
  private mountDocumentsInSet(needed: ReadonlySet<Document>): void {
    for (const doc of needed) {
      this.mountDocument(doc);
    }
  }

  /**
   * Creates or reuses a shield for one document and mounts it.
   *
   * @param ownerDocument Document that hosts the shield.
   */
  private mountDocument(ownerDocument: Document): void {
    let shield = this.shieldsByDocument.get(ownerDocument);
    if (!shield) {
      shield = new EditorExclusiveMouseShield(ownerDocument);
      this.shieldsByDocument.set(ownerDocument, shield);
      this.shieldByRootElement.set(shield.getRootElement(), shield);
      this.attachListenersToShield(shield);
    }
    shield.mount(ownerDocument);
  }

  /** Attaches shared listeners to every currently tracked shield. */
  private attachListenersToAllShields(): void {
    for (const shield of this.shieldsByDocument.values()) {
      this.attachListenersToShield(shield);
    }
  }

  /** Detaches shared listeners from every currently tracked shield. */
  private detachListenersFromAllShields(): void {
    for (const shield of this.shieldsByDocument.values()) {
      this.detachListenersFromShield(shield);
    }
  }

  /**
   * Attaches domain listeners to one shield root.
   *
   * @param shield Shield that should receive pointer events.
   */
  private attachListenersToShield(shield: EditorExclusiveMouseShield): void {
    const listeners = this.listeners;
    if (!listeners) {
      return;
    }
    const root = shield.getRootElement();
    root.addEventListener('pointerdown', listeners.onPointerDown);
    root.addEventListener('pointerup', listeners.onPointerUp);
    root.addEventListener('pointermove', listeners.onPointerMove);
    root.addEventListener('contextmenu', listeners.onContextMenu);
    root.addEventListener('wheel', listeners.onWheel, { passive: false });
  }

  /**
   * Detaches domain listeners from one shield root.
   *
   * @param shield Shield that should stop receiving pointer events.
   */
  private detachListenersFromShield(shield: EditorExclusiveMouseShield): void {
    const listeners = this.listeners;
    if (!listeners) {
      return;
    }
    const root = shield.getRootElement();
    root.removeEventListener('pointerdown', listeners.onPointerDown);
    root.removeEventListener('pointerup', listeners.onPointerUp);
    root.removeEventListener('pointermove', listeners.onPointerMove);
    root.removeEventListener('contextmenu', listeners.onContextMenu);
    root.removeEventListener('wheel', listeners.onWheel);
  }
}

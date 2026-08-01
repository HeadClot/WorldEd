import { describe, it, expect, afterEach, vi } from 'vitest';
import { EditorExclusiveMouseShieldDomain } from '@/editor/window/editor_exclusive_mouse_shield_domain.js';

/**
 * Builds a mock document with an independent body for multi-window tests.
 *
 * @returns Document-like host with body append support.
 */
function createMockDocument(): Document {
  const body = document.createElement('div');
  const mockDocument = {
    body,
    createElement: (tag: string) => {
      const element = document.createElement(tag);
      Object.defineProperty(element, 'ownerDocument', {
        value: mockDocument,
        configurable: true,
      });
      return element;
    },
    elementFromPoint: () => null,
  } as unknown as Document;
  Object.defineProperty(body, 'ownerDocument', {
    value: mockDocument,
    configurable: true,
  });
  return mockDocument;
}

/**
 * Builds a fake exclusive root owned by a specific document.
 *
 * @param ownerDocument Document that owns the root.
 * @param left Bounds left.
 * @param top Bounds top.
 * @param right Bounds right.
 * @param bottom Bounds bottom.
 * @returns Root element stub.
 */
function createRootForDocument(
  ownerDocument: Document,
  left: number,
  top: number,
  right: number,
  bottom: number,
): HTMLElement {
  const root = ownerDocument.createElement('div');
  Object.defineProperty(root, 'ownerDocument', { value: ownerDocument });
  root.getBoundingClientRect = () =>
    ({
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top,
      x: left,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
  return root;
}

describe('EditorExclusiveMouseShieldDomain', () => {
  let domain: EditorExclusiveMouseShieldDomain;

  afterEach(() => {
    domain?.unmountAll();
  });

  it('mounts one shield per document so main and detached windows are blocked', () => {
    domain = new EditorExclusiveMouseShieldDomain();
    const detachedDocument = createMockDocument();
    domain.syncMountedDocuments([document, detachedDocument]);
    expect(domain.getMountedShieldCount()).toBe(2);
    expect(domain.isAnyMounted()).toBe(true);
    expect(domain.getMountedShieldElement(document)).toBeTruthy();
    expect(domain.getMountedShieldElement(detachedDocument)).toBeTruthy();
    expect(document.body.contains(domain.getMountedShieldElement(document)!)).toBe(true);
    expect(detachedDocument.body.contains(domain.getMountedShieldElement(detachedDocument)!)).toBe(true);
  });

  it('routes hit tests only against roots in the event document', () => {
    domain = new EditorExclusiveMouseShieldDomain();
    const detachedDocument = createMockDocument();
    domain.syncMountedDocuments([document, detachedDocument]);
    const mainRoot = createRootForDocument(document, 0, 0, 100, 100);
    document.body.appendChild(mainRoot);
    const detachedRoot = createRootForDocument(detachedDocument, 0, 0, 100, 100);
    detachedDocument.body.appendChild(detachedRoot);
    const roots = [mainRoot, detachedRoot];
    expect(domain.findExclusiveRootAtClientPoint(10, 10, roots, document)).toBe(mainRoot);
    expect(domain.findExclusiveRootAtClientPoint(10, 10, roots, detachedDocument)).toBe(detachedRoot);
    expect(domain.findExclusiveRootAtClientPoint(5000, 5000, roots, document)).toBeNull();
    expect(domain.findNavigationRootAtClientPoint(5000, 5000, roots, detachedDocument)).toBe(detachedRoot);
    mainRoot.remove();
  });

  it('never cross-matches detached client coordinates against main roots', () => {
    domain = new EditorExclusiveMouseShieldDomain();
    const detachedDocument = createMockDocument();
    domain.syncMountedDocuments([document, detachedDocument]);
    const mainTopLeft = createRootForDocument(document, 0, 0, 400, 300);
    document.body.appendChild(mainTopLeft);
    const detachedRoot = createRootForDocument(detachedDocument, 0, 0, 800, 600);
    detachedDocument.body.appendChild(detachedRoot);
    const roots = [mainTopLeft, detachedRoot];
    expect(domain.findExclusiveRootAtClientPoint(50, 50, roots, detachedDocument)).toBe(detachedRoot);
    expect(domain.findExclusiveRootAtClientPoint(50, 50, roots, detachedDocument)).not.toBe(mainTopLeft);
    expect(domain.findExclusiveRootAtClientPoint(50, 50, roots, document)).toBe(mainTopLeft);
    mainTopLeft.remove();
  });

  it('picks the smallest same-document pane when multiple bounds contain the point', () => {
    domain = new EditorExclusiveMouseShieldDomain();
    domain.syncMountedDocuments([document]);
    const large = createRootForDocument(document, 0, 0, 400, 400);
    const small = createRootForDocument(document, 100, 100, 200, 200);
    document.body.appendChild(large);
    document.body.appendChild(small);
    expect(domain.findExclusiveRootAtClientPoint(150, 150, [large, small], document)).toBe(small);
    large.remove();
    small.remove();
  });

  it('resolves bound document from the shield element that raised the event', () => {
    domain = new EditorExclusiveMouseShieldDomain();
    const detachedDocument = createMockDocument();
    domain.syncMountedDocuments([document, detachedDocument]);
    const mainShield = domain.getMountedShieldElement(document);
    const detachedShield = domain.getMountedShieldElement(detachedDocument);
    expect(mainShield).toBeTruthy();
    expect(detachedShield).toBeTruthy();
    const mainEvent = new PointerEvent('pointerdown', { bubbles: true });
    Object.defineProperty(mainEvent, 'currentTarget', { value: mainShield });
    const detachedEvent = new PointerEvent('pointerdown', { bubbles: true });
    Object.defineProperty(detachedEvent, 'currentTarget', { value: detachedShield });
    expect(domain.resolveBoundDocumentFromEvent(mainEvent)).toBe(document);
    expect(domain.resolveBoundDocumentFromEvent(detachedEvent)).toBe(detachedDocument);
  });

  it('attaches shared listeners to every mounted shield', () => {
    domain = new EditorExclusiveMouseShieldDomain();
    const detachedDocument = createMockDocument();
    const onPointerDown = vi.fn();
    domain.setListeners({
      onPointerDown,
      onPointerUp: () => {},
      onPointerMove: () => {},
      onContextMenu: () => {},
      onWheel: () => {},
    });
    domain.syncMountedDocuments([document, detachedDocument]);
    const mainShield = domain.getMountedShieldElement(document);
    const detachedShield = domain.getMountedShieldElement(detachedDocument);
    expect(mainShield).toBeTruthy();
    expect(detachedShield).toBeTruthy();
    mainShield!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    detachedShield!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    expect(onPointerDown).toHaveBeenCalledTimes(2);
  });

  it('unmounts shields that are no longer needed', () => {
    domain = new EditorExclusiveMouseShieldDomain();
    const detachedDocument = createMockDocument();
    domain.syncMountedDocuments([document, detachedDocument]);
    expect(domain.getMountedShieldCount()).toBe(2);
    domain.syncMountedDocuments([document]);
    expect(domain.getMountedShieldCount()).toBe(1);
    expect(domain.getMountedShieldElement(detachedDocument)).toBeNull();
  });
});

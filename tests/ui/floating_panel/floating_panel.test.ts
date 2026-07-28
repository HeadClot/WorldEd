import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FloatingPanel } from '../../../src/ui/floating_panel/floating_panel.js';
import { FloatingPanelStack } from '../../../src/ui/floating_panel_stack.js';

/** Minimal concrete FloatingPanel for unit tests. */
class TestFloatingPanel extends FloatingPanel {
  /**
   * Creates a test panel with a simple title bar and body.
   *
   * @param host Host element.
   * @param anchor Optional default anchor.
   */
  constructor(host: HTMLElement, anchor: HTMLElement | null = null) {
    super(host, { corner: 'bottom-left', paddingPx: 8 }, anchor);
    const title = document.createElement('div');
    title.dataset['testTitle'] = '1';
    title.style.height = '24px';
    this.bindTitleBarDrag(title);
    this.root.appendChild(title);
    this.root.style.width = '120px';
    this.root.style.height = '80px';
  }
}

/**
 * Stubs getBoundingClientRect for layout-sensitive placement tests.
 *
 * @param element Target element.
 * @param rect Partial DOM rect values.
 */
function stubBoundingRect(
  element: HTMLElement,
  rect: { left: number; top: number; width: number; height: number },
): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    }),
  });
}

/**
 * Stubs panel size from style left/top so clamp uses the placed coordinates.
 *
 * @param element Panel root element.
 * @param width Panel width.
 * @param height Panel height.
 */
function stubPanelRectFromStyle(element: HTMLElement, width: number, height: number): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => {
      const left = parseFloat(element.style.left) || 0;
      const top = parseFloat(element.style.top) || 0;
      return {
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        x: left,
        y: top,
        toJSON: () => ({}),
      };
    },
  });
}

describe('FloatingPanel', () => {
  let host: HTMLElement;
  let panel: TestFloatingPanel | null;

  beforeEach(() => {
    FloatingPanelStack.resetForTests();
  });

  afterEach(() => {
    panel?.dispose();
    panel = null;
    host?.remove();
    FloatingPanelStack.resetForTests();
  });

  it('starts hidden and toggles open and closed', () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    panel = new TestFloatingPanel(host);
    expect(panel.isOpen()).toBe(false);
    panel.show();
    expect(panel.isOpen()).toBe(true);
    expect(panel.getRootElement().style.display).toBe('flex');
    panel.hide();
    expect(panel.isOpen()).toBe(false);
    panel.toggle();
    expect(panel.isOpen()).toBe(true);
    panel.toggle();
    expect(panel.isOpen()).toBe(false);
  });

  it('places bottom-left of the anchor with padding on first show', () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    const anchor = document.createElement('div');
    document.body.appendChild(anchor);
    stubBoundingRect(anchor, { left: 100, top: 50, width: 200, height: 300 });
    panel = new TestFloatingPanel(host, anchor);
    stubPanelRectFromStyle(panel.getRootElement(), 120, 80);
    panel.show();
    const root = panel.getRootElement();
    expect(root.style.left).toBe('108px');
    expect(root.style.top).toBe('262px');
    anchor.remove();
  });

  it('rescans the live anchor resolver on every re-open', () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    stubBoundingRect(host, { left: 0, top: 0, width: 40, height: 40 });
    const removedStartupPane = document.createElement('div');
    document.body.appendChild(removedStartupPane);
    stubBoundingRect(removedStartupPane, { left: 0, top: 0, width: 100, height: 100 });
    const largestPerspective = document.createElement('div');
    document.body.appendChild(largestPerspective);
    stubBoundingRect(largestPerspective, { left: 400, top: 80, width: 500, height: 400 });
    let liveAnchor: HTMLElement | null = removedStartupPane;
    panel = new TestFloatingPanel(host, removedStartupPane);
    panel.setDefaultAnchorResolver(() => liveAnchor);
    stubPanelRectFromStyle(panel.getRootElement(), 120, 80);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 });
    panel.show();
    expect(panel.getRootElement().style.left).toBe('8px');
    panel.hide();
    removedStartupPane.remove();
    liveAnchor = largestPerspective;
    panel.show();
    expect(panel.getRootElement().style.left).toBe('408px');
    expect(panel.getRootElement().style.top).toBe('392px');
    expect(panel.getDefaultAnchor()).toBe(largestPerspective);
    largestPerspective.remove();
  });

  it('ignores a disconnected static anchor when no live resolver is set', () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    stubBoundingRect(host, { left: 20, top: 30, width: 300, height: 200 });
    const detachedAnchor = document.createElement('div');
    document.body.appendChild(detachedAnchor);
    stubBoundingRect(detachedAnchor, { left: 0, top: 0, width: 50, height: 50 });
    panel = new TestFloatingPanel(host, detachedAnchor);
    stubPanelRectFromStyle(panel.getRootElement(), 120, 80);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
    detachedAnchor.remove();
    panel.show();
    expect(panel.getRootElement().style.left).toBe('28px');
    expect(panel.getRootElement().style.top).toBe('142px');
    expect(panel.getDefaultAnchor()).toBeNull();
  });

  it('registers with the stack and unregisters on dispose', () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    panel = new TestFloatingPanel(host);
    panel.show();
    expect(FloatingPanelStack.getRegisteredCount()).toBe(1);
    panel.dispose();
    panel = null;
    expect(FloatingPanelStack.getRegisteredCount()).toBe(0);
  });
});

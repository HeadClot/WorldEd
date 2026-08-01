import { describe, it, expect, afterEach } from 'vitest';
import { EditorExclusiveMouseShield } from '@/editor/window/editor_exclusive_mouse_shield.js';

describe('EditorExclusiveMouseShield', () => {
  let shield: EditorExclusiveMouseShield;

  afterEach(() => {
    shield?.unmount();
  });

  it('mounts a full-screen shield on the document body and steals keyboard focus', () => {
    shield = new EditorExclusiveMouseShield(document);
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.focus();
    expect(document.activeElement).toBe(button);
    shield.mount(document);
    expect(shield.isActive()).toBe(true);
    expect(document.body.contains(shield.getRootElement())).toBe(true);
    expect(document.activeElement).toBe(shield.getRootElement());
    button.remove();
  });

  it('hit-tests exclusive viewport membership via element bounds fallback', () => {
    shield = new EditorExclusiveMouseShield(document);
    shield.mount(document);
    const viewport = document.createElement('div');
    document.body.appendChild(viewport);
    viewport.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 100,
        bottom: 100,
        width: 100,
        height: 100,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    expect(shield.isClientPointInExclusiveViewport(10, 10, [viewport])).toBe(true);
    expect(shield.isClientPointInExclusiveViewport(5000, 5000, [viewport])).toBe(false);
    expect(shield.findNavigationRootAtClientPoint(5000, 5000, [viewport])).toBe(viewport);
    viewport.remove();
  });

  it('ignores exclusive roots that belong to a different document', () => {
    shield = new EditorExclusiveMouseShield(document);
    shield.mount(document);
    const foreignRoot = {
      ownerDocument: {} as Document,
      getBoundingClientRect: () =>
        ({
          left: 0,
          top: 0,
          right: 100,
          bottom: 100,
          width: 100,
          height: 100,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect,
      contains: () => false,
    } as unknown as HTMLElement;
    expect(shield.isClientPointInExclusiveViewport(10, 10, [foreignRoot])).toBe(false);
  });

  it('prefers the smallest same-document pane under the pointer', () => {
    shield = new EditorExclusiveMouseShield(document);
    shield.mount(document);
    const large = document.createElement('div');
    const small = document.createElement('div');
    document.body.appendChild(large);
    document.body.appendChild(small);
    large.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 400,
        bottom: 400,
        width: 400,
        height: 400,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    small.getBoundingClientRect = () =>
      ({
        left: 100,
        top: 100,
        right: 200,
        bottom: 200,
        width: 100,
        height: 100,
        x: 100,
        y: 100,
        toJSON: () => ({}),
      }) as DOMRect;
    expect(shield.findExclusiveRootAtClientPoint(150, 150, [large, small])).toBe(small);
    large.remove();
    small.remove();
  });
});

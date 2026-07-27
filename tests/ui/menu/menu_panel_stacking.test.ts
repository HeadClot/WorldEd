import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MenuPanel } from '../../../src/ui/menu/menu_panel.js';
import { FloatingPanelStack } from '../../../src/ui/floating_panel_stack.js';
import { UiStackLayers } from '../../../src/ui/ui_stack_layers.js';

describe('MenuPanel stacking', () => {
  beforeEach(() => {
    FloatingPanelStack.resetForTests();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('should mount root menus on document.body above floating panels', () => {
    const tools = document.createElement('div');
    document.body.appendChild(tools);
    FloatingPanelStack.bringToFront(tools);
    const toolsZ = Number(tools.style.zIndex);

    const home = document.createElement('div');
    document.body.appendChild(home);
    const anchor = document.createElement('button');
    home.appendChild(anchor);
    Object.defineProperty(anchor, 'getBoundingClientRect', {
      value: () => ({ left: 40, bottom: 80, top: 50, right: 100, width: 60, height: 30 }),
    });

    const panel = new MenuPanel([{ kind: 'action', label: 'New', onClick: () => undefined }], () => undefined);
    home.appendChild(panel.getElement());
    panel.open(anchor);

    const menu = panel.getElement();
    expect(menu.parentElement).toBe(document.body);
    expect(menu.style.position).toBe('fixed');
    expect(Number(menu.style.zIndex)).toBe(UiStackLayers.menu);
    expect(Number(menu.style.zIndex)).toBeGreaterThan(toolsZ);
    expect(menu.style.display).toBe('block');
    expect(menu.style.top).toBe('84px');
    expect(menu.style.left).toBe('40px');

    panel.close();
    expect(menu.parentElement).toBe(home);
    expect(menu.style.display).toBe('none');
  });

  it('should mount root menus on the anchor ownerDocument body for detached windows', () => {
    const popupRoot = document.createElement('div');
    document.body.appendChild(popupRoot);
    const fakeBody = document.createElement('div');
    popupRoot.appendChild(fakeBody);
    const fakeDocument = {
      body: fakeBody,
    } as unknown as Document;
    const home = document.createElement('div');
    fakeBody.appendChild(home);
    const anchor = document.createElement('button');
    Object.defineProperty(anchor, 'ownerDocument', {
      value: fakeDocument,
      configurable: true,
    });
    Object.defineProperty(anchor, 'getBoundingClientRect', {
      value: () => ({ left: 12, bottom: 40, top: 20, right: 80, width: 68, height: 20 }),
    });
    home.appendChild(anchor);

    const panel = new MenuPanel([{ kind: 'action', label: 'Perspective', onClick: () => undefined }], () => undefined);
    home.appendChild(panel.getElement());
    panel.open(anchor);

    expect(panel.getElement().parentElement).toBe(fakeBody);
    expect(panel.getElement().parentElement).not.toBe(document.body);
    expect(panel.getElement().style.top).toBe('44px');
    expect(panel.getElement().style.left).toBe('12px');
    panel.close();
  });
});

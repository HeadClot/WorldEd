import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PanelMenu } from '@/ui/menu/panel_menu.js';
import { FloatingPanelStack } from '@/ui/floating_panel/panel_floating_stack.js';
import { UiStackLayers } from '@/ui/stack/ui_stack_layers.js';

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

    const panel = new PanelMenu([{ kind: 'action', label: 'New', onClick: () => undefined }], () => undefined);
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

  it('should register open root menus as pointer-block surfaces and clear on close', () => {
    const home = document.createElement('div');
    document.body.appendChild(home);
    const anchor = document.createElement('button');
    home.appendChild(anchor);
    Object.defineProperty(anchor, 'getBoundingClientRect', {
      value: () => ({ left: 10, bottom: 40, top: 20, right: 70, width: 60, height: 20 }),
    });
    const panel = new PanelMenu([{ kind: 'action', label: 'Save', onClick: () => undefined }], () => undefined);
    home.appendChild(panel.getElement());
    expect(FloatingPanelStack.getPointerBlockSurfaceCount()).toBe(0);
    panel.open(anchor);
    const menu = panel.getElement();
    const item = menu.querySelector('.editor-toolbar-dropdown-item') as HTMLElement;
    expect(FloatingPanelStack.getPointerBlockSurfaceCount()).toBe(1);
    expect(FloatingPanelStack.containsEventTarget(item)).toBe(true);
    panel.close();
    expect(FloatingPanelStack.getPointerBlockSurfaceCount()).toBe(0);
    expect(FloatingPanelStack.containsEventTarget(item)).toBe(false);
    expect(menu.parentElement).toBe(home);
  });

  it('should unmount ephemeral openAt roots from the document when closed', () => {
    const panel = new PanelMenu([{ kind: 'action', label: 'Duplicate', onClick: () => undefined }], () => undefined);
    panel.openAt(120, 80, document);
    const menu = panel.getElement();
    expect(document.body.contains(menu)).toBe(true);
    expect(FloatingPanelStack.getPointerBlockSurfaceCount()).toBe(1);
    panel.close();
    expect(document.body.contains(menu)).toBe(false);
    expect(FloatingPanelStack.getPointerBlockSurfaceCount()).toBe(0);
    panel.openAt(10, 10, document);
    expect(document.body.contains(menu)).toBe(true);
    panel.dispose();
    expect(document.body.contains(menu)).toBe(false);
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

    const panel = new PanelMenu([{ kind: 'action', label: 'Perspective', onClick: () => undefined }], () => undefined);
    home.appendChild(panel.getElement());
    panel.open(anchor);

    expect(panel.getElement().parentElement).toBe(fakeBody);
    expect(panel.getElement().parentElement).not.toBe(document.body);
    expect(panel.getElement().style.top).toBe('44px');
    expect(panel.getElement().style.left).toBe('12px');
    panel.close();
  });
});

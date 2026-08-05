import { describe, it, expect, beforeEach } from 'vitest';
import { FloatingPanelStack } from '@/ui/floating_panel/panel_floating_stack.js';
import { UiStackLayers } from '@/ui/stack/ui_stack_layers.js';

describe('FloatingPanelStack', () => {
  beforeEach(() => {
    FloatingPanelStack.resetForTests();
  });

  it('raises the second panel above the first when brought to front', () => {
    const first = document.createElement('div');
    const second = document.createElement('div');
    FloatingPanelStack.bringToFront(first);
    FloatingPanelStack.bringToFront(second);
    const firstZ = Number(first.style.zIndex);
    const secondZ = Number(second.style.zIndex);
    expect(secondZ).toBeGreaterThan(firstZ);
  });

  it('raises a previously lower panel above peers after another bringToFront', () => {
    const tools = document.createElement('div');
    const texture = document.createElement('div');
    FloatingPanelStack.bringToFront(tools);
    FloatingPanelStack.bringToFront(texture);
    FloatingPanelStack.bringToFront(tools);
    expect(Number(tools.style.zIndex)).toBeGreaterThan(Number(texture.style.zIndex));
  });

  it('keeps floating panels under the menu band after many focus changes', () => {
    const panel = document.createElement('div');
    for (let i = 0; i < 20; i += 1) {
      FloatingPanelStack.bringToFront(panel);
    }
    expect(Number(panel.style.zIndex)).toBeLessThan(UiStackLayers.menu);
    expect(Number(panel.style.zIndex)).toBeLessThanOrEqual(UiStackLayers.floatingPanelCeiling);
  });

  it('reassigns sequential z-indices in focus order for registered panels', () => {
    const a = document.createElement('div');
    const b = document.createElement('div');
    const c = document.createElement('div');
    FloatingPanelStack.register(a);
    FloatingPanelStack.register(b);
    FloatingPanelStack.register(c);
    FloatingPanelStack.bringToFront(a);
    expect(Number(a.style.zIndex)).toBe(UiStackLayers.floatingPanelBase + 2);
    expect(Number(b.style.zIndex)).toBe(UiStackLayers.floatingPanelBase);
    expect(Number(c.style.zIndex)).toBe(UiStackLayers.floatingPanelBase + 1);
    expect(FloatingPanelStack.getRegisteredCount()).toBe(3);
  });

  it('reports whether an event target lies inside a registered window surface', () => {
    const backdrop = document.createElement('div');
    const child = document.createElement('button');
    backdrop.appendChild(child);
    document.body.appendChild(backdrop);
    FloatingPanelStack.register(backdrop, undefined, 'modal');
    expect(FloatingPanelStack.containsEventTarget(child)).toBe(true);
    expect(FloatingPanelStack.containsEventTarget(backdrop)).toBe(true);
    expect(FloatingPanelStack.containsEventTarget(document.body)).toBe(false);
    expect(FloatingPanelStack.containsEventTarget(null)).toBe(false);
    backdrop.remove();
  });

  it('reports open menu pointer-block surfaces without changing tool-panel stacking', () => {
    const menu = document.createElement('div');
    const item = document.createElement('button');
    menu.appendChild(item);
    document.body.appendChild(menu);
    FloatingPanelStack.registerPointerBlockSurface(menu);
    expect(FloatingPanelStack.getPointerBlockSurfaceCount()).toBe(1);
    expect(FloatingPanelStack.containsEventTarget(item)).toBe(true);
    expect(FloatingPanelStack.containsEventTarget(menu)).toBe(true);
    expect(menu.style.zIndex).toBe('');
    FloatingPanelStack.unregisterPointerBlockSurface(menu);
    expect(FloatingPanelStack.getPointerBlockSurfaceCount()).toBe(0);
    expect(FloatingPanelStack.containsEventTarget(item)).toBe(false);
    menu.remove();
  });
});

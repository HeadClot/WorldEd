import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FloatingPanelStack } from '@/ui/floating_panel/panel_floating_stack.js';

describe('FloatingPanelStack detached chrome pointer-block', () => {
  beforeEach(() => {
    FloatingPanelStack.resetForTests();
  });

  afterEach(() => {
    FloatingPanelStack.resetForTests();
  });

  it('recognizes pointer-block chrome created in a detached document', () => {
    const detachedDocument = document.implementation.createHTMLDocument('detached-viewport');
    const chrome = detachedDocument.createElement('div');
    const button = detachedDocument.createElement('button');
    chrome.appendChild(button);
    detachedDocument.body.appendChild(chrome);
    FloatingPanelStack.registerPointerBlockSurface(chrome);
    expect(FloatingPanelStack.containsEventTarget(button)).toBe(true);
    expect(FloatingPanelStack.containsEventTarget(chrome)).toBe(true);
    expect(FloatingPanelStack.containsEventTarget(document.createElement('div'))).toBe(false);
  });
});

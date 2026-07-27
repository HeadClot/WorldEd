import { describe, expect, it } from 'vitest';
import { Theme } from '../../src/theme.js';
import { applyViewportContentDrawableStyles } from '../../src/viewports/base_viewport.js';

/**
 * Content must sit under the pane title bar so multi-view scissor never draws
 * GL under chrome (and never bleeds into the separator above the bar).
 */
describe('applyViewportContentDrawableStyles', () => {
  it('should place content strictly below the viewport title bar height', () => {
    const content = document.createElement('div');
    applyViewportContentDrawableStyles(content);
    expect(content.style.top).toBe(`${Theme.viewportToolbarHeightPx}px`);
    expect(content.style.bottom).toBe('0px');
    expect(content.style.left).toBe('0px');
    expect(content.style.right).toBe('0px');
    expect(content.style.position).toBe('absolute');
    expect(content.style.top).not.toBe('0px');
  });
});

import { describe, it, expect } from 'vitest';
import { Theme } from '@/theme.js';
import {
  applyViewportToolOptionsIconButtonMetrics,
  applyViewportToolOptionsTextButtonMetrics,
} from '@/tools/chrome/options/viewport_tool_options_control_style.js';
import { ViewportToolModeDropdown } from '@/tools/chrome/options/viewport_tool_mode_dropdown.js';
import { ViewportToolOptionsBar } from '@/tools/chrome/options/viewport_tool_options_bar.js';
import { EditorInteractionMode } from '@/types/editor_interaction_mode.js';

describe('viewport tool options control sizing', () => {
  it('matches control height to viewport title toolbar icon buttons', () => {
    expect(Theme.viewportToolOptionsControlHeightPx).toBe(24);
  });

  it('sizes icon and text controls to the shared control height', () => {
    const icon = document.createElement('button');
    const text = document.createElement('button');
    applyViewportToolOptionsIconButtonMetrics(icon);
    applyViewportToolOptionsTextButtonMetrics(text);
    const height = `${Theme.viewportToolOptionsControlHeightPx}px`;
    expect(icon.style.height).toBe(height);
    expect(icon.style.width).toBe(height);
    expect(text.style.height).toBe(height);
    expect(text.style.minHeight).toBe(height);
    expect(text.style.maxHeight).toBe(height);
  });

  it('sizes the mode dropdown trigger to the shared control height', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const dropdown = new ViewportToolModeDropdown(host, () => undefined);
    const button = host.querySelector('button') as HTMLButtonElement;
    expect(button.style.height).toBe(`${Theme.viewportToolOptionsControlHeightPx}px`);
    dropdown.dispose();
    host.remove();
  });

  it('sizes the options bar to its controls instead of the full viewport width', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const bar = new ViewportToolOptionsBar(host, {
      onTransformMode: () => undefined,
      onFlipClipPlane: () => undefined,
      onCommitClip: () => undefined,
      onCommitSplit: () => undefined,
      onOpenUvEditor: () => undefined,
      onExtrudeFaces: () => undefined,
      onGridReset: () => undefined,
      onGridAlignToFace: () => undefined,
      onGridAlignAxis: () => undefined,
      onGridOriginVertex: () => undefined,
      onCameraReset: () => undefined,
      onCameraAlignToFace: () => undefined,
      onInteractionMode: (_mode: EditorInteractionMode) => undefined,
      onComponentMode: () => undefined,
    });
    const root = bar.getElement();
    expect(root.style.width).toBe('max-content');
    expect(root.style.right).toBe('auto');
    expect(root.style.height).toBe('auto');
    expect(root.style.left).toBe(`${Theme.viewportToolFloatingOffsetLeftPx}px`);
    bar.dispose();
    host.remove();
  });
});

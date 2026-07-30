import { describe, expect, it } from 'vitest';
import { applySharedWorkspaceCanvasLayout } from '@/viewports/shared/shared_webgl_surface.js';

describe('applySharedWorkspaceCanvasLayout', () => {
  it('should fill the host with 100% size so DOM panes and GL share one box', () => {
    const canvas = document.createElement('canvas');
    applySharedWorkspaceCanvasLayout(canvas);
    expect(canvas.style.position).toBe('absolute');
    expect(canvas.style.left).toBe('0px');
    expect(canvas.style.top).toBe('0px');
    expect(canvas.style.width).toBe('100%');
    expect(canvas.style.height).toBe('100%');
    expect(canvas.style.pointerEvents).toBe('none');
    expect(canvas.style.zIndex).toBe('0');
  });
});

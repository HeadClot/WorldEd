import { describe, expect, it, vi } from 'vitest';
import { AudioViewportFocus } from '@/audio/spatial/audio_viewport_focus.js';
import type { ViewportEditor } from '@/viewports/core/viewport_editor.js';
import { Viewport3D } from '@/viewports/core/viewport_3d.js';
import { Viewport2D } from '@/viewports/core/viewport_2d.js';

describe('AudioViewportFocus', () => {
  it('defaults to mono when no viewport was recorded', () => {
    const focus = new AudioViewportFocus();
    expect(focus.getSpatialMode()).toBe('mono');
    expect(focus.getCamera()).toBeNull();
  });

  it('uses spatial3d for perspective viewports and mono for orthographic', () => {
    const focus = new AudioViewportFocus();
    const perspective = { getCamera: vi.fn(), getContentElement: vi.fn() } as unknown as Viewport3D;
    Object.setPrototypeOf(perspective, Viewport3D.prototype);
    focus.record(perspective as unknown as ViewportEditor);
    expect(focus.getSpatialMode()).toBe('spatial3d');

    const orthographic = { getCamera: vi.fn(), getContentElement: vi.fn() } as unknown as Viewport2D;
    Object.setPrototypeOf(orthographic, Viewport2D.prototype);
    focus.record(orthographic as unknown as ViewportEditor);
    expect(focus.getSpatialMode()).toBe('mono');
  });

  it('records focus from a registered content element before tools run', () => {
    const focus = new AudioViewportFocus();
    const content = document.createElement('div');
    const perspective = {
      getCamera: vi.fn(),
      getContentElement: () => content,
    } as unknown as Viewport3D;
    Object.setPrototypeOf(perspective, Viewport3D.prototype);
    focus.registerViewports([perspective as unknown as ViewportEditor]);
    focus.recordFromContentElement(content);
    expect(focus.getSpatialMode()).toBe('spatial3d');
    expect(focus.getLastViewport()).toBe(perspective);
  });

  it('ignores unregistered content elements', () => {
    const focus = new AudioViewportFocus();
    focus.recordFromContentElement(document.createElement('div'));
    expect(focus.getLastViewport()).toBeNull();
  });

  it('keeps the last pointerdown/G focus until another record call', () => {
    const focus = new AudioViewportFocus();
    const content3d = document.createElement('div');
    const content2d = document.createElement('div');
    const perspective = {
      getCamera: vi.fn(),
      getContentElement: () => content3d,
    } as unknown as Viewport3D;
    Object.setPrototypeOf(perspective, Viewport3D.prototype);
    const orthographic = {
      getCamera: vi.fn(),
      getContentElement: () => content2d,
    } as unknown as Viewport2D;
    Object.setPrototypeOf(orthographic, Viewport2D.prototype);
    focus.registerViewports([perspective as unknown as ViewportEditor, orthographic as unknown as ViewportEditor]);
    focus.recordFromContentElement(content3d);
    expect(focus.getSpatialMode()).toBe('spatial3d');
    focus.recordFromContentElement(content2d);
    expect(focus.getSpatialMode()).toBe('mono');
  });
});

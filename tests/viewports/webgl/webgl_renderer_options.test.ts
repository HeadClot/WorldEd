import { describe, expect, it } from 'vitest';
import { getEditorWebGLRendererOptions } from '@/viewports/webgl/webgl_renderer_options.js';

describe('editor WebGL renderer options', () => {
  it('defaults to multisample antialiasing for overlay-style renderers', () => {
    expect(getEditorWebGLRendererOptions()).toEqual({
      alpha: false,
      antialias: true,
      failIfMajorPerformanceCaveat: false,
      powerPreference: 'default',
    });
  });

  it('preserves transparency for overlay renderers', () => {
    expect(getEditorWebGLRendererOptions(true).alpha).toBe(true);
    expect(getEditorWebGLRendererOptions(true).antialias).toBe(true);
  });

  it('allows explicit antialias overrides', () => {
    expect(getEditorWebGLRendererOptions({ alpha: false, antialias: true }).antialias).toBe(true);
    expect(getEditorWebGLRendererOptions({ alpha: false, antialias: false }).antialias).toBe(false);
  });
});

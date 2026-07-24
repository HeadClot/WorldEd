import { describe, expect, it } from 'vitest';
import {
  getEditorWebGLRendererOptions,
} from '../../src/viewports/webgl_renderer_options.js';

describe('editor WebGL renderer options', () => {
  it('enables multisample antialiasing for clean thick lines', () => {
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
});

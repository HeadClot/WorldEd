import { describe, expect, it } from 'vitest';
import {
  getEditorWebGLRendererOptions,
} from '../../src/viewports/webgl_renderer_options.js';

describe('editor WebGL renderer options', () => {
  it('uses conservative opaque desktop settings', () => {
    expect(getEditorWebGLRendererOptions()).toEqual({
      alpha: false,
      antialias: false,
      failIfMajorPerformanceCaveat: false,
      powerPreference: 'default',
    });
  });

  it('preserves transparency for overlay renderers', () => {
    expect(getEditorWebGLRendererOptions(true).alpha).toBe(true);
  });
});

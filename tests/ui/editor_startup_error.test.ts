import { describe, expect, it } from 'vitest';
import {
  getEditorStartupErrorMessage,
  showEditorStartupError
} from '../../src/ui/editor_startup_error.js';

describe('editor startup error', () => {
  it('should preserve an Error message for diagnostics', () => {
    expect(getEditorStartupErrorMessage(new Error('WebGL failed'))).toBe(
      'WebGL failed'
    );
  });

  it('should show a visible renderer failure overlay', () => {
    const container = document.createElement('div');

    showEditorStartupError(container, new Error('context unavailable'));

    const overlay = container.querySelector('[data-editor-startup-error="true"]');
    expect(overlay).not.toBeNull();
    expect(overlay?.textContent).toContain('3D renderer failed to start');
    expect(overlay?.textContent).toContain('context unavailable');
  });
});

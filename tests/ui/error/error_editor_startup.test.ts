import { describe, expect, it } from 'vitest';
import { getErrorEditorStartupMessage, showErrorEditorStartup } from '@/ui/error/error_editor_startup.js';

describe('error editor startup', () => {
  it('should preserve an Error message for diagnostics', () => {
    expect(getErrorEditorStartupMessage(new Error('WebGL failed'))).toBe('WebGL failed');
  });

  it('should show a visible renderer failure overlay', () => {
    const container = document.createElement('div');

    showErrorEditorStartup(container, new Error('context unavailable'));

    const overlay = container.querySelector('[data-error-editor-startup="true"]');
    expect(overlay).not.toBeNull();
    expect(overlay?.textContent).toContain('3D renderer failed to start');
    expect(overlay?.textContent).toContain('context unavailable');
  });
});

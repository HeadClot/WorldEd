import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APPLICATION_DISPLAY_NAME, buildDesktopWindowTitle } from '@/application_identity.js';

describe('desktop window title', () => {
  it('uses AI World Editor in the desktop shell HTML title without changing the web index title path', () => {
    const desktopHtml = readFileSync(resolve(process.cwd(), 'src/desktop/main_ui/index.html'), 'utf8');
    const webHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    expect(desktopHtml).toContain(`<title>${APPLICATION_DISPLAY_NAME}</title>`);
    expect(desktopHtml).toContain('href="./favicon.ico"');
    expect(webHtml).toContain(`<title>${APPLICATION_DISPLAY_NAME}</title>`);
    expect(webHtml).toContain('href="./favicon.ico"');
  });

  it('formats the native window title with an embedded version for standalone builds', () => {
    expect(buildDesktopWindowTitle('2.3.4')).toBe('AI World Editor 2.3.4');
  });
});

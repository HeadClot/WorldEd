import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Favicon files that Vite copies from public/ into the docs/ build output. */
const PUBLIC_FAVICON_FILES = [
  'favicon.ico',
  'favicon-16x16.png',
  'favicon-32x32.png',
  'apple-touch-icon.png',
  'android-chrome-192x192.png',
  'android-chrome-512x512.png',
  'site.webmanifest',
] as const;

/** Base macOS Electrobun iconset sizes (logical 1x names). */
const MAC_ICONSET_BASE_SIZES = ['16x16', '32x32', '128x128', '256x256', '512x512'] as const;

/**
 * Builds the macOS iconutil filename for a size, with optional retina suffix.
 *
 * @param size Logical pixel size token such as "16x16".
 * @param retina When true, appends the 2x retina marker used by iconutil.
 * @returns Filename under public/app_icon.iconset.
 */
function buildMacIconsetFileName(size: string, retina: boolean): string {
  const retinaSuffix = retina ? `${String.fromCharCode(64)}2x` : '';
  return `icon_${size}${retinaSuffix}.png`;
}

describe('favicon assets', () => {
  it('keeps favicon source files under public/ so Vite copies them into docs/', () => {
    PUBLIC_FAVICON_FILES.forEach((filename) => {
      expect(existsSync(resolve(process.cwd(), 'public', filename))).toBe(true);
    });
  });

  it('links relative favicons from the app index.html for GitHub Pages', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    expect(html).toContain('href="./favicon.ico"');
    expect(html).toContain('href="./favicon-32x32.png"');
    expect(html).toContain('href="./favicon-16x16.png"');
    expect(html).toContain('href="./apple-touch-icon.png"');
    expect(html).toContain('href="./site.webmanifest"');
  });

  it('uses relative icon paths in the web manifest (not site-root absolute /)', () => {
    const manifest = readFileSync(resolve(process.cwd(), 'public/site.webmanifest'), 'utf8');
    expect(manifest).toContain('./android-chrome-192x192.png');
    expect(manifest).toContain('./android-chrome-512x512.png');
    expect(manifest).not.toMatch(/"src"\s*:\s*"\//);
  });

  it('keeps a macOS iconset under public/ for Electrobun packaging', () => {
    MAC_ICONSET_BASE_SIZES.forEach((size) => {
      expect(existsSync(resolve(process.cwd(), 'public/app_icon.iconset', buildMacIconsetFileName(size, false)))).toBe(
        true,
      );
      expect(existsSync(resolve(process.cwd(), 'public/app_icon.iconset', buildMacIconsetFileName(size, true)))).toBe(
        true,
      );
    });
  });

  it('links relative favicons from the desktop shell HTML', () => {
    const html = readFileSync(resolve(process.cwd(), 'src/desktop/main_ui/index.html'), 'utf8');
    expect(html).toContain('href="./favicon.ico"');
    expect(html).toContain('href="./favicon-32x32.png"');
    expect(html).toContain('href="./favicon-16x16.png"');
    expect(html).toContain('href="./apple-touch-icon.png"');
  });
});

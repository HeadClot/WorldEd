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
});

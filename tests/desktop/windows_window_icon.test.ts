import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { encodeWideNullTerminated, resolvePackagedWindowsIconPath } from '@/desktop/windows_window_icon.js';

describe('Windows window title-bar icon', () => {
  it('resolves the packaged Resources app.ico next to the Electrobun bin folder', () => {
    const packageRoot = join(process.cwd(), '.vite', 'windows_window_icon_test');
    const binDirectory = join(packageRoot, 'bin');
    const resourcesDirectory = join(packageRoot, 'Resources');
    mkdirSync(binDirectory, { recursive: true });
    mkdirSync(resourcesDirectory, { recursive: true });
    writeFileSync(join(resourcesDirectory, 'app.ico'), 'icon');

    expect(resolvePackagedWindowsIconPath(binDirectory)).toBe(join(resourcesDirectory, 'app.ico'));
  });

  it('returns null when no packaged Windows icon is available', () => {
    const emptyRoot = join(process.cwd(), '.vite', 'windows_window_icon_missing');
    mkdirSync(emptyRoot, { recursive: true });
    expect(resolvePackagedWindowsIconPath(emptyRoot)).toBeNull();
  });

  it('encodes Win32 wide strings with a trailing null wchar', () => {
    const encoded = encodeWideNullTerminated('AI');
    expect(encoded.length).toBe(6);
    expect(encoded.readUInt16LE(0)).toBe('A'.charCodeAt(0));
    expect(encoded.readUInt16LE(2)).toBe('I'.charCodeAt(0));
    expect(encoded.readUInt16LE(4)).toBe(0);
  });

  it('applies the Windows window icon after the window is shown', () => {
    const bunEntry = readFileSync(resolve(process.cwd(), 'src/desktop/bun/index.ts'), 'utf8');
    expect(bunEntry).toContain('showMaximizedWhenReady(desktopWindow, () => applyWindowsWindowIcon(windowTitle))');
  });
});

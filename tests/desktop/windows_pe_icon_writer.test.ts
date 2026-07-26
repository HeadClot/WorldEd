import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  countPeIconImages,
  rewritePeIconResources,
  writeWindowsExecutableIcon,
} from '../../scripts/windows_pe_icon_writer.js';

/**
 * Copies Node Buffer/file bytes into a plain ArrayBuffer-backed Uint8Array.
 *
 * @param source Bytes read from disk.
 * @returns Fresh Uint8Array for PE helpers under strict typings.
 */
function toUint8Array(source: { readonly byteLength: number; readonly [index: number]: number }): Uint8Array {
  const copy = new Uint8Array(source.byteLength);
  for (let index = 0; index < source.byteLength; index++) {
    copy[index] = source[index] ?? 0;
  }
  return copy;
}

describe('Windows PE icon writer', () => {
  it('replaces Bun IDI_MYICON with the full multi-size application ICO', () => {
    const stockBunPath = join(process.cwd(), 'node_modules/electrobun/dist-win-x64/bun.exe');
    const iconPath = join(process.cwd(), 'public/app_icon.ico');
    if (!existsSync(stockBunPath)) return;
    const stockBytes = toUint8Array(readFileSync(stockBunPath));
    const iconBytes = toUint8Array(readFileSync(iconPath));
    expect(countPeIconImages(stockBytes)).toBe(1);
    const rewritten = rewritePeIconResources(stockBytes, iconBytes);
    expect(countPeIconImages(rewritten)).toBe(4);
  });

  it('writes a rewritten PE to disk for launcher-sized executables without icons', () => {
    const stockLauncherPath = join(process.cwd(), 'node_modules/electrobun/dist-win-x64/launcher.exe');
    const iconPath = join(process.cwd(), 'public/app_icon.ico');
    if (!existsSync(stockLauncherPath)) return;
    const outputDirectory = join(process.cwd(), '.vite', 'windows_pe_icon_writer_test');
    mkdirSync(outputDirectory, { recursive: true });
    const outputPath = join(outputDirectory, 'launcher.exe');
    copyFileSync(stockLauncherPath, outputPath);
    const sizeBefore = statSync(outputPath).size;
    writeWindowsExecutableIcon(outputPath, iconPath);
    expect(statSync(outputPath).size).toBeGreaterThan(sizeBefore + 100_000);
    expect(countPeIconImages(toUint8Array(readFileSync(outputPath)))).toBe(4);
  });
});

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];

afterEach(() => {
  temporaryDirectories.forEach((directory) => rmSync(directory, { recursive: true, force: true }));
});

describe('compose_release_notes script', () => {
  it('writes platform download sections with direct GitHub asset links', () => {
    const root = createTempWorkspace();
    const assetsDir = join(root, 'release_assets');
    const outputPath = join(root, 'body.md');
    mkdirSync(assetsDir, { recursive: true });
    writeFileSync(join(assetsDir, 'AiWorldEd-1.24.0-Win-x64-Setup.zip'), 'win-setup');
    writeFileSync(join(assetsDir, 'stable-win-x64-AiWorldEd.tar.zst'), 'win-portable');
    writeFileSync(join(assetsDir, 'stable-win-x64-update.json'), '{}');
    writeFileSync(join(assetsDir, 'AiWorldEd-1.24.0-Linux-x64-Setup.tar.gz'), 'linux-setup');
    writeFileSync(join(assetsDir, 'stable-linux-x64-AiWorldEd.tar.zst'), 'linux-portable');
    writeFileSync(join(assetsDir, 'stable-linux-x64-update.json'), '{}');
    writeFileSync(join(assetsDir, 'stable-macos-arm64-AiWorldEd.app.tar.zst'), 'mac-portable');
    writeFileSync(join(assetsDir, 'stable-macos-arm64-update.json'), '{}');

    const result = spawnSync(
      'bun',
      [
        'scripts/compose_release_notes.ts',
        '--version',
        '1.24.0',
        '--assets',
        assetsDir,
        '--sha',
        'deadbeef',
        '--out',
        outputPath,
      ],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    expect(result.status, result.stderr || result.stdout).toBe(0);
    const body = readFileSync(outputPath, 'utf8');
    expect(body).toContain('AI World Editor v1.24.0');
    expect(body).toContain('deadbeef');
    expect(body).toContain('## Windows');
    expect(body).toContain('## Linux');
    expect(body).toContain('## macOS');
    expect(body).toContain(
      '[Download Setup](https://github.com/Henry00IS/AiWorldEd/releases/download/v1.24.0/AiWorldEd-1.24.0-Win-x64-Setup.zip)',
    );
    expect(body).toContain(
      '[Download Portable](https://github.com/Henry00IS/AiWorldEd/releases/download/v1.24.0/stable-win-x64-AiWorldEd.tar.zst)',
    );
    expect(body).toContain(
      '[Download Setup](https://github.com/Henry00IS/AiWorldEd/releases/download/v1.24.0/AiWorldEd-1.24.0-Linux-x64-Setup.tar.gz)',
    );
    expect(body).toContain(
      '[Download Portable](https://github.com/Henry00IS/AiWorldEd/releases/download/v1.24.0/stable-macos-arm64-AiWorldEd.app.tar.zst)',
    );
    expect(body).not.toContain('Keep the `stable-*`');
    expect(body).not.toContain('update.json');
  });
});

/**
 * Creates an isolated temp directory cleaned up after the test.
 *
 * @returns Absolute temporary workspace path.
 */
function createTempWorkspace(): string {
  const directory = mkdtempSync(join(tmpdir(), 'aiworlded-notes-'));
  temporaryDirectories.push(directory);
  return directory;
}

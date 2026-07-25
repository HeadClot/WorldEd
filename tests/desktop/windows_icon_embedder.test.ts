import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { WindowsIconEmbedder, type WindowsIconRunner } from '../../scripts/windows_icon_embedder.js';

describe('WindowsIconEmbedder', () => {
  it('embeds the application icon into generated application and installer executables', () => {
    const projectRoot = join(process.cwd(), '.vite', 'windows_icon_embedder_test');
    const buildRoot = join(projectRoot, 'build');
    const artifactRoot = join(projectRoot, 'artifacts');
    const binaryRoot = join(buildRoot, 'AiWorldEd', 'bin');
    mkdirSync(binaryRoot, { recursive: true });
    mkdirSync(artifactRoot, { recursive: true });
    ['launcher.exe', 'bun.exe'].forEach((name) => writeFileSync(join(binaryRoot, name), name));
    writeFileSync(join(buildRoot, 'AiWorldEd-Setup.exe'), 'temporary installer');
    writeFileSync(join(artifactRoot, 'AiWorldEd-Setup.exe'), 'installer');
    writeFileSync(join(artifactRoot, 'release.json'), '{}');
    const runner = vi.fn<WindowsIconRunner>();
    const embedder = new WindowsIconEmbedder(
      projectRoot,
      {
        ELECTROBUN_APP_NAME: 'AiWorldEd',
        ELECTROBUN_ARTIFACT_DIR: artifactRoot,
        ELECTROBUN_BUILD_DIR: buildRoot,
        ELECTROBUN_OS: 'win',
      },
      runner,
    );

    const embeddedPaths = embedder.embed();

    expect(embeddedPaths).toHaveLength(4);
    expect(runner).toHaveBeenCalledTimes(4);
    embeddedPaths.forEach((path) => {
      expect(runner).toHaveBeenCalledWith(
        join(projectRoot, 'node_modules/rcedit/bin/rcedit-x64.exe'),
        path,
        join(projectRoot, 'public/app_icon.ico'),
      );
    });
  });

  it('does not edit executables for another target operating system', () => {
    const runner = vi.fn<WindowsIconRunner>();
    const embedder = new WindowsIconEmbedder(process.cwd(), { ELECTROBUN_OS: 'linux' }, runner);

    expect(embedder.embed()).toEqual([]);
    expect(runner).not.toHaveBeenCalled();
  });
});

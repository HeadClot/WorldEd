import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  findMatchingSetupExecutable,
  isWindowsSetupZipFileName,
  WindowsIconEmbedder,
  type WindowsIconRunner,
  type WindowsSetupZipRebuilder,
} from '../../scripts/windows_icon_embedder.js';

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
    const zipRebuilder = vi.fn<WindowsSetupZipRebuilder>();
    const embedder = new WindowsIconEmbedder(
      projectRoot,
      {
        ELECTROBUN_APP_NAME: 'AiWorldEd',
        ELECTROBUN_ARTIFACT_DIR: artifactRoot,
        ELECTROBUN_BUILD_DIR: buildRoot,
        ELECTROBUN_OS: 'win',
      },
      runner,
      zipRebuilder,
    );

    const embeddedPaths = embedder.embed();

    expect(embeddedPaths).toHaveLength(4);
    expect(runner).toHaveBeenCalledTimes(4);
    expect(zipRebuilder).not.toHaveBeenCalled();
    embeddedPaths.forEach((path) => {
      expect(runner).toHaveBeenCalledWith(expect.any(String), path, join(projectRoot, 'public/app_icon.ico'));
    });
  });

  it('rebuilds Setup zips so GitHub Actions release assets keep the iconed installer', () => {
    const projectRoot = join(process.cwd(), '.vite', 'windows_icon_embedder_zip_test');
    const buildRoot = join(projectRoot, 'build');
    const artifactRoot = join(projectRoot, 'artifacts');
    const binaryRoot = join(buildRoot, 'AiWorldEd', 'bin');
    mkdirSync(binaryRoot, { recursive: true });
    mkdirSync(artifactRoot, { recursive: true });
    writeFileSync(join(binaryRoot, 'launcher.exe'), 'launcher');
    writeFileSync(join(binaryRoot, 'bun.exe'), 'bun');
    writeFileSync(join(buildRoot, 'AiWorldEd-Setup.exe'), 'setup');
    writeFileSync(join(buildRoot, 'AiWorldEd-Setup.metadata.json'), '{}');
    writeFileSync(join(buildRoot, 'AiWorldEd-Setup.tar.zst'), 'archive');
    writeFileSync(join(artifactRoot, 'stable-win-x64-AiWorldEd-Setup.zip'), 'old-zip');
    const runner = vi.fn<WindowsIconRunner>();
    const zipRebuilder = vi.fn<WindowsSetupZipRebuilder>();
    const embedder = new WindowsIconEmbedder(
      projectRoot,
      {
        ELECTROBUN_APP_NAME: 'AiWorldEd',
        ELECTROBUN_ARTIFACT_DIR: artifactRoot,
        ELECTROBUN_BUILD_DIR: buildRoot,
        ELECTROBUN_OS: 'win',
      },
      runner,
      zipRebuilder,
    );

    const embeddedPaths = embedder.embed();

    expect(runner).toHaveBeenCalledTimes(3);
    expect(zipRebuilder).toHaveBeenCalledTimes(1);
    expect(zipRebuilder).toHaveBeenCalledWith({
      zipPath: join(artifactRoot, 'stable-win-x64-AiWorldEd-Setup.zip'),
      setupExecutablePath: join(buildRoot, 'AiWorldEd-Setup.exe'),
      metadataPath: join(buildRoot, 'AiWorldEd-Setup.metadata.json'),
      archivePath: join(buildRoot, 'AiWorldEd-Setup.tar.zst'),
      stagingDirectoryPath: join(buildRoot, '.icon-setup-zip-AiWorldEd-Setup'),
    });
    expect(embeddedPaths).toContain(join(artifactRoot, 'stable-win-x64-AiWorldEd-Setup.zip'));
  });

  it('does not edit executables for another target operating system', () => {
    const runner = vi.fn<WindowsIconRunner>();
    const embedder = new WindowsIconEmbedder(process.cwd(), { ELECTROBUN_OS: 'linux' }, runner);

    expect(embedder.embed()).toEqual([]);
    expect(runner).not.toHaveBeenCalled();
  });

  it('recognizes Windows Setup zip names used by Electrobun CI artifacts', () => {
    expect(isWindowsSetupZipFileName('stable-win-x64-AiWorldEd-Setup.zip')).toBe(true);
    expect(isWindowsSetupZipFileName('stable-win-x64-AiWorldEd.tar.zst')).toBe(false);
  });

  it('selects the iconed Setup executable from the build directory', () => {
    const buildRoot = join(process.cwd(), '.vite', 'windows_icon_setup_match');
    const setupPath = join(buildRoot, 'AiWorldEd-Setup.exe');
    expect(findMatchingSetupExecutable(buildRoot, [join(buildRoot, 'other.exe'), setupPath])).toBe(setupPath);
    expect(findMatchingSetupExecutable(buildRoot, [join(buildRoot, 'other.exe')])).toBeNull();
  });
});

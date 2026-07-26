import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

/** Environment values supplied to Electrobun lifecycle scripts. */
export interface WindowsIconBuildEnvironment {
  ELECTROBUN_APP_NAME?: string;
  ELECTROBUN_ARTIFACT_DIR?: string;
  ELECTROBUN_BUILD_DIR?: string;
  ELECTROBUN_OS?: string;
}

/** Executes rcedit with an executable and icon path. */
export type WindowsIconRunner = (editorPath: string, executablePath: string, iconPath: string) => void;

/** Rebuilds a Windows Setup zip after its payload executable was re-iconed. */
export type WindowsSetupZipRebuilder = (request: WindowsSetupZipRebuildRequest) => void;

/** Inputs required to rewrite a Setup installer zip for GitHub release assets. */
export interface WindowsSetupZipRebuildRequest {
  zipPath: string;
  setupExecutablePath: string;
  metadataPath: string;
  archivePath: string;
  stagingDirectoryPath: string;
}

/** Applies the checked-in Windows icon to Electrobun outputs. */
export class WindowsIconEmbedder {
  /**
   * Creates an icon embedder.
   *
   * @param projectRoot Absolute project root.
   * @param environment Electrobun lifecycle environment.
   * @param runner Function that invokes rcedit.
   * @param zipRebuilder Optional Setup zip rewriter used after packaging.
   */
  constructor(
    private readonly projectRoot: string,
    private readonly environment: WindowsIconBuildEnvironment,
    private readonly runner: WindowsIconRunner,
    private readonly zipRebuilder: WindowsSetupZipRebuilder = rebuildWindowsSetupZipWithPowerShell,
  ) {}

  /**
   * Embeds the icon into every Windows executable currently produced by the
   * build, then refreshes Setup zips shipped by CI.
   */
  embed(): string[] {
    if (this.environment.ELECTROBUN_OS !== 'win') return [];
    const executablePaths = this.findExecutablePaths();
    executablePaths.forEach((path) => this.runner(this.editorPath(), path, this.iconPath()));
    const refreshedZipPaths = this.refreshSetupZipArchives(executablePaths);
    return [...executablePaths, ...refreshedZipPaths];
  }

  /** Returns existing application and installer executable paths. */
  findExecutablePaths(): string[] {
    return [...this.findApplicationPaths(), ...this.findBuildRootPaths(), ...this.findArtifactPaths()];
  }

  /** Returns existing launcher and runtime executable paths. */
  private findApplicationPaths(): string[] {
    const appRoot = join(this.required('ELECTROBUN_BUILD_DIR'), this.required('ELECTROBUN_APP_NAME'), 'bin');
    return ['launcher.exe', 'bun.exe'].map((name) => join(appRoot, name)).filter(existsSync);
  }

  /** Returns installer executables temporarily stored in the build root. */
  private findBuildRootPaths(): string[] {
    return this.findExecutables(this.required('ELECTROBUN_BUILD_DIR'));
  }

  /** Returns Windows executables in the artifact directory. */
  private findArtifactPaths(): string[] {
    return this.findExecutables(this.required('ELECTROBUN_ARTIFACT_DIR'));
  }

  /**
   * Rebuilds Setup zips in the artifact folder after their .exe payloads are
   * iconed.
   *
   * Electrobun zips the installer before postPackage runs. GitHub Actions
   * publishes that zip, so PE icons applied only to the leftover build-folder
   * .exe would never reach release assets without this rewrite step.
   *
   * @param iconedExecutablePaths Absolute paths that already received the icon.
   * @returns Absolute zip paths that were rewritten.
   */
  private refreshSetupZipArchives(iconedExecutablePaths: string[]): string[] {
    const artifactDirectory = this.required('ELECTROBUN_ARTIFACT_DIR');
    const buildDirectory = this.required('ELECTROBUN_BUILD_DIR');
    if (!existsSync(artifactDirectory)) return [];
    return readdirSync(artifactDirectory)
      .filter((name) => isWindowsSetupZipFileName(name))
      .map((name) => this.tryRefreshOneSetupZip(join(artifactDirectory, name), buildDirectory, iconedExecutablePaths))
      .filter((path): path is string => path !== null);
  }

  /**
   * Rebuilds one Setup zip when matching build-folder payload files exist.
   *
   * @param zipPath Absolute artifact zip path.
   * @param buildDirectory Absolute Electrobun build directory.
   * @param iconedExecutablePaths Absolute paths that already received the icon.
   * @returns Zip path when rewritten, otherwise null.
   */
  private tryRefreshOneSetupZip(
    zipPath: string,
    buildDirectory: string,
    iconedExecutablePaths: string[],
  ): string | null {
    const setupExecutablePath = findMatchingSetupExecutable(buildDirectory, iconedExecutablePaths);
    if (!setupExecutablePath) return null;
    const setupStem = basename(setupExecutablePath, '.exe');
    const metadataPath = join(buildDirectory, `${setupStem}.metadata.json`);
    const archivePath = join(buildDirectory, `${setupStem}.tar.zst`);
    if (!existsSync(metadataPath) || !existsSync(archivePath)) return null;
    const stagingDirectoryPath = join(buildDirectory, `.icon-setup-zip-${setupStem}`);
    this.zipRebuilder({ zipPath, setupExecutablePath, metadataPath, archivePath, stagingDirectoryPath });
    return zipPath;
  }

  /**
   * Returns executable files directly inside a directory.
   *
   * @param directoryPath Directory to inspect.
   * @returns Absolute executable paths.
   */
  private findExecutables(directoryPath: string): string[] {
    if (!existsSync(directoryPath)) return [];
    return readdirSync(directoryPath)
      .filter((name) => extname(name).toLowerCase() === '.exe')
      .map((name) => join(directoryPath, name));
  }

  /** Returns the installed rcedit executable path. */
  private editorPath(): string {
    return resolve(this.projectRoot, 'node_modules/rcedit/bin/rcedit-x64.exe');
  }

  /** Returns the Windows application icon path. */
  private iconPath(): string {
    return resolve(this.projectRoot, 'public/app_icon.ico');
  }

  /**
   * Reads a required Electrobun environment value.
   *
   * @param name Environment property name.
   * @returns Configured absolute or relative path value.
   */
  private required(name: keyof WindowsIconBuildEnvironment): string {
    const value = this.environment[name];
    if (!value) throw new Error(`Missing Electrobun environment value: ${name}`);
    return value;
  }
}

/**
 * Returns true when a file name looks like a Windows Setup release zip.
 *
 * @param fileName File name only, not a path.
 */
export function isWindowsSetupZipFileName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith('.zip') && lower.includes('setup');
}

/**
 * Picks the iconed Setup executable that should be re-packed into release zips.
 *
 * @param buildDirectory Absolute Electrobun build directory.
 * @param iconedExecutablePaths Absolute paths that already received the icon.
 * @returns Matching Setup executable path, or null.
 */
export function findMatchingSetupExecutable(buildDirectory: string, iconedExecutablePaths: string[]): string | null {
  const normalizedBuildDirectory = resolve(buildDirectory).toLowerCase();
  const matches = iconedExecutablePaths.filter((executablePath) => {
    const lowerPath = resolve(executablePath).toLowerCase();
    return lowerPath.startsWith(normalizedBuildDirectory) && lowerPath.endsWith('-setup.exe');
  });
  return matches[0] ?? null;
}

/**
 * Rebuilds a Windows Setup zip with PowerShell so CI release assets carry the
 * icon.
 *
 * @param request Setup payload paths and destination zip.
 */
export function rebuildWindowsSetupZipWithPowerShell(request: WindowsSetupZipRebuildRequest): void {
  const installerDirectoryPath = join(request.stagingDirectoryPath, '.installer');
  resetDirectory(request.stagingDirectoryPath);
  mkdirSync(installerDirectoryPath, { recursive: true });
  copyFileSync(request.setupExecutablePath, join(request.stagingDirectoryPath, basename(request.setupExecutablePath)));
  copyFileSync(request.metadataPath, join(installerDirectoryPath, basename(request.metadataPath)));
  copyFileSync(request.archivePath, join(installerDirectoryPath, basename(request.archivePath)));
  compressDirectoryToZip(request.stagingDirectoryPath, request.zipPath);
  rmSync(request.stagingDirectoryPath, { recursive: true, force: true });
}

/**
 * Clears and recreates a directory used for temporary zip staging.
 *
 * @param directoryPath Absolute directory path.
 */
function resetDirectory(directoryPath: string): void {
  if (existsSync(directoryPath)) rmSync(directoryPath, { recursive: true, force: true });
  mkdirSync(directoryPath, { recursive: true });
}

/**
 * Compresses the contents of a directory into a zip archive via PowerShell.
 *
 * @param sourceDirectoryPath Directory whose children become zip root entries.
 * @param zipPath Destination zip path.
 */
function compressDirectoryToZip(sourceDirectoryPath: string, zipPath: string): void {
  if (existsSync(zipPath)) rmSync(zipPath, { force: true });
  const command = `Compress-Archive -Path '${sourceDirectoryPath}\\*' -DestinationPath '${zipPath}' -Force`;
  const result = spawnSync('powershell', ['-NoProfile', '-Command', command], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Failed to rebuild Windows Setup zip at ${zipPath} (exit ${result.status})`);
  }
}

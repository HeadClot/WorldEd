import { existsSync, readdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

/** Environment values supplied to Electrobun lifecycle scripts. */
export interface WindowsIconBuildEnvironment {
  ELECTROBUN_APP_NAME?: string;
  ELECTROBUN_ARTIFACT_DIR?: string;
  ELECTROBUN_BUILD_DIR?: string;
  ELECTROBUN_OS?: string;
}

/** Executes rcedit with an executable and icon path. */
export type WindowsIconRunner = (editorPath: string, executablePath: string, iconPath: string) => void;

/** Applies the checked-in Windows icon to Electrobun outputs. */
export class WindowsIconEmbedder {
  /**
   * Creates an icon embedder.
   *
   * @param projectRoot Absolute project root.
   * @param environment Electrobun lifecycle environment.
   * @param runner Function that invokes rcedit.
   */
  constructor(
    private readonly projectRoot: string,
    private readonly environment: WindowsIconBuildEnvironment,
    private readonly runner: WindowsIconRunner,
  ) {}

  /**
   * Embeds the icon into every Windows executable currently produced by the
   * build.
   */
  embed(): string[] {
    if (this.environment.ELECTROBUN_OS !== 'win') return [];
    const paths = this.findExecutablePaths();
    paths.forEach((path) => this.runner(this.editorPath(), path, this.iconPath()));
    return paths;
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

  /** Returns the checked-in rcedit executable path. */
  private editorPath(): string {
    return resolve(this.projectRoot, 'tools/rcedit-x64.exe');
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

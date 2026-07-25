import packageMetadata from '../package.json';

/** Display name shown in the desktop window chrome and release messaging. */
export const APPLICATION_DISPLAY_NAME = 'AI World Editor';

/** Version string embedded in package.json and desktop release builds. */
export const APPLICATION_VERSION = packageMetadata.version;

/**
 * Builds the desktop-only window title including the installed version.
 *
 * @param version Installed application version from package.json or Electrobun.
 * @returns Title such as "AI World Editor 1.0.42".
 */
export function buildDesktopWindowTitle(version: string = APPLICATION_VERSION): string {
  const normalizedVersion = version.trim().length > 0 ? version.trim() : APPLICATION_VERSION;
  return `${APPLICATION_DISPLAY_NAME} ${normalizedVersion}`;
}

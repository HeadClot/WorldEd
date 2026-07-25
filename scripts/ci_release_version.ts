/**
 * Resolves the CI release version from package.json major.minor and
 * GITHUB_RUN_NUMBER.
 *
 * Usage: bun scripts/ci_release_version.ts # print version bun
 * scripts/ci_release_version.ts --write # write package.json then print.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const packageJsonPath = resolve(process.cwd(), 'package.json');
const shouldWrite = process.argv.includes('--write');

/**
 * Reads major and minor version components from package.json.
 *
 * @returns Tuple of major and minor version strings.
 */
function readBaseVersionParts(): [string, string] {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version: string };
  const parts = packageJson.version.split('.');
  const major = parts[0] || '1';
  const minor = parts[1] || '0';
  return [major, minor];
}

/**
 * Builds the CI version string using the workflow run number as the patch.
 *
 * @returns Semver string such as "1.0.42".
 */
function resolveCiReleaseVersion(): string {
  const runNumber = process.env.GITHUB_RUN_NUMBER?.trim();
  if (!runNumber || !/^\d+$/.test(runNumber)) {
    throw new Error('GITHUB_RUN_NUMBER must be set to a positive integer for release versioning.');
  }
  const [major, minor] = readBaseVersionParts();
  return `${major}.${minor}.${runNumber}`;
}

/**
 * Writes the resolved version into package.json so Electrobun and the app embed
 * it.
 *
 * @param version Version string to persist.
 */
function writePackageVersion(version: string): void {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as Record<string, unknown>;
  packageJson.version = version;
  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
}

const version = resolveCiReleaseVersion();
if (shouldWrite) writePackageVersion(version);
process.stdout.write(`${version}\n`);

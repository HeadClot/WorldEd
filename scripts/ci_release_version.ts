/**
 * Resolves the CI release version as 1.<run_number>.0 from GITHUB_RUN_NUMBER.
 *
 * Usage: bun scripts/ci_release_version.ts # print version bun
 * scripts/ci_release_version.ts --write # write package.json then print.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const packageJsonPath = resolve(process.cwd(), 'package.json');
const shouldWrite = process.argv.includes('--write');

/**
 * Reads the major version component from package.json.
 *
 * @returns Major version string such as "1".
 */
function readMajorVersion(): string {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version: string };
  const major = packageJson.version.split('.')[0];
  return major && /^\d+$/.test(major) ? major : '1';
}

/**
 * Builds the CI version string using the workflow run number as the minor.
 *
 * @returns Semver string such as "1.24.0".
 */
function resolveCiReleaseVersion(): string {
  const runNumber = process.env.GITHUB_RUN_NUMBER?.trim();
  if (!runNumber || !/^\d+$/.test(runNumber)) {
    throw new Error('GITHUB_RUN_NUMBER must be set to a positive integer for release versioning.');
  }
  return `${readMajorVersion()}.${runNumber}.0`;
}

/**
 * Writes the resolved version into package.json so web and desktop builds embed
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

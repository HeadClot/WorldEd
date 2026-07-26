import { readFileSync, writeFileSync } from 'node:fs';
import { NtExecutable, NtExecutableResource, type Type } from 'pe-library';
import { Data as ResEditData, Resource as ResEditResource } from 'resedit';

/** English (United States) language id used by most Windows app resources. */
const LANGUAGE_EN_US = 1033;

/**
 * Binary input accepted from Node buffers and typed arrays.
 *
 * Uses an indexable byte view instead of `ArrayBufferView` so Node's `Buffer`
 * (typed as `Uint8Array<ArrayBufferLike>` under strict DOM libs) is accepted
 * without unsafe casts.
 */
type BinaryInput =
  | ArrayBuffer
  | {
      readonly byteLength: number;
      readonly [index: number]: number | undefined;
    };

/** Icon images accepted by resedit's resource rewriter. */
type ResEditIconImage = ResEditData.IconItem | ResEditData.RawIconItem;

/**
 * Embeds a multi-size `.ico` into a Windows PE executable using a pure-JS
 * resource editor.
 *
 * Electrobun's bundled `rcedit` resolve path is broken in packaged CLI builds,
 * and even a working `rcedit` does not reliably replace Bun's named
 * `IDI_MYICON` group. `resedit` rewrites that group in place so portable and
 * installed `bun.exe` show the app icon (and tray/taskbar stop using the Bun
 * smiley).
 *
 * @param executablePath Absolute path to the target `.exe`.
 * @param iconPath Absolute path to the multi-size `.ico` source.
 */
export function writeWindowsExecutableIcon(executablePath: string, iconPath: string): void {
  const executableBytes = copyToUint8Array(readFileSync(executablePath));
  const iconBytes = copyToUint8Array(readFileSync(iconPath));
  const rewrittenBytes = rewritePeIconResources(executableBytes, iconBytes);
  writeFileSync(executablePath, rewrittenBytes);
}

/**
 * Rewrites application icon resources inside a PE binary buffer.
 *
 * @param executableBytes Full PE file bytes.
 * @param iconBytes Full `.ico` file bytes.
 * @returns New PE file bytes with the application icon replaced.
 */
export function rewritePeIconResources(executableBytes: BinaryInput, iconBytes: BinaryInput): Uint8Array {
  const executableView = copyToUint8Array(executableBytes);
  const iconView = copyToUint8Array(iconBytes);
  const executable = NtExecutable.from(executableView, { ignoreCert: true });
  const resources = NtExecutableResource.from(executable);
  const iconItems = loadIconItems(iconView);
  replaceAllIconGroups(resources.entries, iconItems);
  resources.outputResource(executable);
  return new Uint8Array(executable.generate());
}

/**
 * Parses ICO bytes into resedit icon image instances.
 *
 * @param iconBytes Full `.ico` file bytes.
 * @returns Icon images required by replaceIconsForResource.
 */
function loadIconItems(iconBytes: Uint8Array): ResEditIconImage[] {
  const iconFile = ResEditData.IconFile.from(iconBytes);
  const iconItems = iconFile.icons.map((iconEntry) => iconEntry.data);
  if (iconItems.length === 0) throw new Error('Windows ICO contained no icon images');
  return iconItems;
}

/**
 * Replaces every existing icon group, or creates group 1 when none exist.
 *
 * Bun ships a named `IDI_MYICON` group; launcher/Setup may use numeric ids or
 * have no icons yet. Replacing by discovered ids keeps Windows pointing at the
 * primary group instead of leaving a stock Bun smiley as the first group.
 *
 * @param resourceEntries Mutable PE resource entries.
 * @param iconItems Parsed ICO images.
 */
function replaceAllIconGroups(resourceEntries: Type.ResourceEntry[], iconItems: ResEditIconImage[]): void {
  const existingGroups = ResEditResource.IconGroupEntry.fromEntries(resourceEntries);
  if (existingGroups.length === 0) {
    ResEditResource.IconGroupEntry.replaceIconsForResource(resourceEntries, 1, LANGUAGE_EN_US, iconItems);
    return;
  }
  existingGroups.forEach((group) => {
    ResEditResource.IconGroupEntry.replaceIconsForResource(resourceEntries, group.id, group.lang, iconItems);
  });
}

/**
 * Counts icon images present in PE icon groups after a rewrite.
 *
 * @param executableBytes PE bytes to inspect.
 * @returns Total icon images across all RT_GROUP_ICON entries.
 */
export function countPeIconImages(executableBytes: BinaryInput): number {
  const executableView = copyToUint8Array(executableBytes);
  const executable = NtExecutable.from(executableView, { ignoreCert: true });
  const resources = NtExecutableResource.from(executable);
  return ResEditResource.IconGroupEntry.fromEntries(resources.entries).reduce(
    (total, group) => total + group.icons.length,
    0,
  );
}

/**
 * Copies binary input into a Uint8Array backed by a plain ArrayBuffer.
 *
 * Node's `Buffer` can expose `SharedArrayBuffer`, which fails under strict PE
 * library typings. A copy guarantees a regular `ArrayBuffer` view.
 *
 * @param source File bytes or typed array view.
 * @returns Fresh Uint8Array copy.
 */
function copyToUint8Array(source: BinaryInput): Uint8Array {
  if (source instanceof ArrayBuffer) {
    return new Uint8Array(source.slice(0));
  }
  const length = source.byteLength;
  const copy = new Uint8Array(length);
  for (let index = 0; index < length; index++) {
    const value = source[index];
    copy[index] = value === undefined ? 0 : value;
  }
  return copy;
}

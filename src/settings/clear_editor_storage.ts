/**
 * Prefix used by all editor-owned localStorage keys (settings, workspaces, game
 * profiles, coordinate presets, and related data).
 */
export const EDITOR_STORAGE_KEY_PREFIX = 'aiworlded.';

/**
 * Removes every editor-owned key from a storage backend. Does not write default
 * values — callers should reload so the app rehydrates from code defaults.
 *
 * @param storage Storage backend (defaults to window.localStorage).
 * @returns Number of keys removed.
 */
export function clearEditorLocalStorage(storage: Storage = window.localStorage): number {
  const keysToRemove: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && key.startsWith(EDITOR_STORAGE_KEY_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    storage.removeItem(key);
  }
  return keysToRemove.length;
}

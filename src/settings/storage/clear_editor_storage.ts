/**
 * Prefix used by all editor-owned localStorage keys (settings, workspaces, game
 * profiles, coordinate presets, and related data).
 */
export const EDITOR_STORAGE_KEY_PREFIX = 'aiworlded.';

/**
 * When true, editor persistence must not write. Factory reset sets this before
 * clearing storage and reloading so pagehide/beforeunload cannot resurrect
 * workspaces or settings from the dying page.
 */
let editorStorageWritesSuppressed = false;

/**
 * Blocks all editor-owned storage writes until the page reloads (or tests call
 * {@link allowEditorStorageWritesForTests}).
 */
export function suppressEditorStorageWrites(): void {
  editorStorageWritesSuppressed = true;
}

/**
 * Returns whether editor storage writes are currently blocked.
 *
 * @returns True when factory reset (or an equivalent wipe) is in progress.
 */
export function areEditorStorageWritesSuppressed(): boolean {
  return editorStorageWritesSuppressed;
}

/**
 * Re-enables storage writes. Production factory reset reloads instead; tests
 * use this to restore isolation between cases.
 */
export function allowEditorStorageWritesForTests(): void {
  editorStorageWritesSuppressed = false;
}

/**
 * Removes every editor-owned key from a storage backend. Does not write default
 * values — callers should reload so the app rehydrates from code defaults.
 *
 * @param storage Storage backend (defaults to window.localStorage).
 * @returns Number of keys removed.
 */
export function clearEditorLocalStorage(storage: Storage = window.localStorage): number {
  return clearEditorOwnedKeys(storage);
}

/**
 * Removes every key that starts with {@link EDITOR_STORAGE_KEY_PREFIX}.
 *
 * @param storage Storage backend to wipe.
 * @returns Number of keys removed.
 */
export function clearEditorOwnedKeys(storage: Storage): number {
  const keysToRemove = collectEditorOwnedKeys(storage);
  for (const key of keysToRemove) {
    storage.removeItem(key);
  }
  return keysToRemove.length;
}

/**
 * Lists editor-owned keys present in a storage backend.
 *
 * @param storage Storage to scan.
 * @returns Matching keys in storage order.
 */
function collectEditorOwnedKeys(storage: Storage): string[] {
  const keysToRemove: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && key.startsWith(EDITOR_STORAGE_KEY_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  return keysToRemove;
}

/**
 * Factory-resets every editor-owned key in local and session storage, and
 * blocks any further writes so unload hooks cannot resurrect state.
 *
 * @param options Optional storage backends (defaults to browser storages).
 * @returns Total number of keys removed across all backends.
 */
export function performEditorFactoryReset(options?: {
  localStorage?: Storage;
  sessionStorage?: Storage | null;
}): number {
  suppressEditorStorageWrites();
  const local = resolveFactoryResetLocalStorage(options);
  const session = resolveFactoryResetSessionStorage(options);
  return clearOptionalStorage(local) + clearOptionalStorage(session);
}

/**
 * Resolves the local storage backend for a factory reset.
 *
 * @param options Optional explicit backends.
 * @returns Storage instance or null when unavailable.
 */
function resolveFactoryResetLocalStorage(options?: { localStorage?: Storage }): Storage | null {
  if (options?.localStorage) return options.localStorage;
  if (typeof window === 'undefined' || !window.localStorage) return null;
  return window.localStorage;
}

/**
 * Resolves the session storage backend for a factory reset.
 *
 * @param options Optional explicit backends.
 * @returns Storage instance or null when unavailable or explicitly disabled.
 */
function resolveFactoryResetSessionStorage(options?: { sessionStorage?: Storage | null }): Storage | null {
  if (options && 'sessionStorage' in options) return options.sessionStorage ?? null;
  if (typeof window === 'undefined' || !window.sessionStorage) return null;
  return window.sessionStorage;
}

/**
 * Clears editor-owned keys when a storage backend is present.
 *
 * @param storage Storage backend or null.
 * @returns Number of keys removed (0 when storage is null).
 */
function clearOptionalStorage(storage: Storage | null): number {
  return storage ? clearEditorOwnedKeys(storage) : 0;
}

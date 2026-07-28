import { describe, expect, it } from 'vitest';
import { clearEditorLocalStorage, EDITOR_STORAGE_KEY_PREFIX } from '../../src/settings/clear_editor_storage.js';

/** Minimal Storage implementation backed by a Map. */
function createMapStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => (values.has(key) ? values.get(key)! : null),
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe('clearEditorLocalStorage', () => {
  it('should remove only aiworlded.* keys and leave unrelated keys', () => {
    const storage = createMapStorage();
    storage.setItem(`${EDITOR_STORAGE_KEY_PREFIX}settings.view`, '{}');
    storage.setItem(`${EDITOR_STORAGE_KEY_PREFIX}settings.workspaces`, '{}');
    storage.setItem('unrelated.app.flag', '1');
    const removed = clearEditorLocalStorage(storage);
    expect(removed).toBe(2);
    expect(storage.getItem(`${EDITOR_STORAGE_KEY_PREFIX}settings.view`)).toBeNull();
    expect(storage.getItem(`${EDITOR_STORAGE_KEY_PREFIX}settings.workspaces`)).toBeNull();
    expect(storage.getItem('unrelated.app.flag')).toBe('1');
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import {
  allowEditorStorageWritesForTests,
  areEditorStorageWritesSuppressed,
  clearEditorLocalStorage,
  EDITOR_STORAGE_KEY_PREFIX,
  performEditorFactoryReset,
  suppressEditorStorageWrites,
} from '../../src/settings/clear_editor_storage.js';
import { WorkspaceStore } from '../../src/managers/layout/workspace/workspace_store.js';
import { MemorySettingsStorage } from '../../src/settings/settings_storage.js';
import { VIEW_SETTINGS_STORAGE_KEY } from '../../src/settings/settings_storage_keys.js';

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

afterEach(() => {
  allowEditorStorageWritesForTests();
});

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

describe('performEditorFactoryReset', () => {
  it('suppresses writes, clears local and session storage, and blocks workspace resurrection', () => {
    const local = createMapStorage();
    const session = createMapStorage();
    local.setItem(`${EDITOR_STORAGE_KEY_PREFIX}settings.workspaces`, '{"poison":true}');
    local.setItem(`${EDITOR_STORAGE_KEY_PREFIX}settings.view`, '{}');
    session.setItem(`${EDITOR_STORAGE_KEY_PREFIX}session.flag`, '1');
    session.setItem('unrelated.session', 'keep');

    const store = new WorkspaceStore(local);
    const removed = performEditorFactoryReset({ localStorage: local, sessionStorage: session });

    expect(areEditorStorageWritesSuppressed()).toBe(true);
    expect(removed).toBe(3);
    expect(local.getItem(`${EDITOR_STORAGE_KEY_PREFIX}settings.workspaces`)).toBeNull();
    expect(local.getItem(`${EDITOR_STORAGE_KEY_PREFIX}settings.view`)).toBeNull();
    expect(session.getItem(`${EDITOR_STORAGE_KEY_PREFIX}session.flag`)).toBeNull();
    expect(session.getItem('unrelated.session')).toBe('keep');

    store.updateWorkspaceLayout(store.getActiveWorkspaceId(), store.getActiveWorkspace()!.layout);
    expect(local.getItem(`${EDITOR_STORAGE_KEY_PREFIX}settings.workspaces`)).toBeNull();
  });

  it('blocks settings storage writes after suppress', () => {
    const memory = new MemorySettingsStorage();
    memory.setItem(VIEW_SETTINGS_STORAGE_KEY, '{"before":true}');
    suppressEditorStorageWrites();
    memory.setItem(VIEW_SETTINGS_STORAGE_KEY, '{"after":true}');
    expect(memory.getItem(VIEW_SETTINGS_STORAGE_KEY)).toBe('{"before":true}');
  });
});

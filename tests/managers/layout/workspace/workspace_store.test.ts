import { describe, expect, it } from 'vitest';
import { WorkspaceStore } from '../../../../src/managers/layout/workspace/workspace_store.js';
import { WORKSPACE_IDS } from '../../../../src/managers/layout/workspace/workspace_definition.js';
import { serializeAreaLayout } from '../../../../src/managers/layout/area/area_layout_serializer.js';
import { createSinglePerspectiveLayout } from '../../../../src/managers/layout/area/area_layout_presets.js';

/** Creates an in-memory Storage mock for workspace tests. */
function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

describe('WorkspaceStore', () => {
  it('should seed default workspaces when storage is empty', () => {
    const store = new WorkspaceStore(createMemoryStorage());
    expect(store.getWorkspaces().length).toBeGreaterThanOrEqual(4);
    expect(store.getActiveWorkspaceId()).toBe(WORKSPACE_IDS.quad);
  });

  it('should switch active workspace and persist', () => {
    const storage = createMemoryStorage();
    const store = new WorkspaceStore(storage);
    expect(store.setActiveWorkspaceId(WORKSPACE_IDS.dual)).toBe(true);
    const reloaded = new WorkspaceStore(storage);
    expect(reloaded.getActiveWorkspaceId()).toBe(WORKSPACE_IDS.dual);
  });

  it('should refuse deleting the last workspace', () => {
    const store = new WorkspaceStore(createMemoryStorage());
    const ids = store.getWorkspaces().map((item) => item.id);
    for (let i = 0; i < ids.length - 1; i += 1) {
      expect(store.deleteWorkspace(ids[i]!)).toBe(true);
    }
    expect(store.getWorkspaces()).toHaveLength(1);
    expect(store.deleteWorkspace(store.getActiveWorkspaceId())).toBe(false);
  });

  it('should add a user workspace from a layout document', () => {
    const store = new WorkspaceStore(createMemoryStorage());
    const layout = serializeAreaLayout(createSinglePerspectiveLayout());
    const created = store.addWorkspace('My Layout', layout);
    expect(created.name).toBe('My Layout');
    expect(store.getActiveWorkspaceId()).toBe(created.id);
  });

  it('should reorder workspaces by moving an id to a new index', () => {
    const store = new WorkspaceStore(createMemoryStorage());
    const ids = store.getWorkspaces().map((item) => item.id);
    const first = ids[0]!;
    const lastIndex = ids.length - 1;
    expect(store.moveWorkspace(first, lastIndex)).toBe(true);
    const reordered = store.getWorkspaces().map((item) => item.id);
    expect(reordered[reordered.length - 1]).toBe(first);
    expect(reordered).not.toEqual(ids);
  });

  it('should swap adjacent tabs when moving one step right', () => {
    const store = new WorkspaceStore(createMemoryStorage());
    const ids = store.getWorkspaces().map((item) => item.id);
    const first = ids[0]!;
    const second = ids[1]!;
    expect(store.moveWorkspace(first, 1)).toBe(true);
    const reordered = store.getWorkspaces().map((item) => item.id);
    expect(reordered[0]).toBe(second);
    expect(reordered[1]).toBe(first);
  });
});

import { createDefaultWorkspaces, type WorkspaceDefinition, WORKSPACE_IDS } from './workspace_definition.js';
import { deserializeAreaLayout } from '../area/area_layout_serializer.js';

/** Persistence shape for workspace preferences. */
export interface WorkspaceStoreSnapshot {
  workspaces: WorkspaceDefinition[];
  activeWorkspaceId: string;
}

const STORAGE_KEY = 'aiworlded.settings.workspaces';

/** Loads and saves named workspaces. Falls back to built-in defaults. */
export class WorkspaceStore {
  private workspaces: WorkspaceDefinition[];
  private activeWorkspaceId: string;
  private readonly storage: Storage | null;

  /**
   * Creates a store, optionally hydrating from localStorage.
   *
   * @param storage Browser storage or null for in-memory only.
   */
  constructor(storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null) {
    this.storage = storage;
    const loaded = this.readFromStorage();
    if (loaded) {
      this.workspaces = loaded.workspaces;
      this.activeWorkspaceId = loaded.activeWorkspaceId;
    } else {
      this.workspaces = createDefaultWorkspaces();
      this.activeWorkspaceId = WORKSPACE_IDS.quad;
    }
  }

  /**
   * Returns a copy of the workspace list.
   *
   * @returns Workspaces.
   */
  getWorkspaces(): readonly WorkspaceDefinition[] {
    return this.workspaces.map((item) => ({ ...item, layout: { ...item.layout, root: item.layout.root } }));
  }

  /**
   * Returns the active workspace id.
   *
   * @returns Active id.
   */
  getActiveWorkspaceId(): string {
    return this.activeWorkspaceId;
  }

  /**
   * Returns the active workspace definition when present.
   *
   * @returns Active workspace or null.
   */
  getActiveWorkspace(): WorkspaceDefinition | null {
    return this.workspaces.find((item) => item.id === this.activeWorkspaceId) ?? null;
  }

  /**
   * Sets the active workspace id when it exists.
   *
   * @param workspaceId Target id.
   * @returns True when switched.
   */
  setActiveWorkspaceId(workspaceId: string): boolean {
    if (!this.workspaces.some((item) => item.id === workspaceId)) return false;
    this.activeWorkspaceId = workspaceId;
    this.persist();
    return true;
  }

  /**
   * Replaces the layout document for a workspace.
   *
   * @param workspaceId Target id.
   * @param layout Serialized layout.
   * @returns True when updated.
   */
  updateWorkspaceLayout(workspaceId: string, layout: WorkspaceDefinition['layout']): boolean {
    const index = this.workspaces.findIndex((item) => item.id === workspaceId);
    if (index < 0) return false;
    if (!deserializeAreaLayout(layout)) return false;
    this.workspaces[index] = { ...this.workspaces[index]!, layout };
    this.persist();
    return true;
  }

  /**
   * Renames a workspace.
   *
   * @param workspaceId Target id.
   * @param name New display name.
   * @returns True when renamed.
   */
  renameWorkspace(workspaceId: string, name: string): boolean {
    const trimmed = name.trim();
    if (!trimmed) return false;
    const index = this.workspaces.findIndex((item) => item.id === workspaceId);
    if (index < 0) return false;
    this.workspaces[index] = { ...this.workspaces[index]!, name: trimmed };
    this.persist();
    return true;
  }

  /**
   * Moves a workspace so it sits at a new index in the tab order. The insert
   * index is applied after removal, so moving right uses the final index in the
   * post-removal array.
   *
   * @param workspaceId Workspace to move.
   * @param toIndex Desired final index (clamped).
   * @returns True when the order changed.
   */
  moveWorkspace(workspaceId: string, toIndex: number): boolean {
    const fromIndex = this.workspaces.findIndex((item) => item.id === workspaceId);
    if (fromIndex < 0) return false;
    const clamped = Math.max(0, Math.min(this.workspaces.length - 1, Math.floor(toIndex)));
    if (fromIndex === clamped) return false;
    const [entry] = this.workspaces.splice(fromIndex, 1);
    if (!entry) return false;
    this.workspaces.splice(clamped, 0, entry);
    this.persist();
    return true;
  }

  /**
   * Adds a workspace cloned from the active layout.
   *
   * @param name Display name.
   * @param layout Serialized layout.
   * @returns Created workspace.
   */
  addWorkspace(name: string, layout: WorkspaceDefinition['layout']): WorkspaceDefinition {
    const id = `workspace_user_${Date.now()}`;
    const workspace: WorkspaceDefinition = { id, name: name.trim() || 'Workspace', layout };
    this.workspaces.push(workspace);
    this.activeWorkspaceId = id;
    this.persist();
    return workspace;
  }

  /**
   * Deletes a workspace. Refuses when it is the last remaining entry.
   *
   * @param workspaceId Target id.
   * @returns True when deleted.
   */
  deleteWorkspace(workspaceId: string): boolean {
    if (this.workspaces.length <= 1) return false;
    const index = this.workspaces.findIndex((item) => item.id === workspaceId);
    if (index < 0) return false;
    this.workspaces.splice(index, 1);
    if (this.activeWorkspaceId === workspaceId) {
      this.activeWorkspaceId = this.workspaces[0]!.id;
    }
    this.persist();
    return true;
  }

  /**
   * Returns a snapshot for tests.
   *
   * @returns Store snapshot.
   */
  getSnapshot(): WorkspaceStoreSnapshot {
    return {
      workspaces: this.getWorkspaces() as WorkspaceDefinition[],
      activeWorkspaceId: this.activeWorkspaceId,
    };
  }

  /**
   * Reads and validates storage JSON.
   *
   * @returns Snapshot or null.
   */
  private readFromStorage(): WorkspaceStoreSnapshot | null {
    if (!this.storage) return null;
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return sanitizeSnapshot(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  /** Writes the current state to storage when available. */
  private persist(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.getSnapshot()));
    } catch {
      /* ignore quota errors */
    }
  }
}

/**
 * Sanitizes an unknown snapshot into a valid store state.
 *
 * @param value Parsed JSON.
 * @returns Snapshot or null.
 */
function sanitizeSnapshot(value: unknown): WorkspaceStoreSnapshot | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const list = record['workspaces'];
  const activeId = record['activeWorkspaceId'];
  if (!Array.isArray(list) || typeof activeId !== 'string') return null;
  const workspaces: WorkspaceDefinition[] = [];
  for (const item of list) {
    const workspace = sanitizeWorkspace(item);
    if (workspace) workspaces.push(workspace);
  }
  if (workspaces.length === 0) return null;
  const activeWorkspaceId = workspaces.some((item) => item.id === activeId) ? activeId : workspaces[0]!.id;
  return { workspaces, activeWorkspaceId };
}

/**
 * Sanitizes one workspace entry.
 *
 * @param value Unknown entry.
 * @returns Workspace or null.
 */
function sanitizeWorkspace(value: unknown): WorkspaceDefinition | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const id = record['id'];
  const name = record['name'];
  const layout = record['layout'];
  if (typeof id !== 'string' || typeof name !== 'string') return null;
  if (!deserializeAreaLayout(layout)) return null;
  return { id, name, layout: layout as WorkspaceDefinition['layout'] };
}

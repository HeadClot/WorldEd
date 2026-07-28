import type { AreaLayoutController } from '../area/area_layout_controller.js';
import { listAreaLeafPlacements } from '../area/area_layout_tree.js';
import type { ViewportRegistry } from '../viewport_registry.js';
import type { ViewportKind } from '../../../viewports/viewport_kind.js';
import { WorkspaceStore } from './workspace_store.js';
import { workspaceIdForPaneCount } from './workspace_definition.js';
import type { WorkspaceDefinition } from './workspace_definition.js';

/** Host callbacks for applying a workspace to live panes. */
export interface WorkspaceControllerHost {
  /**
   * Creates a pane for an area that is not yet in the registry.
   *
   * @param areaId Area id.
   * @param container Host element.
   * @param viewportKind Viewport kind.
   */
  onAreaAdded(areaId: string, container: HTMLElement, viewportKind: ViewportKind): void;

  /**
   * Removes a registry pane.
   *
   * @param areaId Area id.
   */
  onAreaRemoved(areaId: string): void;

  /** Full structure rewire after workspace apply. */
  onStructureChanged(): void;
}

/** Applies named workspaces to the area layout and keeps the store in sync. */
export class WorkspaceController {
  private readonly store: WorkspaceStore;
  private readonly areaController: AreaLayoutController;
  private readonly registry: ViewportRegistry;
  private readonly host: WorkspaceControllerHost;

  /**
   * Creates a workspace controller.
   *
   * @param store Workspace persistence store.
   * @param areaController Area layout controller.
   * @param registry Viewport registry.
   * @param host Structure mutation host.
   */
  constructor(
    store: WorkspaceStore,
    areaController: AreaLayoutController,
    registry: ViewportRegistry,
    host: WorkspaceControllerHost,
  ) {
    this.store = store;
    this.areaController = areaController;
    this.registry = registry;
    this.host = host;
  }

  /**
   * Returns the backing store.
   *
   * @returns Workspace store.
   */
  getStore(): WorkspaceStore {
    return this.store;
  }

  /** Applies the active workspace from the store. */
  applyActiveWorkspace(): void {
    const active = this.store.getActiveWorkspace();
    if (!active) return;
    this.applyWorkspace(active);
  }

  /**
   * Switches to a workspace by id, saving the current layout first. No-ops when
   * the requested id is already active so tab clicks do not rebuild chrome.
   *
   * @param workspaceId Target workspace id.
   * @returns True when the active workspace is the requested id.
   */
  switchTo(workspaceId: string): boolean {
    if (this.store.getActiveWorkspaceId() === workspaceId) {
      return true;
    }
    this.persistCurrentIntoActive();
    if (!this.store.setActiveWorkspaceId(workspaceId)) return false;
    this.applyActiveWorkspace();
    return true;
  }

  /**
   * Adds a workspace cloned from the current layout and switches to it.
   *
   * @param name Display name.
   * @returns Created workspace.
   */
  addFromCurrent(name: string): WorkspaceDefinition {
    this.persistCurrentIntoActive();
    const layout = this.areaController.serialize();
    const created = this.store.addWorkspace(name, layout);
    this.applyActiveWorkspace();
    return created;
  }

  /**
   * Adds a workspace from a preset template (name + layout) and switches to it.
   *
   * @param template Preset workspace definition.
   * @returns Created workspace.
   */
  addFromPreset(template: WorkspaceDefinition): WorkspaceDefinition {
    this.persistCurrentIntoActive();
    const created = this.store.addWorkspace(template.name, template.layout);
    this.applyActiveWorkspace();
    return created;
  }

  /**
   * Deletes a workspace when more than one remains.
   *
   * @param workspaceId Target id.
   * @returns True when deleted.
   */
  deleteWorkspace(workspaceId: string): boolean {
    const wasActive = this.store.getActiveWorkspaceId() === workspaceId;
    if (!this.store.deleteWorkspace(workspaceId)) return false;
    if (wasActive) this.applyActiveWorkspace();
    return true;
  }

  /**
   * Renames a workspace tab without changing its layout.
   *
   * @param workspaceId Target workspace id.
   * @param name New display name.
   * @returns True when the rename applied.
   */
  renameWorkspace(workspaceId: string, name: string): boolean {
    return this.store.renameWorkspace(workspaceId, name);
  }

  /**
   * Reorders a workspace tab to a new index.
   *
   * @param workspaceId Workspace to move.
   * @param toIndex Destination index.
   * @returns True when the order changed.
   */
  moveWorkspace(workspaceId: string, toIndex: number): boolean {
    return this.store.moveWorkspace(workspaceId, toIndex);
  }

  /**
   * Migrates a historical pane-count preference to a workspace switch.
   *
   * @param paneCount Pane count 1–4.
   */
  applyPaneCountMigration(paneCount: 1 | 2 | 3 | 4): void {
    const id = workspaceIdForPaneCount(paneCount);
    this.store.setActiveWorkspaceId(id);
    this.applyActiveWorkspace();
  }

  /** Writes the current tree into the active workspace entry. */
  persistCurrentIntoActive(): void {
    const activeId = this.store.getActiveWorkspaceId();
    this.store.updateWorkspaceLayout(activeId, this.areaController.serialize());
  }

  /**
   * Applies a workspace definition: load tree, reconcile registry panes.
   *
   * @param workspace Workspace to apply.
   */
  private applyWorkspace(workspace: WorkspaceDefinition): void {
    if (!this.areaController.loadSerialized(workspace.layout)) return;
    this.reconcileRegistryToPlacements();
    this.host.onStructureChanged();
  }

  /** Adds missing panes and removes registry panes not present in the layout. */
  private reconcileRegistryToPlacements(): void {
    const placements = listAreaLeafPlacements(this.areaController.getRoot());
    const liveIds = new Set(placements.map((item) => item.payload.areaId));
    for (const pane of [...this.registry.getPanes()]) {
      if (!liveIds.has(pane.getId())) {
        this.host.onAreaRemoved(pane.getId());
      }
    }
    for (const placement of placements) {
      if (this.registry.getPaneById(placement.payload.areaId)) continue;
      const kind = placement.payload.viewportKind;
      if (!kind) continue;
      const container = this.areaController.getLayoutDom().getContainer(placement.payload.areaId);
      if (!container) continue;
      this.host.onAreaAdded(placement.payload.areaId, container, kind);
    }
  }
}

import type { EditorViewport } from '../../viewports/editor_viewport.js';
import type { ViewportKind } from '../../viewports/viewport_kind.js';
import { WorkspaceSwitcherBar } from '../../ui/workspace/workspace_switcher_bar.js';
import type { WorkspaceDefinition } from './workspace/workspace_definition.js';
import { WorkspaceController } from './workspace/workspace_controller.js';
import type { WorkspaceStore } from './workspace/workspace_store.js';
import { AreaLayoutInteraction } from './area/area_layout_interaction.js';
import type { AreaLayoutController } from './area/area_layout_controller.js';
import type { ViewportRegistry } from './viewport_registry.js';
import type { ViewportPane } from './viewport_pane.js';
import { wireReplacedPane, wireToolbarForPane } from './layout_viewport_chrome.js';

/**
 * Host surface required to wire area tiling interaction and the workspace
 * switcher bar into the layout core without growing the core file further.
 * Mutable fields are read through getters so snapshots stay live.
 */
export interface WorkspaceAreaWiringHost {
  getToolbarContainer(): HTMLElement;
  getViewportArea(): HTMLElement;
  getViewportPaneGrid(): HTMLElement;
  getWorkspaceStore(): WorkspaceStore;
  getWorkspaceController(): WorkspaceController | null;
  getWorkspaceSwitcherBar(): WorkspaceSwitcherBar | null;
  getAreaLayoutInteraction(): AreaLayoutInteraction | null;
  getViewportRegistry(): ViewportRegistry;
  getAreaLayoutController(): AreaLayoutController;
  setWorkspaceController(controller: WorkspaceController | null): void;
  setWorkspaceSwitcherBar(bar: WorkspaceSwitcherBar | null): void;
  setAreaLayoutInteraction(interaction: AreaLayoutInteraction | null): void;
  openDetachedViewport(viewportKind: ViewportKind): boolean;
  getViewportChromeHost(): Parameters<typeof wireReplacedPane>[0];
  resizeAll(): void;
  refreshNamedViewportFields(): void;
  rewireAfterAreaStructureChange(): void;
}

/**
 * Creates the workspace controller and switcher bar, then applies the active
 * workspace layout.
 *
 * @param host Layout wiring host.
 */
export function wireWorkspaceSystem(host: WorkspaceAreaWiringHost): void {
  const controller = new WorkspaceController(
    host.getWorkspaceStore(),
    host.getAreaLayoutController(),
    host.getViewportRegistry(),
    createStructureCallbacks(host),
  );
  host.setWorkspaceController(controller);
  host.getWorkspaceSwitcherBar()?.dispose();
  const switcherBar = new WorkspaceSwitcherBar(host.getToolbarContainer(), createSwitcherActions(host));
  host.setWorkspaceSwitcherBar(switcherBar);
  insertWorkspaceSwitcherBeforeMainLayout(host);
  controller.applyActiveWorkspace();
  refreshWorkspaceSwitcherBar(host);
}

/**
 * Builds switcher callbacks that mutate the store/controller and refresh tabs.
 *
 * @param host Layout wiring host.
 * @returns Switcher action bag.
 */
function createSwitcherActions(host: WorkspaceAreaWiringHost) {
  return {
    onSelectWorkspace: (id: string) => {
      const previousId = host.getWorkspaceStore().getActiveWorkspaceId();
      host.getWorkspaceController()?.switchTo(id);
      if (previousId !== id) refreshWorkspaceSwitcherBar(host);
    },
    onAddPresetWorkspace: (template: WorkspaceDefinition) => {
      host.getWorkspaceController()?.addFromPreset(template);
      refreshWorkspaceSwitcherBar(host);
    },
    onDuplicateCurrent: () => {
      host.getWorkspaceController()?.addFromCurrent('Workspace');
      refreshWorkspaceSwitcherBar(host);
    },
    onDeleteWorkspace: (id: string) => {
      host.getWorkspaceController()?.deleteWorkspace(id);
      refreshWorkspaceSwitcherBar(host);
    },
    onRenameWorkspace: (id: string, name: string) => {
      host.getWorkspaceController()?.renameWorkspace(id, name);
    },
    onReorderWorkspace: (id: string, toIndex: number) => {
      host.getWorkspaceController()?.moveWorkspace(id, toIndex);
      refreshWorkspaceSwitcherBar(host);
    },
  };
}

/**
 * Places the workspace switcher between the toolbar and the main layout row.
 *
 * @param host Layout wiring host.
 */
export function insertWorkspaceSwitcherBeforeMainLayout(host: WorkspaceAreaWiringHost): void {
  const bar = host.getWorkspaceSwitcherBar()?.getElement();
  if (!bar) return;
  const mainLayout = host.getViewportArea().parentElement;
  if (!mainLayout || mainLayout.parentElement !== host.getToolbarContainer()) return;
  host.getToolbarContainer().insertBefore(bar, mainLayout);
}

/**
 * Rebuilds workspace switcher tabs from the store.
 *
 * @param host Layout wiring host.
 */
export function refreshWorkspaceSwitcherBar(host: WorkspaceAreaWiringHost): void {
  const switcherBar = host.getWorkspaceSwitcherBar();
  if (!switcherBar) return;
  const store = host.getWorkspaceStore();
  switcherBar.setWorkspaces(store.getWorkspaces(), store.getActiveWorkspaceId());
}

/**
 * Wires splitters and corner gestures after the registry exists.
 *
 * @param host Layout wiring host.
 */
export function wireAreaLayoutInteraction(host: WorkspaceAreaWiringHost): void {
  host.getAreaLayoutInteraction()?.dispose();
  const interaction = new AreaLayoutInteraction(host.getViewportPaneGrid(), host.getAreaLayoutController(), {
    ...createStructureCallbacks(host),
    onDetachArea: (viewportKind) => host.openDetachedViewport(viewportKind),
    onGeometryChanged: () => host.resizeAll(),
  });
  host.setAreaLayoutInteraction(interaction);
}

/**
 * Creates a registry pane for a newly split area and attaches chrome.
 *
 * @param host Layout wiring host.
 * @param areaId New area id.
 * @param container Pane host element.
 * @param viewportKind Viewport kind to create.
 */
export function handleAreaLayoutAreaAdded(
  host: WorkspaceAreaWiringHost,
  areaId: string,
  container: HTMLElement,
  viewportKind: ViewportKind,
): void {
  if (host.getViewportRegistry().getPaneById(areaId)) return;
  const pane = host.getViewportRegistry().addPaneWithKind(areaId, container, viewportKind);
  const viewport = pane.getViewport();
  if (!viewport) return;
  wireReplacedPane(host.getViewportChromeHost(), pane, viewport);
}

/**
 * Removes a registry pane when an area is joined or detached.
 *
 * @param host Layout wiring host.
 * @param areaId Removed area id.
 */
export function handleAreaLayoutAreaRemoved(host: WorkspaceAreaWiringHost, areaId: string): void {
  host.getViewportRegistry().removePane(areaId);
}

/**
 * Rebinds tools, rulers, and chrome after a structural area mutation.
 *
 * @param host Layout wiring host.
 */
export function handleAreaLayoutStructureChanged(host: WorkspaceAreaWiringHost): void {
  host.refreshNamedViewportFields();
  host.getViewportRegistry().activateAllPanes();
  host
    .getViewportRegistry()
    .getPanes()
    .forEach((pane: ViewportPane) => {
      const viewport = pane.getViewport();
      if (!viewport) return;
      wireToolbarForPane(host.getViewportChromeHost(), pane, viewport as EditorViewport);
    });
  host.rewireAfterAreaStructureChange();
}

/**
 * Shared structure callbacks for workspace controller and area interaction.
 *
 * @param host Layout wiring host.
 * @returns Callback bag.
 */
function createStructureCallbacks(host: WorkspaceAreaWiringHost) {
  return {
    onAreaAdded: (areaId: string, container: HTMLElement, viewportKind: ViewportKind) =>
      handleAreaLayoutAreaAdded(host, areaId, container, viewportKind),
    onAreaRemoved: (areaId: string) => handleAreaLayoutAreaRemoved(host, areaId),
    onStructureChanged: () => handleAreaLayoutStructureChanged(host),
  };
}

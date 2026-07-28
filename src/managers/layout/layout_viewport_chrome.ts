import type * as THREE from 'three';
import type { TransformGizmo } from '../../transform/gizmo/transform_gizmo.js';
import type { EditorViewport } from '../../viewports/editor_viewport.js';
import { getGizmoPlaneForKind } from '../../viewports/editor_viewport.js';
import { ViewportKind, getViewportKindDisplayLabel } from '../../viewports/viewport_kind.js';
import type { ViewportPane } from './viewport_pane.js';
import type { ViewportPaneLayout } from './viewport_pane_layout.js';
import type { ViewportRegistry } from './viewport_registry.js';
import type { ViewportSyncManager } from './viewport_sync_manager.js';
import type { SelectionVisualController } from '../../selection/object/selection_visual_controller.js';
import type { TransformInteractionBridge } from '../tools/transform_interaction_bridge.js';
import type { ShadingModeCoordinator } from '../camera/shading_mode_coordinator.js';
import type { FaceModeCoordinator } from '../face/face_mode_coordinator.js';
import type { ClipPlaneHandler } from '../clip_plane/clip_plane_handler.js';

/** Host surface for viewport maximize and type-menu chrome. */
export interface LayoutViewportChromeHost {
  viewportRegistry: ViewportRegistry;
  viewportPaneLayout: ViewportPaneLayout;
  viewportSyncManager: ViewportSyncManager;
  worldObject: THREE.Group;
  transformGizmo: TransformGizmo;
  selectionVisualController: SelectionVisualController | undefined;
  transformInteractionBridge: TransformInteractionBridge | undefined;
  shadingModeCoordinator: ShadingModeCoordinator | undefined;
  faceModeCoordinator: FaceModeCoordinator | undefined;
  clipPlaneHandler: ClipPlaneHandler | null;
  resizeAll(): void;
  attachCadRulers(): void;
  refreshNamedViewportFields(): void;
  showStatusMessage(message: string): void;
  /**
   * Writes the live area tree (including viewport kinds) into the active
   * workspace and persists it.
   */
  persistActiveWorkspaceLayout(): void;
}

/**
 * Wires maximize/restore actions on all viewport overlay toolbars.
 *
 * @param host Layout chrome host.
 */
export function setupViewportMaximizeControls(host: LayoutViewportChromeHost): void {
  host.viewportRegistry.getPanes().forEach((pane) => {
    const viewport = pane.getViewport();
    if (!viewport) return;
    viewport.getViewportToolbar().setOnToggleMaximize(() => {
      toggleMaximizeForPane(host, pane.getId());
    });
  });
}

/**
 * Syncs registry active flags from classic grid slot names (top/front/side/
 * perspective).
 *
 * @param host Layout chrome host.
 * @param slots Visible slot names from the pane layout.
 */
export function syncActivePanesFromSlots(host: LayoutViewportChromeHost, slots: readonly string[]): void {
  const slotToIndex: Record<string, number> = {
    top: 0,
    front: 1,
    side: 2,
    perspective: 3,
  };
  const activeIds = slots
    .map((slot) => host.viewportRegistry.getPaneByIndex(slotToIndex[slot] ?? -1)?.getId())
    .filter((id): id is string => typeof id === 'string');
  if (activeIds.length > 0) {
    host.viewportRegistry.setActivePaneIds(activeIds);
  }
}

/**
 * Marks only layout-visible areas active so multi-view does not prepare or draw
 * hidden panes. When maximized, the display tree has a single leaf, so only
 * that pane stays in the render list.
 *
 * @param host Layout chrome host.
 */
export function syncActivePanesFromVisibleLayout(host: LayoutViewportChromeHost): void {
  const placements = host.viewportPaneLayout.getAreaLayoutController().getPlacements();
  const activeIds = placements.map((placement) => placement.payload.areaId);
  if (activeIds.length === 0) {
    host.viewportRegistry.activateAllPanes();
    return;
  }
  host.viewportRegistry.setActivePaneIds(activeIds);
}

/**
 * Maximizes a pane by area/pane id (deactivates siblings so they are not
 * rendered), or restores the full layout when the same pane is toggled again.
 *
 * @param host Layout chrome host.
 * @param paneId Stable area / registry pane id.
 */
export function toggleMaximizeForPane(host: LayoutViewportChromeHost, paneId: string): void {
  const controller = host.viewportPaneLayout.getAreaLayoutController();
  const maximizedAreaId = controller.toggleMaximized(paneId);
  syncActivePanesFromVisibleLayout(host);
  updateMaximizeToolbarState(host, maximizedAreaId);
  host.resizeAll();
}

/**
 * Updates maximize/restore button appearance on every pane toolbar.
 *
 * @param host Layout chrome host.
 * @param maximizedAreaId Maximized area id, or null when restored.
 */
function updateMaximizeToolbarState(host: LayoutViewportChromeHost, maximizedAreaId: string | null): void {
  host.viewportRegistry.getPanes().forEach((pane) => {
    pane
      .getViewport()
      ?.getViewportToolbar()
      .setMaximized(pane.getId() === maximizedAreaId);
  });
}

/**
 * Wires the viewport kind dropdown on every live toolbar.
 *
 * @param host Layout chrome host.
 */
export function setupViewportTypeMenus(host: LayoutViewportChromeHost): void {
  host.viewportRegistry.getPanes().forEach((pane) => {
    const viewport = pane.getViewport();
    if (!viewport) return;
    const toolbar = viewport.getViewportToolbar();
    toolbar.setViewportKind(pane.getKind());
    toolbar.setOnViewportKindChange((kind) => onViewportKindChange(host, pane.getId(), kind));
  });
}

/**
 * Replaces only the target pane's viewport instance and wires that pane.
 *
 * @param host Layout chrome host.
 * @param paneId Target pane id.
 * @param kind Desired viewport kind.
 */
export function onViewportKindChange(host: LayoutViewportChromeHost, paneId: string, kind: ViewportKind): void {
  const pane = host.viewportRegistry.getPaneById(paneId);
  if (!pane || pane.getKind() === kind) return;
  const created = host.viewportRegistry.replaceKind(paneId, kind);
  if (!created) return;
  host.viewportPaneLayout.getAreaLayoutController().setViewportKind(paneId, kind);
  wireReplacedPane(host, pane, created);
  host.refreshNamedViewportFields();
  host.attachCadRulers();
  host.shadingModeCoordinator?.rebindViewportUi();
  host.faceModeCoordinator?.rebindViewportFaceCallbacks();
  resizeReplacedPane(created);
  host.persistActiveWorkspaceLayout();
  host.showStatusMessage(`Viewport set to ${getViewportKindDisplayLabel(kind)}`);
}

/**
 * Wires world, gizmo, selection, and toolbar hooks for one replaced pane.
 *
 * @param host Layout chrome host.
 * @param pane Pane descriptor that owns the container.
 * @param viewport Newly created viewport instance.
 */
export function wireReplacedPane(host: LayoutViewportChromeHost, pane: ViewportPane, viewport: EditorViewport): void {
  const plane = getGizmoPlaneForKind(viewport.getViewportKind());
  viewport.setWorldGroup(host.worldObject);
  viewport.setMeshResolveCallback((mesh) => host.viewportSyncManager.resolveToWorldMesh(mesh));
  viewport.setGizmoGroup(host.transformGizmo.getHandleGroupClone(plane));
  host.viewportSyncManager.setViewportRoles(null, host.viewportRegistry.getAllViewports());
  host.viewportSyncManager.syncWorldObjectToViewports(host.worldObject);
  host.selectionVisualController?.wireViewports([viewport]);
  host.transformInteractionBridge?.wireViewports([viewport]);
  wireToolbarForPane(host, pane, viewport);
  wireClipCallbackOnViewport(host, viewport);
  host.shadingModeCoordinator?.updateShadingMeshes();
}

/**
 * Wires maximize and type-menu actions for one pane toolbar.
 *
 * @param host Layout chrome host.
 * @param pane Pane descriptor.
 * @param viewport Live viewport in that pane.
 */
export function wireToolbarForPane(host: LayoutViewportChromeHost, pane: ViewportPane, viewport: EditorViewport): void {
  const toolbar = viewport.getViewportToolbar();
  toolbar.setViewportKind(pane.getKind());
  toolbar.setOnViewportKindChange((kind) => onViewportKindChange(host, pane.getId(), kind));
  toolbar.setOnToggleMaximize(() => toggleMaximizeForPane(host, pane.getId()));
  const maximizedId = host.viewportPaneLayout.getAreaLayoutController().getMaximizedAreaId();
  toolbar.setMaximized(pane.getId() === maximizedId);
}

/**
 * Resizes only the replaced pane's camera from its content element size.
 *
 * @param viewport Newly created viewport.
 */
export function resizeReplacedPane(viewport: EditorViewport): void {
  const rect = viewport.getContentElement().getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    viewport.resize(Math.max(1, Math.floor(rect.width)), Math.max(1, Math.floor(rect.height)));
  }
}

/**
 * Binds the clip-plane pointer callback on one viewport when the tool exists.
 *
 * @param host Layout chrome host.
 * @param viewport Viewport to wire.
 */
export function wireClipCallbackOnViewport(host: LayoutViewportChromeHost, viewport: EditorViewport): void {
  const clipPlaneHandler = host.clipPlaneHandler;
  if (!clipPlaneHandler) return;
  viewport.setClipPlaneCallback((event) => {
    return clipPlaneHandler.onPointerDown(event, viewport.getCamera(), viewport.getContentElement());
  });
}

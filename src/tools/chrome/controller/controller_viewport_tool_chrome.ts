import { EditorToolId } from '@/types/editor_tool_id.js';
import { SelectionMode } from '@/types/selection_mode.js';
import { TransformMode } from '@/types/transform_mode.js';
import { EditorInteractionMode, getEditorInteractionModeLabel } from '@/types/editor_interaction_mode.js';
import { EditorComponentMode } from '@/types/editor_component_mode.js';
import { ControllerFaceExtrusion } from '@/tools/face/controller_face_extrusion.js';
import { ToolClipPlane } from '@/tools/clip_plane/tool_clip_plane.js';
import { HandlerClipPlane } from '@/tools/clip_plane/handler_clip_plane.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { EditorOverlayId } from '@/tools/overlay/editor_overlay_id.js';
import type { PolicyEditorOverlay } from '@/tools/overlay/policy_editor_overlay.js';
import type { RegistryModalToolSession } from '@/tools/session/registry_modal_tool_session.js';
import { CLIP_PLANE_SESSION_KEY, EDIT_MODE_SESSION_KEY } from '@/tools/session/editor_tool_session_keys.js';
import {
  ViewportToolChromeHost,
  type ViewportToolChromeHandlers,
} from '@/tools/chrome/host/viewport_tool_chrome_host.js';
import { ViewportToolChromeHoverOwner } from '@/tools/chrome/focus/viewport_tool_chrome_hover_owner.js';
import type { ObjectApplyTransformKind } from '@/types/object_apply_transform_kind.js';

/** Dependencies for coordinating per-pane tool chrome with editor modes. */
export interface ControllerViewportToolChromeDependencies {
  faceExtrusionController: ControllerFaceExtrusion;
  clipPlaneTool: ToolClipPlane;
  clipPlaneHandler: HandlerClipPlane;
  selectionManager: ManagerSelection;
  editorOverlayPolicy: PolicyEditorOverlay;
  modalToolSessionRegistry: RegistryModalToolSession;
  showStatusMessage: (message: string) => void;
  onTransformMode: (mode: TransformMode) => void;
  onOpenUvEditor: () => void;
  onExtrudeFaces: () => void;
  isEditorToolBusy?: () => boolean;
  switchToClipTool?: () => boolean;
  switchToObjectSelect?: () => void;
  switchToFaceSelect?: () => void;
  switchToEditSelect?: () => void;
  /**
   * Attempts to open an Edit Mode session. Return false to cancel mode change
   * (e.g. empty selection).
   */
  onEnterEditMode?: () => boolean;
  /** Tears down the Edit Mode session when returning to Object Mode. */
  onExitEditMode?: () => void;
  /** Forwards component mode changes while Edit Mode is active. */
  onComponentMode?: (mode: EditorComponentMode) => void;
  /** Forces gizmo/rulers refresh after mode changes. */
  onEditModePresentationChanged?: () => void;
  /** Object → Apply bake for mesh/brush transforms. */
  onApplyObjectTransform?: (kind: ObjectApplyTransformKind) => void;
}

/**
 * Coordinates Object / Face / Clip tools and Object Mode / Edit Mode across
 * per-pane viewport tool chrome hosts (rail and options bar).
 */
export class ControllerViewportToolChrome {
  private deps: ControllerViewportToolChromeDependencies;
  private activeTool: EditorToolId;
  private activeTransformMode: TransformMode;
  private activeInteractionMode: EditorInteractionMode;
  private activeComponentMode: EditorComponentMode;
  private readonly hosts: Set<ViewportToolChromeHost>;
  private readonly hostsByContainer: Map<HTMLElement, ViewportToolChromeHost>;
  private readonly hoverOwner: ViewportToolChromeHoverOwner;

  /**
   * Creates a viewport tool chrome controller.
   *
   * @param deps Shared tool systems and callbacks.
   */
  constructor(deps: ControllerViewportToolChromeDependencies) {
    this.deps = deps;
    this.activeTool = EditorToolId.OBJECT;
    this.activeTransformMode = TransformMode.BOUNDS;
    this.activeInteractionMode = EditorInteractionMode.OBJECT_MODE;
    this.activeComponentMode = EditorComponentMode.VERTEX;
    this.hosts = new Set();
    this.hostsByContainer = new Map();
    this.hoverOwner = new ViewportToolChromeHoverOwner();
  }

  /**
   * Ensures every pane container has tool chrome attached.
   *
   * @param containers Live viewport pane hosts.
   */
  syncPaneContainers(containers: readonly HTMLElement[]): void {
    const live = new Set(containers);
    this.hostsByContainer.forEach((host, container) => {
      if (live.has(container)) {
        return;
      }
      this.detachHost(host);
    });
    containers.forEach((container) => {
      this.attachPane(container);
    });
  }

  /**
   * Attaches chrome to a pane container and registers it for broadcasts. No-ops
   * when the container is already attached.
   *
   * @param container Pane host element.
   * @returns Created or existing chrome host.
   */
  attachPane(container: HTMLElement): ViewportToolChromeHost {
    const existing = this.hostsByContainer.get(container);
    if (existing) {
      return existing;
    }
    const host = new ViewportToolChromeHost(container, this.buildHandlers(), (owned) => {
      this.hoverOwner.setOwner(owned);
    });
    this.hosts.add(host);
    this.hostsByContainer.set(container, host);
    this.hoverOwner.register(host);
    this.pushStateToHost(host);
    return host;
  }

  /**
   * Detaches and disposes chrome for a pane host.
   *
   * @param host Host previously returned by attachPane.
   */
  detachHost(host: ViewportToolChromeHost): void {
    this.hosts.delete(host);
    this.hostsByContainer.delete(host.getContainer());
    this.hoverOwner.unregister(host);
    host.dispose();
  }

  /**
   * Returns the active interactive tool.
   *
   * @returns Current EditorToolId.
   */
  getActiveTool(): EditorToolId {
    return this.activeTool;
  }

  /**
   * Returns the Blender-style Object Mode / Edit Mode state.
   *
   * @returns Current interaction mode.
   */
  getActiveInteractionMode(): EditorInteractionMode {
    return this.activeInteractionMode;
  }

  /**
   * Returns the active Edit Mode component mode.
   *
   * @returns Component mode.
   */
  getActiveComponentMode(): EditorComponentMode {
    return this.activeComponentMode;
  }

  /**
   * Returns whether the clip plane tool is active.
   *
   * @returns True when clip mode is live.
   */
  isClipToolActive(): boolean {
    return this.activeTool === EditorToolId.CLIP_PLANE && this.deps.clipPlaneTool.isActive();
  }

  /**
   * Sets Object Mode or Edit Mode and updates all pane chrome.
   *
   * @param mode Interaction mode to activate.
   */
  setInteractionMode(mode: EditorInteractionMode): void {
    if (this.deps.isEditorToolBusy?.()) {
      return;
    }
    if (this.activeInteractionMode === mode) {
      this.broadcastInteractionMode();
      return;
    }
    if (mode === EditorInteractionMode.EDIT_MODE) {
      this.enterEditMode();
      return;
    }
    this.enterObjectMode();
  }

  /**
   * Sets the Edit Mode component mode (vertex / edge / face).
   *
   * @param mode Component mode.
   */
  setComponentMode(mode: EditorComponentMode): void {
    if (this.activeInteractionMode !== EditorInteractionMode.EDIT_MODE) {
      return;
    }
    this.activeComponentMode = mode;
    this.broadcastComponentMode();
    this.deps.onComponentMode?.(mode);
  }

  /** Toggles between Object Mode and Edit Mode (Tab). */
  toggleInteractionMode(): void {
    if (this.activeInteractionMode === EditorInteractionMode.OBJECT_MODE) {
      this.setInteractionMode(EditorInteractionMode.EDIT_MODE);
      return;
    }
    this.setInteractionMode(EditorInteractionMode.OBJECT_MODE);
  }

  /**
   * Activates a tool from the rail or shortcuts.
   *
   * @param toolId Tool to activate.
   */
  selectTool(toolId: EditorToolId): void {
    if (this.deps.isEditorToolBusy?.()) {
      return;
    }
    if (this.activeInteractionMode === EditorInteractionMode.EDIT_MODE) {
      if (toolId === EditorToolId.FACE || toolId === EditorToolId.CLIP_PLANE) {
        this.deps.showStatusMessage('Face Select and Clip are Object Mode tools');
        return;
      }
      this.activateEditSelectTool();
      return;
    }
    if (toolId === EditorToolId.OBJECT) {
      this.activateObjectTool();
      return;
    }
    if (toolId === EditorToolId.FACE) {
      this.activateFaceTool();
      return;
    }
    this.activateClipTool();
  }

  /**
   * Syncs rail highlight when face/object selection mode changes externally
   * (keyboard shortcut or face coordinator).
   *
   * @param mode New selection mode.
   */
  onExternalSelectionModeChanged(mode: SelectionMode): void {
    if (this.activeInteractionMode === EditorInteractionMode.EDIT_MODE) {
      this.activateEditSelectTool();
      return;
    }
    this.endClipSessionIfActive();
    if (mode === SelectionMode.FACE) {
      if (this.activeTool !== EditorToolId.FACE) {
        this.activeTool = EditorToolId.FACE;
        this.deps.switchToFaceSelect?.();
      }
      this.broadcastActiveTool();
      this.refreshChromeContext();
      return;
    }
    if (this.activeTool !== EditorToolId.OBJECT) {
      this.activeTool = EditorToolId.OBJECT;
      this.deps.switchToObjectSelect?.();
    }
    this.broadcastActiveTool();
    this.refreshChromeContext();
  }

  /**
   * Updates transform mode highlight on all panes.
   *
   * @param mode Active transform mode.
   */
  setActiveTransformMode(mode: TransformMode): void {
    this.activeTransformMode = mode;
    this.hosts.forEach((host) => {
      host.setActiveTransformMode(mode);
    });
  }

  /** Refreshes active tool highlight and clip enablement on all panes. */
  refreshChromeContext(): void {
    this.broadcastActiveTool();
    if (this.activeTool === EditorToolId.CLIP_PLANE) {
      this.broadcastClipEnabled(this.deps.clipPlaneTool.isPlaneReady());
      return;
    }
    this.broadcastClipEnabled(false);
  }

  /**
   * Refreshes tool chrome after clip or selection state changes. Named for
   * existing layout call sites.
   */
  refreshPaletteContext(): void {
    this.refreshChromeContext();
  }

  /** Disposes all attached hosts. */
  dispose(): void {
    this.hosts.forEach((host) => {
      host.dispose();
    });
    this.hosts.clear();
    this.hostsByContainer.clear();
    this.hoverOwner.clear();
  }

  /** Activates object selection mode. */
  private activateObjectTool(): void {
    this.endClipSessionIfActive();
    this.deps.faceExtrusionController.setSelectionMode(SelectionMode.OBJECT);
    this.activeTool = EditorToolId.OBJECT;
    this.broadcastActiveTool();
    this.deps.switchToObjectSelect?.();
    this.refreshChromeContext();
    this.deps.showStatusMessage('Object select');
  }

  /** Keeps Edit Select active while Edit Mode is open. */
  private activateEditSelectTool(): void {
    this.endClipSessionIfActive();
    this.activeTool = EditorToolId.OBJECT;
    this.broadcastActiveTool();
    this.deps.switchToEditSelect?.();
    this.refreshChromeContext();
  }

  /** Activates face selection mode. */
  private activateFaceTool(): void {
    this.endClipSessionIfActive();
    this.activeTool = EditorToolId.FACE;
    this.broadcastActiveTool();
    if (this.deps.switchToFaceSelect) {
      this.deps.switchToFaceSelect();
    } else {
      this.deps.faceExtrusionController.setSelectionMode(SelectionMode.FACE);
    }
    this.refreshChromeContext();
    this.deps.showStatusMessage('Face select');
  }

  /** Activates the clip plane tool when a mesh is selected. */
  private activateClipTool(): void {
    const selected = this.deps.selectionManager.getAllSelectedObjectsAsArray();
    if (selected.length === 0) {
      this.deps.showStatusMessage('Select a mesh to clip');
      return;
    }
    this.deps.faceExtrusionController.setSelectionMode(SelectionMode.OBJECT);
    this.beginClipSession();
    this.deps.showStatusMessage(this.deps.clipPlaneTool.getStatusMessage());
  }

  /** Starts the clip modal session. */
  private beginClipSession(): void {
    const switched = this.deps.switchToClipTool?.() === true;
    if (!switched) {
      this.deps.clipPlaneTool.activate();
    }
    this.activeTool = EditorToolId.CLIP_PLANE;
    this.broadcastActiveTool();
    this.deps.editorOverlayPolicy.suppress(EditorOverlayId.CAD_BOUNDS_RULERS, CLIP_PLANE_SESSION_KEY);
    this.deps.modalToolSessionRegistry.register({
      id: CLIP_PLANE_SESSION_KEY,
      endsOnSelectionChange: true,
      end: () => this.onClipSessionEndedBySelection(),
    });
    this.refreshChromeContext();
  }

  /** Ends clip when selection changes externally. */
  private onClipSessionEndedBySelection(): void {
    if (this.activeTool !== EditorToolId.CLIP_PLANE && !this.deps.clipPlaneTool.isActive()) {
      return;
    }
    this.deps.editorOverlayPolicy.release(EditorOverlayId.CAD_BOUNDS_RULERS, CLIP_PLANE_SESSION_KEY);
    this.deps.modalToolSessionRegistry.unregister(CLIP_PLANE_SESSION_KEY);
    this.deps.clipPlaneHandler.cancel();
    this.deps.switchToObjectSelect?.();
    this.activeTool = EditorToolId.OBJECT;
    this.deps.faceExtrusionController.setSelectionMode(SelectionMode.OBJECT);
    this.broadcastActiveTool();
    this.refreshChromeContext();
    this.deps.showStatusMessage('Clip cancelled · selection changed');
  }

  /** Ends the clip session when leaving clip. */
  private endClipSessionIfActive(): void {
    const clipLive =
      this.activeTool === EditorToolId.CLIP_PLANE ||
      this.deps.clipPlaneTool.isActive() ||
      this.deps.modalToolSessionRegistry.has(CLIP_PLANE_SESSION_KEY);
    if (!clipLive) {
      return;
    }
    this.deps.modalToolSessionRegistry.unregister(CLIP_PLANE_SESSION_KEY);
    this.deps.editorOverlayPolicy.release(EditorOverlayId.CAD_BOUNDS_RULERS, CLIP_PLANE_SESSION_KEY);
    if (this.deps.clipPlaneTool.isActive()) {
      this.deps.clipPlaneTool.deactivate();
    }
    this.deps.switchToObjectSelect?.();
  }

  /**
   * Builds handlers bound to this controller.
   *
   * @returns Chrome handlers.
   */
  private buildHandlers(): ViewportToolChromeHandlers {
    return {
      onSelectTool: (toolId) => this.selectTool(toolId),
      onTransformMode: (mode) => this.deps.onTransformMode(mode),
      onFlipClipPlane: () => this.deps.clipPlaneHandler.flipPlane(),
      onCommitClip: () => this.deps.clipPlaneHandler.commitClip(),
      onCommitSplit: () => this.deps.clipPlaneHandler.commitSplit(),
      onOpenUvEditor: () => this.deps.onOpenUvEditor(),
      onExtrudeFaces: () => this.deps.onExtrudeFaces(),
      onInteractionMode: (mode) => this.setInteractionMode(mode),
      onComponentMode: (mode) => this.setComponentMode(mode),
      onApplyObjectTransform: (kind) => this.deps.onApplyObjectTransform?.(kind),
    };
  }

  /**
   * Pushes full UI state to one host.
   *
   * @param host Target host.
   */
  private pushStateToHost(host: ViewportToolChromeHost): void {
    host.setHandlers(this.buildHandlers());
    host.setActiveTool(this.activeTool);
    host.setActiveTransformMode(this.activeTransformMode);
    host.setActiveInteractionMode(this.activeInteractionMode);
    host.setActiveComponentMode(this.activeComponentMode);
    this.refreshChromeContext();
  }

  /** Broadcasts active tool to all hosts. */
  private broadcastActiveTool(): void {
    this.hosts.forEach((host) => {
      host.setActiveTool(this.activeTool);
    });
  }

  /** Broadcasts Object Mode / Edit Mode to all hosts. */
  private broadcastInteractionMode(): void {
    this.hosts.forEach((host) => {
      host.setActiveInteractionMode(this.activeInteractionMode);
    });
  }

  /** Broadcasts Edit Mode component mode to all hosts. */
  private broadcastComponentMode(): void {
    this.hosts.forEach((host) => {
      host.setActiveComponentMode(this.activeComponentMode);
    });
  }

  /**
   * Broadcasts clip action enablement.
   *
   * @param enabled Whether clip actions are enabled.
   */
  private broadcastClipEnabled(enabled: boolean): void {
    this.hosts.forEach((host) => {
      host.setClipActionsEnabled(enabled);
    });
  }

  /** Enters Object Mode and restores object-select chrome. */
  private enterObjectMode(): void {
    this.endClipSessionIfActive();
    this.releaseEditModeOverlays();
    this.deps.onExitEditMode?.();
    this.activeInteractionMode = EditorInteractionMode.OBJECT_MODE;
    this.activeComponentMode = EditorComponentMode.VERTEX;
    this.broadcastInteractionMode();
    this.broadcastComponentMode();
    this.refreshChromeContext();
    this.deps.switchToObjectSelect?.();
    this.deps.onEditModePresentationChanged?.();
    this.deps.showStatusMessage(getEditorInteractionModeLabel(EditorInteractionMode.OBJECT_MODE));
  }

  /** Enters Edit Mode when a domain session can open. */
  private enterEditMode(): void {
    this.endClipSessionIfActive();
    const opened = this.deps.onEnterEditMode?.() !== false;
    if (!opened) {
      this.activeInteractionMode = EditorInteractionMode.OBJECT_MODE;
      this.broadcastInteractionMode();
      this.refreshChromeContext();
      return;
    }
    this.activeInteractionMode = EditorInteractionMode.EDIT_MODE;
    this.activeComponentMode = EditorComponentMode.VERTEX;
    this.suppressEditModeOverlays();
    this.broadcastInteractionMode();
    this.broadcastComponentMode();
    this.refreshChromeContext();
    this.deps.switchToEditSelect?.();
    this.deps.onEditModePresentationChanged?.();
  }

  /** Hides CAD bounds rulers while Edit Mode is active. */
  private suppressEditModeOverlays(): void {
    this.deps.editorOverlayPolicy.suppress(EditorOverlayId.CAD_BOUNDS_RULERS, EDIT_MODE_SESSION_KEY);
  }

  /** Restores CAD bounds rulers after leaving Edit Mode. */
  private releaseEditModeOverlays(): void {
    this.deps.editorOverlayPolicy.release(EditorOverlayId.CAD_BOUNDS_RULERS, EDIT_MODE_SESSION_KEY);
  }
}

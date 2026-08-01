import { ToolsPalette } from '@/tools/palette/ui/tools_palette.js';
import { EditorToolId } from '@/types/editor_tool_id.js';
import { SelectionMode } from '@/types/selection_mode.js';
import { ControllerFaceExtrusion } from '@/tools/face/controller_face_extrusion.js';
import { ToolClipPlane } from '@/tools/clip_plane/tool_clip_plane.js';
import { HandlerClipPlane } from '@/tools/clip_plane/handler_clip_plane.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { EditorOverlayId } from '@/tools/overlay/editor_overlay_id.js';
import type { PolicyEditorOverlay } from '@/tools/overlay/policy_editor_overlay.js';
import type { RegistryModalToolSession } from '@/tools/session/registry_modal_tool_session.js';
import { CLIP_PLANE_SESSION_KEY } from '@/tools/session/editor_tool_session_keys.js';

/** Dependencies for coordinating the Tools palette with editor modes. */
export interface ControllerToolsPaletteDependencies {
  toolsPalette: ToolsPalette;
  faceExtrusionController: ControllerFaceExtrusion;
  clipPlaneTool: ToolClipPlane;
  clipPlaneHandler: HandlerClipPlane;
  selectionManager: ManagerSelection;
  editorOverlayPolicy: PolicyEditorOverlay;
  modalToolSessionRegistry: RegistryModalToolSession;
  showStatusMessage: (message: string) => void;
  /**
   * Optional busy probe for the editor focus system. When true, palette tool
   * switches are refused so a busy tool keeps exclusive ownership.
   */
  isEditorToolBusy?: () => boolean;
  /**
   * Switches the editor window to the clip tool (SwitchTool).
   *
   * @returns True when the clip tool became active.
   */
  switchToClipTool?: () => boolean;
  /** Switches the editor window to object select (box select tool). */
  switchToObjectSelect?: () => void;
}

/** Keeps the Tools palette, face mode, and clip tool mutually exclusive. */
export class ControllerToolsPalette {
  private deps: ControllerToolsPaletteDependencies;
  private activeTool: EditorToolId;

  /**
   * Creates a tools palette controller.
   *
   * @param deps Shared tool systems.
   */
  constructor(deps: ControllerToolsPaletteDependencies) {
    this.deps = deps;
    this.activeTool = EditorToolId.OBJECT;
    this.deps.toolsPalette.setActiveTool(EditorToolId.OBJECT);
    this.refreshPaletteContext();
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
   * Returns whether the clip plane tool is the active tool.
   *
   * @returns True when clip mode is live.
   */
  isClipToolActive(): boolean {
    return this.activeTool === EditorToolId.CLIP_PLANE && this.deps.clipPlaneTool.isActive();
  }

  /**
   * Activates a tool from the palette or shortcuts.
   *
   * @param toolId Tool to activate.
   */
  selectTool(toolId: EditorToolId): void {
    if (this.deps.isEditorToolBusy?.()) {
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
   * Syncs palette highlight when selection mode changes externally (Tab).
   *
   * @param mode New selection mode.
   */
  onExternalSelectionModeChanged(mode: SelectionMode): void {
    this.endClipSessionIfActive();
    this.activeTool = mode === SelectionMode.FACE ? EditorToolId.FACE : EditorToolId.OBJECT;
    this.deps.toolsPalette.setActiveTool(this.activeTool);
    this.refreshPaletteContext();
  }

  /** Refreshes palette status and clip button enablement. */
  refreshPaletteContext(): void {
    this.deps.toolsPalette.setActiveTool(this.activeTool);
    if (this.activeTool === EditorToolId.CLIP_PLANE) {
      this.deps.toolsPalette.setContextStatus(this.deps.clipPlaneTool.getStatusMessage());
      this.deps.toolsPalette.setClipActionsEnabled(this.deps.clipPlaneTool.isPlaneReady());
      return;
    }
    this.deps.toolsPalette.setClipActionsEnabled(false);
    if (this.activeTool === EditorToolId.FACE) {
      this.deps.toolsPalette.setContextStatus('Click faces · open UV Editor or Extrude');
      return;
    }
    this.deps.toolsPalette.setContextStatus('Transform modes · select objects in the viewport');
  }

  /** Activates object selection mode. */
  private activateObjectTool(): void {
    this.endClipSessionIfActive();
    this.deps.faceExtrusionController.setSelectionMode(SelectionMode.OBJECT);
    this.activeTool = EditorToolId.OBJECT;
    this.deps.toolsPalette.setActiveTool(this.activeTool);
    this.deps.switchToObjectSelect?.();
    this.refreshPaletteContext();
    this.deps.showStatusMessage('Object select');
  }

  /** Activates face selection mode. */
  private activateFaceTool(): void {
    this.endClipSessionIfActive();
    this.deps.faceExtrusionController.setSelectionMode(SelectionMode.FACE);
    this.activeTool = EditorToolId.FACE;
    this.deps.toolsPalette.setActiveTool(this.activeTool);
    this.deps.switchToObjectSelect?.();
    this.refreshPaletteContext();
    this.deps.showStatusMessage('Face select');
  }

  /** Activates the clip plane tool when a mesh is selected. */
  private activateClipTool(): void {
    const selected = this.deps.selectionManager.getAllSelectedObjectsAsArray();
    if (selected.length === 0) {
      this.deps.showStatusMessage('Select a mesh to clip');
      this.deps.toolsPalette.setContextStatus('Select a mesh to clip');
      return;
    }
    this.deps.faceExtrusionController.setSelectionMode(SelectionMode.OBJECT);
    this.beginClipSession();
    this.deps.showStatusMessage(this.deps.clipPlaneTool.getStatusMessage());
  }

  /**
   * Starts the clip modal session: editor SwitchTool(clip), CAD rulers
   * suppressed, selection changes end the session (except tool-owned
   * reselects).
   */
  private beginClipSession(): void {
    const switched = this.deps.switchToClipTool?.() === true;
    if (!switched) {
      this.deps.clipPlaneTool.activate();
    }
    this.activeTool = EditorToolId.CLIP_PLANE;
    this.deps.toolsPalette.setActiveTool(this.activeTool);
    this.deps.editorOverlayPolicy.suppress(EditorOverlayId.CAD_BOUNDS_RULERS, CLIP_PLANE_SESSION_KEY);
    this.deps.modalToolSessionRegistry.register({
      id: CLIP_PLANE_SESSION_KEY,
      endsOnSelectionChange: true,
      end: () => this.onClipSessionEndedBySelection(),
    });
    this.refreshPaletteContext();
  }

  /** Ends clip when the modal registry reports an external selection change. */
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
    this.deps.toolsPalette.setActiveTool(this.activeTool);
    this.refreshPaletteContext();
    this.deps.showStatusMessage('Clip cancelled · selection changed');
  }

  /** Ends the clip session when leaving clip via palette / Escape / mode change. */
  private endClipSessionIfActive(): void {
    const clipLive =
      this.activeTool === EditorToolId.CLIP_PLANE ||
      this.deps.clipPlaneTool.isActive() ||
      this.deps.modalToolSessionRegistry.has(CLIP_PLANE_SESSION_KEY);
    if (!clipLive) return;
    this.deps.modalToolSessionRegistry.unregister(CLIP_PLANE_SESSION_KEY);
    this.deps.editorOverlayPolicy.release(EditorOverlayId.CAD_BOUNDS_RULERS, CLIP_PLANE_SESSION_KEY);
    if (this.deps.clipPlaneTool.isActive()) {
      this.deps.clipPlaneTool.deactivate();
    }
    this.deps.switchToObjectSelect?.();
  }
}

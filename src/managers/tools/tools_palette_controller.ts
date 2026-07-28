import { ToolsPalette } from '../../ui/tools_palette.js';
import { EditorToolId } from '../../types/editor_tool_id.js';
import { SelectionMode } from '../../types/selection_mode.js';
import { FaceExtrusionController } from '../face/face_extrusion_controller.js';
import { ClipPlaneTool } from '../clip_plane/clip_plane_tool.js';
import { ClipPlaneHandler } from '../clip_plane/clip_plane_handler.js';
import { SelectionManager } from '../../selection/object/selection_manager.js';
import { EditorOverlayId } from './editor_overlay_id.js';
import type { EditorOverlayPolicy } from './editor_overlay_policy.js';
import type { ModalToolSessionRegistry } from './modal_tool_session_registry.js';
import { CLIP_PLANE_SESSION_KEY } from './editor_tool_session_keys.js';

/** Dependencies for coordinating the Tools palette with editor modes. */
export interface ToolsPaletteControllerDependencies {
  toolsPalette: ToolsPalette;
  faceExtrusionController: FaceExtrusionController;
  clipPlaneTool: ClipPlaneTool;
  clipPlaneHandler: ClipPlaneHandler;
  selectionManager: SelectionManager;
  editorOverlayPolicy: EditorOverlayPolicy;
  modalToolSessionRegistry: ModalToolSessionRegistry;
  showStatusMessage: (message: string) => void;
}

/** Keeps the Tools palette, face mode, and clip tool mutually exclusive. */
export class ToolsPaletteController {
  private deps: ToolsPaletteControllerDependencies;
  private activeTool: EditorToolId;

  /**
   * Creates a tools palette controller.
   *
   * @param deps Shared tool systems.
   */
  constructor(deps: ToolsPaletteControllerDependencies) {
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
    this.refreshPaletteContext();
    this.deps.showStatusMessage('Object select');
  }

  /** Activates face selection mode. */
  private activateFaceTool(): void {
    this.endClipSessionIfActive();
    this.deps.faceExtrusionController.setSelectionMode(SelectionMode.FACE);
    this.activeTool = EditorToolId.FACE;
    this.deps.toolsPalette.setActiveTool(this.activeTool);
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
   * Starts the clip modal session: tool active, CAD rulers suppressed,
   * selection changes end the session (except tool-owned reselects).
   */
  private beginClipSession(): void {
    this.deps.clipPlaneTool.activate();
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
    this.deps.clipPlaneHandler.cancel();
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
  }
}

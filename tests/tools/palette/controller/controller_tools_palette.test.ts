import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { ControllerToolsPalette } from '@/tools/palette/controller/controller_tools_palette.js';
import { ToolsPalette } from '@/tools/palette/ui/tools_palette.js';
import { EditorToolId } from '@/types/editor_tool_id.js';
import { SelectionMode } from '@/types/selection_mode.js';
import { ControllerFaceExtrusion } from '@/tools/face/controller_face_extrusion.js';
import { ToolClipPlane } from '@/tools/clip_plane/tool_clip_plane.js';
import { HandlerClipPlane } from '@/tools/clip_plane/handler_clip_plane.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { CommandStack } from '@/commands/command_stack.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { PolicyEditorOverlay } from '@/tools/overlay/policy_editor_overlay.js';
import { RegistryModalToolSession } from '@/tools/session/registry_modal_tool_session.js';
import { EditorOverlayId } from '@/tools/overlay/editor_overlay_id.js';
import { CLIP_PLANE_SESSION_KEY } from '@/tools/session/editor_tool_session_keys.js';

describe('ToolsPaletteController', () => {
  let host: HTMLElement;
  let palette: ToolsPalette;
  let faceController: ControllerFaceExtrusion;
  let clipTool: ToolClipPlane;
  let selectionManager: ManagerSelection;
  let controller: ControllerToolsPalette;
  let showStatus: ReturnType<typeof vi.fn>;
  let overlayPolicy: PolicyEditorOverlay;
  let modalRegistry: RegistryModalToolSession;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    palette = new ToolsPalette(host, {
      onSelectTool: (id) => controller.selectTool(id),
      onTransformMode: () => undefined,
      onFlipClipPlane: () => undefined,
      onCommitClip: () => undefined,
      onCommitSplit: () => undefined,
      onOpenUvEditor: () => undefined,
      onExtrudeFaces: () => undefined,
    });
    const scene = new THREE.Scene();
    const world = new THREE.Group();
    faceController = new ControllerFaceExtrusion(scene, new CommandStack(8), new GridSnap(false, 1), world);
    clipTool = new ToolClipPlane();
    selectionManager = new ManagerSelection();
    showStatus = vi.fn();
    overlayPolicy = new PolicyEditorOverlay();
    modalRegistry = new RegistryModalToolSession();
    const clipHandler = {
      flipPlane: () => undefined,
      commitClip: () => undefined,
      commitSplit: () => undefined,
      cancel: () => {
        clipTool.deactivate();
      },
    } as unknown as HandlerClipPlane;
    controller = new ControllerToolsPalette({
      toolsPalette: palette,
      faceExtrusionController: faceController,
      clipPlaneTool: clipTool,
      clipPlaneHandler: clipHandler,
      selectionManager,
      editorOverlayPolicy: overlayPolicy,
      modalToolSessionRegistry: modalRegistry,
      showStatusMessage: showStatus,
    });
  });

  it('should start on object tool', () => {
    expect(controller.getActiveTool()).toBe(EditorToolId.OBJECT);
  });

  it('should activate face tool and leave clip inactive', () => {
    controller.selectTool(EditorToolId.FACE);
    expect(controller.getActiveTool()).toBe(EditorToolId.FACE);
    expect(faceController.getSelectionMode()).toBe(SelectionMode.FACE);
    expect(clipTool.isActive()).toBe(false);
  });

  it('should refuse clip tool without a selection', () => {
    controller.selectTool(EditorToolId.CLIP_PLANE);
    expect(clipTool.isActive()).toBe(false);
    expect(showStatus).toHaveBeenCalled();
  });

  it('should activate clip tool when a mesh is selected', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    selectionManager.selectObject(mesh);
    controller.selectTool(EditorToolId.CLIP_PLANE);
    expect(controller.getActiveTool()).toBe(EditorToolId.CLIP_PLANE);
    expect(clipTool.isActive()).toBe(true);
    expect(faceController.getSelectionMode()).toBe(SelectionMode.OBJECT);
    expect(controller.isClipToolActive()).toBe(true);
  });

  it('should deactivate clip when external face mode is entered', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    selectionManager.selectObject(mesh);
    controller.selectTool(EditorToolId.CLIP_PLANE);
    controller.onExternalSelectionModeChanged(SelectionMode.FACE);
    expect(clipTool.isActive()).toBe(false);
    expect(controller.getActiveTool()).toBe(EditorToolId.FACE);
  });

  it('should suppress CAD bounds rulers while clip is active', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    selectionManager.selectObject(mesh);
    expect(overlayPolicy.isAllowed(EditorOverlayId.CAD_BOUNDS_RULERS)).toBe(true);
    controller.selectTool(EditorToolId.CLIP_PLANE);
    expect(overlayPolicy.isAllowed(EditorOverlayId.CAD_BOUNDS_RULERS)).toBe(false);
    controller.selectTool(EditorToolId.OBJECT);
    expect(overlayPolicy.isAllowed(EditorOverlayId.CAD_BOUNDS_RULERS)).toBe(true);
  });

  it('should end clip when selection changes externally via modal registry', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const other = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    selectionManager.selectObject(mesh);
    controller.selectTool(EditorToolId.CLIP_PLANE);
    expect(clipTool.isActive()).toBe(true);
    expect(modalRegistry.has(CLIP_PLANE_SESSION_KEY)).toBe(true);
    selectionManager.selectObject(other);
    modalRegistry.onSelectionChanged();
    expect(clipTool.isActive()).toBe(false);
    expect(controller.getActiveTool()).toBe(EditorToolId.OBJECT);
    expect(overlayPolicy.isAllowed(EditorOverlayId.CAD_BOUNDS_RULERS)).toBe(true);
  });

  it('should not end clip when selection change is suppressed by the modal registry', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const other = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    selectionManager.selectObject(mesh);
    controller.selectTool(EditorToolId.CLIP_PLANE);
    modalRegistry.runWithSelectionEndSuppressed(() => {
      selectionManager.selectObject(other);
      modalRegistry.onSelectionChanged();
    });
    expect(clipTool.isActive()).toBe(true);
    expect(controller.getActiveTool()).toBe(EditorToolId.CLIP_PLANE);
  });
});

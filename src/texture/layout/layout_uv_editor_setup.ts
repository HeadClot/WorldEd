import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { CommandStack } from '@/commands/command_stack.js';
import { ControllerFaceExtrusion } from '@/tools/face/controller_face_extrusion.js';
import { UvEditor } from '@/texture/ui/uv/uv_editor.js';
import { ControllerUvEditor } from '@/texture/controller/controller_uv_editor.js';
import { StatusBar } from '@/ui/status/status_bar.js';
import type { ViewportEditor } from '@/viewports/core/viewport_editor.js';
import {
  bindFloatingPanelToViewports,
  scheduleStartupFloatingPanelLayoutPass,
} from '@/tools/clip_plane/layout/layout_clip_tools_setup.js';

/** Dependencies for constructing the UV editor floating panel. */
export interface UvEditorSetupDeps {
  selectionManager: ManagerSelection;
  faceController: ControllerFaceExtrusion;
  commandStack: CommandStack;
  toolbarContainer: HTMLElement;
  getViewports: () => readonly ViewportEditor[];
  statusBar: StatusBar | null;
  afterSurfaceChange: () => void;
}

/** Result of UV editor construction. */
export interface UvEditorSetupResult {
  uvEditor: UvEditor;
  uvEditorController: ControllerUvEditor;
}

/**
 * Creates the floating UV editor panel and wires selection refresh callbacks.
 *
 * @param deps Shared services and DOM anchors for the UV editor.
 * @returns Created UV editor instances.
 */
export function setupUvEditorPanel(deps: UvEditorSetupDeps): UvEditorSetupResult {
  const uvEditorController = createUvEditorController(deps);
  const uvEditor = createUvEditorUi(deps, uvEditorController);
  bindFloatingPanelToViewports(uvEditor, deps.getViewports);
  scheduleStartupFloatingPanelLayoutPass(uvEditor, deps.getViewports);
  wireUvEditorRefresh(deps, uvEditor, uvEditorController);
  return { uvEditor, uvEditorController };
}

/**
 * Creates the UV mapping controller with status feedback.
 *
 * @param deps UV editor setup dependencies.
 * @returns Configured UV editor controller.
 */
function createUvEditorController(deps: UvEditorSetupDeps): ControllerUvEditor {
  const controller = new ControllerUvEditor(deps.selectionManager, deps.faceController, deps.commandStack);
  controller.setStatusCallback((message) => {
    deps.statusBar?.setLastAction(message);
  });
  return controller;
}

/**
 * Builds the UV editor panel and connects apply/reset actions.
 *
 * @param deps UV editor setup dependencies.
 * @param controller UV mapping controller.
 * @returns Created UV editor panel.
 */
function createUvEditorUi(deps: UvEditorSetupDeps, controller: ControllerUvEditor): UvEditor {
  return new UvEditor(deps.toolbarContainer, {
    onAlign: (align) => {
      controller.applyAlign(align);
      deps.afterSurfaceChange();
    },
    onApplyPartialTrs: (fields) => {
      controller.applyPartialTrsFields(fields);
      deps.afterSurfaceChange();
    },
    onRelativeOp: (op) => {
      controller.applyRelativeOp(op);
      deps.afterSurfaceChange();
    },
    onReset: () => {
      controller.resetMapping();
      deps.afterSurfaceChange();
    },
  });
}

/**
 * Wires UI refresh when object or face selection changes.
 *
 * @param deps UV editor setup dependencies.
 * @param uvEditor UV editor panel.
 * @param controller UV mapping controller.
 */
function wireUvEditorRefresh(deps: UvEditorSetupDeps, uvEditor: UvEditor, controller: ControllerUvEditor): void {
  controller.setUiRefreshCallback((fields) => {
    uvEditor.setFromFieldState(fields);
  });
  deps.faceController.setFaceSelectionChangedCallback(() => {
    if (!uvEditor.isOpen()) return;
    controller.refreshFromSelection();
  });
}

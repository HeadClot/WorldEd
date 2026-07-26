import { SelectionManager } from '../../selection/object/selection_manager.js';
import { CommandStack } from '../../commands/command_stack.js';
import { FaceExtrusionController } from '../face/face_extrusion_controller.js';
import { UvEditor } from '../../ui/uv/uv_editor.js';
import { UvEditorController } from '../texture/uv_editor_controller.js';
import { StatusBar } from '../../ui/status_bar.js';

/** Dependencies for constructing the UV editor floating panel. */
export interface UvEditorSetupDeps {
  selectionManager: SelectionManager;
  faceController: FaceExtrusionController;
  commandStack: CommandStack;
  toolbarContainer: HTMLElement;
  anchorViewport: HTMLElement;
  statusBar: StatusBar | null;
  afterSurfaceChange: () => void;
}

/** Result of UV editor construction. */
export interface UvEditorSetupResult {
  uvEditor: UvEditor;
  uvEditorController: UvEditorController;
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
  wireUvEditorRefresh(deps, uvEditor, uvEditorController);
  return { uvEditor, uvEditorController };
}

/**
 * Creates the UV mapping controller with status feedback.
 *
 * @param deps UV editor setup dependencies.
 * @returns Configured UV editor controller.
 */
function createUvEditorController(deps: UvEditorSetupDeps): UvEditorController {
  const controller = new UvEditorController(deps.selectionManager, deps.faceController, deps.commandStack);
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
function createUvEditorUi(deps: UvEditorSetupDeps, controller: UvEditorController): UvEditor {
  return new UvEditor(
    deps.toolbarContainer,
    {
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
    },
    deps.anchorViewport,
  );
}

/**
 * Wires UI refresh when object or face selection changes.
 *
 * @param deps UV editor setup dependencies.
 * @param uvEditor UV editor panel.
 * @param controller UV mapping controller.
 */
function wireUvEditorRefresh(deps: UvEditorSetupDeps, uvEditor: UvEditor, controller: UvEditorController): void {
  controller.setUiRefreshCallback((fields) => {
    uvEditor.setFromFieldState(fields);
  });
  deps.faceController.setFaceSelectionChangedCallback(() => {
    if (!uvEditor.isOpen()) return;
    controller.refreshFromSelection();
  });
}

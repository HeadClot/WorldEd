import { SelectionManager } from '../../selection/object/selection_manager.js';
import { CommandStack } from '../../commands/command_stack.js';
import { FaceExtrusionController } from '../face/face_extrusion_controller.js';
import { TextureBrowser } from '../../ui/texture/texture_browser.js';
import { TextureBrowserController } from '../texture/texture_browser_controller.js';
import { TextureAssignmentController } from '../texture/texture_assignment_controller.js';
import { StatusBar } from '../../ui/status_bar.js';

/** Dependencies for constructing the texture browser floating panel. */
export interface TextureBrowserSetupDeps {
  selectionManager: SelectionManager;
  faceController: FaceExtrusionController;
  commandStack: CommandStack;
  toolbarContainer: HTMLElement;
  anchorViewport: HTMLElement;
  statusBar: StatusBar | null;
  afterSurfaceChange: () => void;
}

/** Result of texture browser construction. */
export interface TextureBrowserSetupResult {
  textureBrowser: TextureBrowser;
  textureBrowserController: TextureBrowserController;
  textureAssignmentController: TextureAssignmentController;
}

/**
 * Creates the texture browser, library controller, and assignment wiring.
 *
 * @param deps Shared services and DOM anchors for the texture browser.
 * @returns Created texture browser instances.
 */
export function setupTextureBrowserPanel(deps: TextureBrowserSetupDeps): TextureBrowserSetupResult {
  const textureAssignmentController = createTextureAssignmentController(deps);
  const controllerHolder: { current: TextureBrowserController | null } = {
    current: null,
  };
  const textureBrowser = createTextureBrowserUi(deps, controllerHolder);
  const textureBrowserController = createTextureBrowserController(deps, textureBrowser, textureAssignmentController);
  controllerHolder.current = textureBrowserController;
  return {
    textureBrowser,
    textureBrowserController,
    textureAssignmentController,
  };
}

/**
 * Creates the texture assignment controller with status feedback.
 *
 * @param deps Texture browser setup dependencies.
 * @returns Configured assignment controller.
 */
function createTextureAssignmentController(deps: TextureBrowserSetupDeps): TextureAssignmentController {
  const controller = new TextureAssignmentController(deps.selectionManager, deps.faceController, deps.commandStack);
  controller.setStatusCallback((message) => {
    deps.statusBar?.setLastAction(message);
  });
  return controller;
}

/**
 * Builds the texture browser panel with deferred controller callbacks.
 *
 * @param deps Texture browser setup dependencies.
 * @param controllerHolder Mutable holder filled after controller construction.
 * @returns Created browser panel.
 */
function createTextureBrowserUi(
  deps: TextureBrowserSetupDeps,
  controllerHolder: { current: TextureBrowserController | null },
): TextureBrowser {
  return new TextureBrowser(
    deps.toolbarContainer,
    {
      onOpenFolder: () => {
        void controllerHolder.current?.openFolder();
      },
      onSelectTexture: (entryId) => {
        controllerHolder.current?.selectTexture(entryId);
      },
    },
    deps.anchorViewport,
  );
}

/**
 * Creates the browser controller and binds status/selection callbacks.
 *
 * @param deps Texture browser setup dependencies.
 * @param browser Texture browser panel.
 * @param assignmentController Texture assignment controller.
 * @returns Configured browser controller.
 */
function createTextureBrowserController(
  deps: TextureBrowserSetupDeps,
  browser: TextureBrowser,
  assignmentController: TextureAssignmentController,
): TextureBrowserController {
  const controller = new TextureBrowserController({ browser });
  controller.setStatusCallback((message) => {
    deps.statusBar?.setLastAction(message);
  });
  controller.setSelectionCallback((entry) => {
    if (!entry) return;
    assignmentController.onTextureSelected(entry);
    deps.afterSurfaceChange();
  });
  return controller;
}

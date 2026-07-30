import { Viewport3D } from '@/viewports/core/viewport_3d.js';
import { Viewport2D } from '@/viewports/core/viewport_2d.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { ToolPrimitiveCreation } from '@/tools/creation/tool_primitive_creation.js';
import { Toolbar } from '@/ui/toolbar/toolbar.js';
import { PanelOutliner } from '@/outliner/ui/panel_outliner.js';
import { PanelProperties } from '@/ui/properties/panel_properties.js';
import { GizmoTransform } from '@/transform/gizmo/gizmo_transform.js';
import { HandlerTransform } from '@/transform/core/handler_transform.js';
import { TransformExecutor } from '@/transform/core/transform_executor.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { CommandStack } from '@/commands/command_stack.js';
import { StatusBar } from '@/ui/status/status_bar.js';
import { CoordinatorFaceMode } from '@/tools/face/coordinator_face_mode.js';
import { SelectionMode } from '@/types/selection_mode.js';
import type { CadRulerSystem } from '@/rulers/system/cad_ruler_system.js';

/** Subsystems exposed for unit tests of the layout manager. */
export interface LayoutTestComponents {
  viewport3D: Viewport3D | null;
  viewport2DTop: Viewport2D | null;
  viewport2DFront: Viewport2D | null;
  viewport2DSide: Viewport2D | null;
  selectionManager: ManagerSelection;
  primitiveTool: ToolPrimitiveCreation;
  toolbar: Toolbar;
  outlinerPanel: PanelOutliner;
  transformGizmo: GizmoTransform;
  transformHandler: HandlerTransform;
  gridSnap: GridSnap;
  propertiesPanel: PanelProperties;
  transformExecutor: TransformExecutor;
  commandStack: CommandStack;
  statusBar: StatusBar | null;
  faceExtrusionController: ReturnType<CoordinatorFaceMode['getFaceExtrusionController']>;
  selectionMode: SelectionMode;
  cadRulerSystem: CadRulerSystem;
}

/**
 * Builds the testing component bag from live layout subsystems.
 *
 * @param parts Live layout references.
 * @returns Object suitable for getComponentsForTesting.
 */
export function buildLayoutTestComponents(parts: {
  viewport3D: Viewport3D | null;
  viewport2DTop: Viewport2D | null;
  viewport2DFront: Viewport2D | null;
  viewport2DSide: Viewport2D | null;
  selectionManager: ManagerSelection;
  primitiveTool: ToolPrimitiveCreation;
  toolbar: Toolbar;
  outlinerPanel: PanelOutliner;
  transformGizmo: GizmoTransform;
  transformHandler: HandlerTransform;
  gridSnap: GridSnap;
  propertiesPanel: PanelProperties;
  transformExecutor: TransformExecutor;
  commandStack: CommandStack;
  statusBar: StatusBar | null;
  faceModeCoordinator: CoordinatorFaceMode;
  cadRulerSystem: CadRulerSystem;
}): LayoutTestComponents {
  return {
    viewport3D: parts.viewport3D,
    viewport2DTop: parts.viewport2DTop,
    viewport2DFront: parts.viewport2DFront,
    viewport2DSide: parts.viewport2DSide,
    selectionManager: parts.selectionManager,
    primitiveTool: parts.primitiveTool,
    toolbar: parts.toolbar,
    outlinerPanel: parts.outlinerPanel,
    transformGizmo: parts.transformGizmo,
    transformHandler: parts.transformHandler,
    gridSnap: parts.gridSnap,
    propertiesPanel: parts.propertiesPanel,
    transformExecutor: parts.transformExecutor,
    commandStack: parts.commandStack,
    statusBar: parts.statusBar,
    faceExtrusionController: parts.faceModeCoordinator.getFaceExtrusionController(),
    selectionMode: parts.faceModeCoordinator.getSelectionMode(),
    cadRulerSystem: parts.cadRulerSystem,
  };
}

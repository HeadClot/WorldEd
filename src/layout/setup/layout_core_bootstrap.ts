import * as THREE from 'three';
import { Theme } from '@/theme.js';
import { ManagerInput } from '@/input/manager_input.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { HandlerHierarchyReparent } from '@/outliner/hierarchy/handler_hierarchy_reparent.js';
import { ToolPrimitiveCreation } from '@/tools/creation/tool_primitive_creation.js';
import { GizmoTransform } from '@/transform/gizmo/gizmo_transform.js';
import { GizmoRaycaster } from '@/transform/gizmo/gizmo_raycaster.js';
import { TransformExecutor } from '@/transform/core/transform_executor.js';
import { HandlerTransform } from '@/transform/core/handler_transform.js';
import { TransformConstraint } from '@/transform/core/transform_constraint.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { ManagerSnap } from '@/transform/snap/manager_snap.js';
import { CommandStack } from '@/commands/command_stack.js';
import { TextureLockSettings } from '@/texture/lock/texture_lock_settings.js';
import { ToolClipPlane } from '@/tools/clip_plane/tool_clip_plane.js';
import { TerrainGenerator } from '@/terrain/terrain_generator.js';
import { DEFAULT_COMMAND_STACK_MAX_SIZE, DEFAULT_GRID_SNAP_INTERVAL } from '@/types/editor_config.js';
import { PolicyEditorOverlay } from '@/tools/overlay/policy_editor_overlay.js';
import { RegistryModalToolSession } from '@/tools/session/registry_modal_tool_session.js';

/** Core editor services created before the DOM shell exists. */
export interface LayoutCoreSystems {
  inputManager: ManagerInput;
  worldObject: THREE.Group;
  selectionManager: ManagerSelection;
  primitiveTool: ToolPrimitiveCreation;
  gridSnap: GridSnap;
  userSnapEnabled: boolean;
  snapManager: ManagerSnap;
  transformConstraint: TransformConstraint;
  transformExecutor: TransformExecutor;
  transformGizmo: GizmoTransform;
  gizmoRaycaster: GizmoRaycaster;
  commandStack: CommandStack;
  transformHandler: HandlerTransform;
  textureLock: TextureLockSettings;
  hierarchyReparentHandler: HandlerHierarchyReparent;
  clipPlaneTool: ToolClipPlane;
  editorOverlayPolicy: PolicyEditorOverlay;
  modalToolSessionRegistry: RegistryModalToolSession;
  terrainGenerator: TerrainGenerator;
  lastTime: number;
  animationFrameId: number | null;
  resizeObserver: ResizeObserver | null;
  isDisposed: boolean;
  isRunning: boolean;
}

/**
 * Constructs core managers that do not depend on DOM layout.
 *
 * @returns Bundle of core editor services and runtime flags.
 */
export function createLayoutCoreSystems(): LayoutCoreSystems {
  const worldObject = new THREE.Group();
  const snapBundle = createSnapAndTransformStack();
  const textureLock = new TextureLockSettings(true, false);
  snapBundle.transformHandler.setTextureLockSettings(textureLock);
  return {
    ...createRuntimeState(),
    ...createSceneRootServices(worldObject, snapBundle.commandStack),
    ...snapBundle,
    textureLock,
    clipPlaneTool: new ToolClipPlane(),
    editorOverlayPolicy: new PolicyEditorOverlay(),
    modalToolSessionRegistry: new RegistryModalToolSession(),
    terrainGenerator: new TerrainGenerator(),
    userSnapEnabled: true,
  };
}

/**
 * Creates runtime loop flags shared by the layout manager.
 *
 * @returns Runtime state fields for core systems.
 */
function createRuntimeState(): Pick<
  LayoutCoreSystems,
  'inputManager' | 'lastTime' | 'animationFrameId' | 'resizeObserver' | 'isDisposed' | 'isRunning'
> {
  return {
    inputManager: new ManagerInput(),
    lastTime: performance.now(),
    animationFrameId: null,
    resizeObserver: null,
    isDisposed: false,
    isRunning: false,
  };
}

/**
 * Creates world root, selection, primitive tool, and hierarchy services.
 *
 * @param worldObject Scene root group.
 * @param commandStack Shared undo stack.
 * @returns Scene hierarchy service fields.
 */
function createSceneRootServices(
  worldObject: THREE.Group,
  commandStack: CommandStack,
): Pick<LayoutCoreSystems, 'worldObject' | 'selectionManager' | 'primitiveTool' | 'hierarchyReparentHandler'> {
  return {
    worldObject,
    selectionManager: new ManagerSelection(),
    primitiveTool: new ToolPrimitiveCreation(worldObject),
    hierarchyReparentHandler: new HandlerHierarchyReparent(worldObject, commandStack),
  };
}

/**
 * Creates grid snap, command stack, and transform gizmo services.
 *
 * @returns Snap and transform subsystem bundle.
 */
function createSnapAndTransformStack(): Pick<
  LayoutCoreSystems,
  | 'gridSnap'
  | 'snapManager'
  | 'transformConstraint'
  | 'transformExecutor'
  | 'transformGizmo'
  | 'gizmoRaycaster'
  | 'commandStack'
  | 'transformHandler'
> {
  const gridSnap = new GridSnap(true, DEFAULT_GRID_SNAP_INTERVAL);
  const transformGizmo = new GizmoTransform(Theme);
  const gizmoRaycaster = new GizmoRaycaster();
  const transformConstraint = new TransformConstraint();
  const transformExecutor = new TransformExecutor(gridSnap);
  const commandStack = new CommandStack(DEFAULT_COMMAND_STACK_MAX_SIZE);
  return {
    gridSnap,
    snapManager: new ManagerSnap(DEFAULT_GRID_SNAP_INTERVAL),
    transformConstraint,
    transformExecutor,
    transformGizmo,
    gizmoRaycaster,
    commandStack,
    transformHandler: new HandlerTransform(
      transformGizmo,
      gizmoRaycaster,
      transformExecutor,
      transformConstraint,
      commandStack,
    ),
  };
}

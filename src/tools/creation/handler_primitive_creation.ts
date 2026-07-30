import * as THREE from 'three';
import { ToolPrimitiveCreation } from './tool_primitive_creation.js';
import { CommandCreatePrimitive } from '@/tools/creation/commands/command_create_primitive.js';
import { CommandStack } from '@/commands/command_stack.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import {
  computeOcclusionAwareSpawnPosition,
  DEFAULT_SPAWN_DISTANCE,
} from '@/navigation/placement/object_spawn_placement.js';

/** Callback invoked after a primitive is created and added to the scene. */
export type PrimitiveCreatedCallback = () => void;

/**
 * Handles toolbar button actions for creating primitive objects. Delegates
 * primitive creation to the PrimitiveCreationTool and manages command stacking,
 * viewport sync, and selection updates.
 */
export class HandlerPrimitiveCreation {
  private primitiveTool: ToolPrimitiveCreation;
  private worldObject: THREE.Group;
  private commandStack: CommandStack;
  private selectionManager: ManagerSelection;
  private onPrimitiveCreated: PrimitiveCreatedCallback | null;
  private getActiveCamera: (() => THREE.Camera | null) | null;
  private getGridInterval: (() => number) | null;

  /**
   * Creates a new primitive creation handler.
   *
   * @param primitiveTool The tool that creates primitive meshes.
   * @param worldObject The root group that receives new primitives.
   * @param commandStack The command stack for undo support.
   * @param selectionManager The selection manager for post-creation selection.
   */
  constructor(
    primitiveTool: ToolPrimitiveCreation,
    worldObject: THREE.Group,
    commandStack: CommandStack,
    selectionManager: ManagerSelection,
  ) {
    this.primitiveTool = primitiveTool;
    this.worldObject = worldObject;
    this.commandStack = commandStack;
    this.selectionManager = selectionManager;
    this.onPrimitiveCreated = null;
    this.getActiveCamera = null;
    this.getGridInterval = null;
  }

  /**
   * Sets the callback invoked after any primitive is created.
   *
   * @param callback The function to call after primitive creation.
   */
  setOnPrimitiveCreated(callback: PrimitiveCreatedCallback | null): void {
    this.onPrimitiveCreated = callback;
  }

  /**
   * Provides the active view camera used for spawn placement.
   *
   * @param callback Returns the camera, or null when unavailable.
   */
  setActiveCameraProvider(callback: (() => THREE.Camera | null) | null): void {
    this.getActiveCamera = callback;
  }

  /**
   * Provides the current grid interval for snapping spawn positions.
   *
   * @param callback Returns a positive grid step.
   */
  setGridIntervalProvider(callback: (() => number) | null): void {
    this.getGridInterval = callback;
  }

  /** Creates a cube primitive and registers it with the command stack. */
  createCube(): void {
    this.createPrimitive(() => this.primitiveTool.createBox(1, 1, 1), 0.5);
  }

  /** Creates a sphere primitive and registers it with the command stack. */
  createSphere(): void {
    this.createPrimitive(() => this.primitiveTool.createSphere(0.5), 0.5);
  }

  /** Creates a cylinder primitive and registers it with the command stack. */
  createCylinder(): void {
    this.createPrimitive(() => this.primitiveTool.createCylinder(0.5, 0.5, 1), 0.5);
  }

  /** Creates a plane primitive and registers it with the command stack. */
  createPlane(): void {
    this.createPrimitive(() => this.primitiveTool.createPlane(2, 2), 1);
  }

  /**
   * Generic primitive creation flow with view-ray, grid-snapped placement.
   *
   * @param factory Function that creates the primitive mesh.
   * @param objectRadius Approximate half-extent used for wall clearance.
   */
  private createPrimitive(factory: () => THREE.Mesh, objectRadius: number): void {
    const mesh = factory();
    this.applySpawnPlacement(mesh, objectRadius);
    const command = new CommandCreatePrimitive(mesh, this.worldObject);
    this.commandStack.push(command);
    this.onPrimitiveCreatedCallback();
    this.selectionManager.selectObject(mesh);
  }

  /**
   * Positions a mesh in front of the active camera, snapped to the grid, and
   * pulled forward when geometry occludes the preferred spawn distance.
   *
   * @param mesh Newly created mesh to position.
   * @param objectRadius Approximate half-extent for surface clearance.
   */
  private applySpawnPlacement(mesh: THREE.Mesh, objectRadius: number): void {
    const camera = this.getActiveCamera?.() ?? null;
    if (!camera) {
      mesh.position.set(0, 0, 0);
      return;
    }
    const gridInterval = this.getGridInterval?.() ?? 1;
    const spawn = computeOcclusionAwareSpawnPosition({
      camera,
      preferredDistance: DEFAULT_SPAWN_DISTANCE,
      gridInterval,
      raycastRoot: this.worldObject,
      objectRadius,
    });
    mesh.position.copy(spawn);
  }

  /** Triggers the viewport sync and outliner refresh after primitive creation. */
  private onPrimitiveCreatedCallback(): void {
    if (this.onPrimitiveCreated) {
      this.onPrimitiveCreated();
    }
  }
}

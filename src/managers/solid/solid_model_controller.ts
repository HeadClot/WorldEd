import * as THREE from 'three';
import { CommandStack } from '../../commands/command_stack.js';
import { CreateSolidModelCommand } from '../../commands/create/create_solid_model_command.js';
import { AddSolidBoxBrushCommand } from '../../commands/solid/add_solid_box_brush_command.js';
import { SetSolidBrushOperationCommand } from '../../commands/solid/set_solid_brush_operation_command.js';
import { ReorderSolidBrushesCommand, SolidBrushOrderEnd } from '../../commands/solid/reorder_solid_brushes_command.js';
import { SelectionManager } from '../../selection/object/selection_manager.js';
import { SolidModel } from '../../solid/model/solid_model.js';
import { SolidModelPanel } from '../../ui/solid_model_panel.js';
import { SolidOperation } from '../../solid/types/solid_operation.js';
import { SolidBrushVisual } from '../../solid/model/solid_brush_visual.js';
import { computeBrushSpawnPosition, snapPositionToGrid } from '../../solid/model/brush_spawn_placement.js';
import { TextureLockSettings } from '../../texture/lock/texture_lock_settings.js';
import type { TextureLockFlags } from '../../texture/lock/texture_lock_transform.js';
import { TransformMode } from '../../types/transform_mode.js';

/** Coordinates solid model creation, hierarchy brushes, and rebuild after edits. */
export class SolidModelController {
  private worldObject: THREE.Group;
  private commandStack: CommandStack;
  private selectionManager: SelectionManager;
  private panel: SolidModelPanel;
  private textureLock: TextureLockSettings | null;
  private getTransformMode: (() => TransformMode) | null;
  private syncViewports: (() => void) | null;
  private refreshOutliner: (() => void) | null;
  private showStatus: ((message: string) => void) | null;
  private getActiveCamera: (() => THREE.Camera | null) | null;
  private getGridInterval: (() => number) | null;
  private solidModelCounter: number;
  /** True while a live CSG flush is scheduled on requestAnimationFrame. */
  private liveRebuildQueued: boolean;
  /** True while rebuildLive is running (may span multiple frames of wall time). */
  private liveRebuildInProgress: boolean;
  /** Latest meshes from transform drag; always the most recent pointer sample. */
  private pendingLiveMeshes: THREE.Mesh[] | null;
  /**
   * Increments on every live transform sample. Compared to builtLiveGeneration
   * so moves that arrive during a long CSG flush schedule a catch-up rebuild.
   */
  private liveTransformGeneration: number;
  /** Generation last successfully applied to solid result geometry. */
  private builtLiveGeneration: number;
  /** Invalidates in-flight rAF callbacks superseded by a sync flush. */
  private liveFlushToken: number;
  private onLiveGeometryUpdated: ((meshes: THREE.Mesh[]) => void) | null;
  /**
   * Last solid model the user worked with. Kept when selection is cleared (e.g.
   * after deleting a brush) so + Box Brush still has a target model.
   */
  private lastActiveModel: SolidModel | null;
  private readonly selectionChangedHandler: () => void;

  /**
   * Creates a solid model controller.
   *
   * @param worldObject Scene root group.
   * @param commandStack Undo stack.
   * @param selectionManager Selection manager.
   * @param panel Solid model tools panel.
   */
  constructor(
    worldObject: THREE.Group,
    commandStack: CommandStack,
    selectionManager: SelectionManager,
    panel: SolidModelPanel,
  ) {
    this.worldObject = worldObject;
    this.commandStack = commandStack;
    this.selectionManager = selectionManager;
    this.panel = panel;
    this.textureLock = null;
    this.getTransformMode = null;
    this.syncViewports = null;
    this.refreshOutliner = null;
    this.showStatus = null;
    this.getActiveCamera = null;
    this.getGridInterval = null;
    this.solidModelCounter = 0;
    this.liveRebuildQueued = false;
    this.liveRebuildInProgress = false;
    this.pendingLiveMeshes = null;
    this.liveTransformGeneration = 0;
    this.builtLiveGeneration = 0;
    this.liveFlushToken = 0;
    this.onLiveGeometryUpdated = null;
    this.lastActiveModel = null;
    this.selectionChangedHandler = () => this.onSelectionChanged();
    this.selectionManager.onSelectionChanged(this.selectionChangedHandler);
  }

  /**
   * Sets a callback that pushes live result geometry into viewport clones.
   *
   * @param callback Receives updated result meshes after a live rebuild.
   */
  setOnLiveGeometryUpdated(callback: ((meshes: THREE.Mesh[]) => void) | null): void {
    this.onLiveGeometryUpdated = callback;
  }

  /**
   * Sets viewport sync callback after scene changes.
   *
   * @param callback Sync function.
   */
  setSyncViewports(callback: () => void): void {
    this.syncViewports = callback;
  }

  /**
   * Sets outliner refresh callback.
   *
   * @param callback Refresh function.
   */
  setRefreshOutliner(callback: () => void): void {
    this.refreshOutliner = callback;
  }

  /**
   * Sets status message callback.
   *
   * @param callback Status function.
   */
  setShowStatus(callback: (message: string) => void): void {
    this.showStatus = callback;
  }

  /**
   * Sets shared texture lock settings used when solid brushes are transformed.
   *
   * @param settings Texture lock settings, or null to leave UVs world-sliding.
   */
  setTextureLockSettings(settings: TextureLockSettings | null): void {
    this.textureLock = settings;
  }

  /**
   * Sets a provider for the active transform gizmo mode. Used so rotation
   * always applies full texture stick regardless of toolbar lock toggles.
   *
   * @param provider Returns the current TransformMode, or null to clear.
   */
  setTransformModeProvider(provider: (() => TransformMode) | null): void {
    this.getTransformMode = provider;
  }

  /**
   * Provides the active view camera for placing new brushes in view.
   *
   * @param callback Returns the camera used for spawn placement, or null.
   */
  setActiveCameraProvider(callback: (() => THREE.Camera | null) | null): void {
    this.getActiveCamera = callback;
  }

  /**
   * Provides the current grid interval for snapping new brush placement.
   *
   * @param callback Returns a positive grid step.
   */
  setGridIntervalProvider(callback: (() => number) | null): void {
    this.getGridInterval = callback;
  }

  /** Creates a solid model with one additive box brush and selects that brush. */
  createSolidModel(): void {
    this.solidModelCounter += 1;
    const model = new SolidModel(`SolidModel${this.padNumber(this.solidModelCounter)}`);
    const brush = model.addBoxBrush(2, SolidOperation.Additive);
    this.placeModelInScene(model, brush.mesh ?? model.root, `Created ${model.root.name}`);
  }

  /**
   * Adds an already-built solid model (e.g. VMF import) with undo support.
   *
   * @param model Solid model ready for the scene.
   * @param statusMessage Optional status text after placement.
   */
  placeImportedModel(model: SolidModel, statusMessage?: string): void {
    this.solidModelCounter += 1;
    const firstBrush = model.getBrushes()[0];
    const selectTarget = firstBrush?.mesh ?? model.root;
    const message = statusMessage ?? `Imported ${model.root.name} (${model.getBrushCount()} brushes)`;
    this.placeModelInScene(model, selectTarget, message);
  }

  /**
   * Pushes a create command, selects a target, and refreshes UI.
   *
   * @param model Solid model to parent under the world.
   * @param selectTarget Object to select after placement.
   * @param statusMessage Status bar text.
   */
  private placeModelInScene(model: SolidModel, selectTarget: THREE.Object3D, statusMessage: string): void {
    const command = new CreateSolidModelCommand(model, this.worldObject);
    this.commandStack.push(command);
    this.selectionManager.selectObject(selectTarget);
    this.rememberActiveModel(model);
    this.syncViewports?.();
    this.refreshOutliner?.();
    this.showStatus?.(statusMessage);
  }

  /** Toggles the solid model panel visibility. */
  togglePanel(): void {
    this.panel.toggle();
    if (this.panel.isOpen()) {
      this.bindPanelToSelection();
    }
  }

  /**
   * Adds a box brush under the active solid model and selects it. Spawns
   * grid-aligned in front of the active camera (model-local space).
   */
  addBoxBrush(): void {
    const model = this.resolveActiveModel();
    if (!model) {
      this.showStatus?.('Select a solid model or brush first');
      return;
    }
    const offset = this.computeNewBrushLocalPosition(model);
    const command = new AddSolidBoxBrushCommand(model, 2, SolidOperation.Additive, offset);
    this.commandStack.push(command);
    const brush = command.getCreatedBrush();
    if (brush?.mesh) {
      this.selectionManager.selectObject(brush.mesh);
    }
    this.panel.refresh();
    this.syncViewports?.();
    this.refreshOutliner?.();
    this.showStatus?.(`Added ${brush?.name ?? 'brush'}`);
  }

  /**
   * Sets the CSG operation on solid brush meshes (undoable, batched).
   *
   * @param meshes Brush preview meshes.
   * @param operation New operation.
   */
  setBrushOperationForMeshes(meshes: THREE.Mesh[], operation: SolidOperation): void {
    if (meshes.length === 0) return;
    const command = new SetSolidBrushOperationCommand(meshes, operation);
    this.commandStack.push(command);
    this.panel.refresh();
    this.syncViewports?.();
    this.showStatus?.('Updated brush operation');
  }

  /**
   * Sets the CSG operation on a single brush mesh (undoable).
   *
   * @param mesh Brush preview mesh.
   * @param operation New operation.
   */
  setBrushOperationForMesh(mesh: THREE.Mesh, operation: SolidOperation): void {
    this.setBrushOperationForMeshes([mesh], operation);
  }

  /**
   * After transform tools or inspector edits finish, finalize affected solids.
   * Uses a light commit when live CSG already updated geometry (avoids a full
   * second compile and full viewport reclone on pointer-up).
   *
   * @param selectedMeshes Meshes that were edited.
   * @returns True when only solid-model meshes were handled (caller may skip
   *   full sync).
   */
  onTransformsCommitted(selectedMeshes: THREE.Mesh[]): boolean {
    // Invalidate any scheduled live rAF; commit will re-pull transforms and compile once.
    this.liveFlushToken += 1;
    this.liveRebuildQueued = false;
    this.pendingLiveMeshes = null;
    this.builtLiveGeneration = this.liveTransformGeneration;
    const models = this.collectAffectedModels(selectedMeshes);
    if (models.size === 0) return false;
    const selectedSet = new Set(selectedMeshes);
    const updatedResults: THREE.Mesh[] = [];
    for (const model of models) {
      this.finalizeModelAfterTransform(model, selectedSet);
      updatedResults.push(model.getResultMeshForSync());
    }
    this.panel.refresh();
    this.onLiveGeometryUpdated?.(updatedResults);
    this.refreshOutliner?.();
    return this.selectionIsSolidOnly(selectedMeshes);
  }

  /**
   * Moves selected solid brushes to first or last CSG evaluation order
   * (undoable).
   *
   * @param meshes Brush preview meshes.
   * @param end Target end of the evaluation list.
   */
  moveBrushesInOrder(meshes: THREE.Mesh[], end: SolidBrushOrderEnd): void {
    const brushMeshes = meshes.filter((mesh) => SolidBrushVisual.isBrushObject(mesh));
    if (brushMeshes.length === 0) return;
    const command = new ReorderSolidBrushesCommand(brushMeshes, end);
    this.commandStack.push(command);
    this.panel.refresh();
    this.syncViewports?.();
    this.refreshOutliner?.();
    this.showStatus?.(end === 'first' ? 'Moved brush to first in CSG order' : 'Moved brush to last in CSG order');
  }

  /**
   * Live CSG update while a solid brush is dragged. Coalesces to one rebuild
   * per animation frame, but never drops samples that arrive while CSG is still
   * running — those schedule a catch-up flush.
   *
   * @param selectedMeshes Meshes currently being transformed.
   */
  onTransformsLive(selectedMeshes: THREE.Mesh[]): void {
    if (!this.involvesSolidModels(selectedMeshes)) return;
    this.pendingLiveMeshes = selectedMeshes;
    this.liveTransformGeneration += 1;
    this.scheduleLiveRebuild();
  }

  /**
   * Returns true when any selected mesh belongs to a solid model.
   *
   * @param meshes Candidate meshes.
   * @returns True when solid rebuild may be needed.
   */
  involvesSolidModels(meshes: THREE.Mesh[]): boolean {
    return meshes.some((mesh) => SolidModel.fromObject(mesh) !== null);
  }

  /** Schedules a live CSG flush on the next animation frame when idle. */
  private scheduleLiveRebuild(): void {
    if (this.liveRebuildQueued || this.liveRebuildInProgress) return;
    this.liveRebuildQueued = true;
    const token = ++this.liveFlushToken;
    requestAnimationFrame(() => {
      if (token !== this.liveFlushToken) return;
      this.flushLiveRebuild();
    });
  }

  /**
   * Applies the latest pending brush transforms into solid result geometry.
   * Re-queues itself when newer samples arrived during a long compile.
   */
  private flushLiveRebuild(): void {
    this.liveRebuildQueued = false;
    const meshes = this.pendingLiveMeshes;
    if (!meshes || meshes.length === 0) return;
    const generationAtStart = this.liveTransformGeneration;
    this.liveRebuildInProgress = true;
    const models = this.collectAffectedModels(meshes);
    const updatedResults: THREE.Mesh[] = [];
    const locks = this.getTextureLockFlagsForActiveTransform();
    try {
      for (const model of models) {
        model.setUvStickToBrush(locks.positionLock || locks.stretchLock);
        if (!model.prepareLiveBrushEdit(meshes, locks)) continue;
        model.rebuildLive();
        updatedResults.push(model.getResultMeshForSync());
      }
    } finally {
      this.liveRebuildInProgress = false;
      this.builtLiveGeneration = generationAtStart;
    }
    if (updatedResults.length > 0) {
      this.onLiveGeometryUpdated?.(updatedResults);
    }
    if (this.liveTransformGeneration !== this.builtLiveGeneration) {
      this.scheduleLiveRebuild();
    }
  }

  /** Reacts to scene selection changes by binding the tools panel. */
  private onSelectionChanged(): void {
    this.bindPanelToSelection();
  }

  /**
   * Binds the tools panel to the solid model owning the current selection. Does
   * not clear the last active model when selection is empty (post-delete).
   */
  private bindPanelToSelection(): void {
    const selectedModel = this.findSelectedSolidModel();
    if (selectedModel) {
      this.rememberActiveModel(selectedModel);
      return;
    }
    const remembered = this.resolveRememberedModel();
    if (remembered) {
      this.panel.setModel(remembered);
    }
  }

  /**
   * Finds a solid model from the current selection.
   *
   * @returns Solid model or null.
   */
  private findSelectedSolidModel(): SolidModel | null {
    for (const mesh of this.selectionManager.getSelectedObjects()) {
      const model = SolidModel.fromObject(mesh);
      if (model) return model;
    }
    return null;
  }

  /**
   * Resolves the active model from selection, panel, or last remembered model.
   *
   * @returns Solid model or null.
   */
  private resolveActiveModel(): SolidModel | null {
    const selected = this.findSelectedSolidModel();
    if (selected) {
      this.rememberActiveModel(selected);
      return selected;
    }
    const fromPanel = this.panel.getModel();
    if (fromPanel && this.isModelStillInScene(fromPanel)) {
      this.lastActiveModel = fromPanel;
      return fromPanel;
    }
    return this.resolveRememberedModel();
  }

  /**
   * Stores a model as the current working solid for tools and the panel.
   *
   * @param model Solid model to remember.
   */
  private rememberActiveModel(model: SolidModel): void {
    this.lastActiveModel = model;
    this.panel.setModel(model);
  }

  /**
   * Returns the last active model when it is still parented in the world.
   *
   * @returns Solid model or null.
   */
  private resolveRememberedModel(): SolidModel | null {
    if (!this.lastActiveModel) return null;
    if (!this.isModelStillInScene(this.lastActiveModel)) {
      this.lastActiveModel = null;
      return null;
    }
    return this.lastActiveModel;
  }

  /**
   * Returns whether a solid model root is still attached under the world.
   *
   * @param model Candidate solid model.
   * @returns True when the model can still receive new brushes.
   */
  private isModelStillInScene(model: SolidModel): boolean {
    let current: THREE.Object3D | null = model.root;
    while (current) {
      if (current === this.worldObject) return true;
      current = current.parent;
    }
    return false;
  }

  /**
   * Collects unique solid models touched by the given meshes.
   *
   * @param meshes Edited meshes.
   * @returns Set of solid models.
   */
  private collectAffectedModels(meshes: THREE.Mesh[]): Set<SolidModel> {
    const models = new Set<SolidModel>();
    for (const mesh of meshes) {
      const model = SolidModel.fromObject(mesh);
      if (model) models.add(model);
    }
    return models;
  }

  /**
   * Applies post-transform rules for one solid model and finalizes geometry.
   * Prefer selected-brush sync + interactive finalize over a forced full
   * rebuild.
   *
   * @param model Solid model.
   * @param selectedSet Selected meshes from the edit.
   */
  private finalizeModelAfterTransform(model: SolidModel, selectedSet: Set<THREE.Mesh>): void {
    const result = model.getResultMesh();
    const resultSelected = selectedSet.has(result);
    const selectedBrushMeshes = model
      .getBrushes()
      .map((brush) => brush.mesh)
      .filter((mesh): mesh is THREE.Mesh => !!mesh && selectedSet.has(mesh));
    if (resultSelected && selectedBrushMeshes.length === 0) {
      this.bakeResultTransformIntoRoot(model);
      model.markDirty();
      model.rebuild(true);
      return;
    }
    if (resultSelected) {
      this.resetResultLocalTransform(result);
    }
    const locks = this.getTextureLockFlagsForActiveTransform();
    model.setUvStickToBrush(locks.positionLock || locks.stretchLock);
    if (selectedBrushMeshes.length > 0) {
      // Always re-pull and dirty selected brushes so commit cannot trust a stale live mesh.
      model.prepareLiveBrushEdit(selectedBrushMeshes, locks);
    } else {
      model.syncBrushesFromScene(locks);
    }
    model.finalizeAfterInteractiveEdit();
  }

  /**
   * Returns current position/stretch lock flags from the toolbar settings.
   *
   * @returns Lock flags (both off when settings are missing).
   */
  private getTextureLockFlags(): TextureLockFlags {
    if (!this.textureLock) {
      return { positionLock: false, stretchLock: false };
    }
    return this.textureLock.getFlags();
  }

  /**
   * Lock flags for live/commit solid brush transforms. Rotation always forces
   * both locks on so UVs stick sensibly during free orbit.
   *
   * @returns Effective texture lock flags for the current gizmo mode.
   */
  private getTextureLockFlagsForActiveTransform(): TextureLockFlags {
    const mode = this.getTransformMode?.() ?? null;
    if (mode === TransformMode.ROTATE) {
      return { positionLock: true, stretchLock: true };
    }
    return this.getTextureLockFlags();
  }

  /**
   * Returns whether every selected mesh belongs to a solid model hierarchy.
   *
   * @param meshes Selection to inspect.
   * @returns True when a full world reclone can be skipped after solid commit.
   */
  private selectionIsSolidOnly(meshes: THREE.Mesh[]): boolean {
    if (meshes.length === 0) return false;
    return meshes.every((mesh) => SolidModel.fromObject(mesh) !== null);
  }

  /**
   * Computes a grid-snapped local position for a new brush under a solid model.
   * Uses the active camera forward when available; otherwise model origin.
   *
   * @param model Target solid model.
   * @returns Local position relative to the solid model root.
   */
  private computeNewBrushLocalPosition(model: SolidModel): THREE.Vector3 {
    const gridInterval = this.getGridInterval?.() ?? 1;
    const camera = this.getActiveCamera?.() ?? null;
    if (!camera) {
      return new THREE.Vector3(0, 0, 0);
    }
    // World point in front of camera, then snap in model-local space.
    const worldPosition = computeBrushSpawnPosition(camera, 8);
    model.root.updateMatrixWorld(true);
    const localPosition = model.root.worldToLocal(worldPosition);
    snapPositionToGrid(localPosition, gridInterval);
    return localPosition;
  }

  /**
   * Bakes a lone result-mesh transform into the solid model root.
   *
   * @param model Solid model whose result was moved alone.
   */
  private bakeResultTransformIntoRoot(model: SolidModel): void {
    const root = model.root;
    const result = model.getResultMesh();
    const resultMatrix = new THREE.Matrix4().compose(
      result.position.clone(),
      new THREE.Quaternion().setFromEuler(result.rotation),
      result.scale.clone(),
    );
    root.updateMatrix();
    const combined = new THREE.Matrix4().copy(root.matrix).multiply(resultMatrix);
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    combined.decompose(position, quaternion, scale);
    root.position.copy(position);
    root.quaternion.copy(quaternion);
    root.scale.copy(scale);
    root.rotation.setFromQuaternion(quaternion);
    this.resetResultLocalTransform(result);
  }

  /**
   * Resets the result mesh to local identity under the solid model root.
   *
   * @param result Result mesh.
   */
  private resetResultLocalTransform(result: THREE.Mesh): void {
    result.position.set(0, 0, 0);
    result.rotation.set(0, 0, 0);
    result.scale.set(1, 1, 1);
  }

  /**
   * Pads a number to two digits.
   *
   * @param value Number to pad.
   * @returns Zero-padded string.
   */
  private padNumber(value: number): string {
    return value < 10 ? `0${value}` : String(value);
  }
}

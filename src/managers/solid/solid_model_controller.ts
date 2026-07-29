import * as THREE from 'three';
import { CommandStack } from '../../commands/command_stack.js';
import { CreateSolidModelCommand } from '../../commands/create/create_solid_model_command.js';
import { AddSolidBoxBrushCommand } from '../../commands/solid/add_solid_box_brush_command.js';
import { SetSolidBrushOperationCommand } from '../../commands/solid/set_solid_brush_operation_command.js';
import { SetSolidGroupOperationCommand } from '../../commands/solid/set_solid_group_operation_command.js';
import { ReorderSolidBrushesCommand, SolidBrushOrderEnd } from '../../commands/solid/reorder_solid_brushes_command.js';
import { SelectionManager } from '../../selection/object/selection_manager.js';
import { SolidModel } from '../../solid/model/solid_model.js';
import { SolidModelPanel } from '../../ui/solid_model_panel.js';
import { SolidOperation } from '../../solid/types/solid_operation.js';
import { SolidBrushVisual } from '../../solid/model/solid_brush_visual.js';
import { findSolidModelRoot, isSolidCsgGroup, isValidSolidTreeParent } from '../../solid/model/solid_group.js';
import { DEFAULT_STARTUP_BRUSH_SIZE } from '../../solid/model/default_startup_solid_model.js';
import { computeOcclusionAwareSpawnPosition, DEFAULT_SPAWN_DISTANCE } from '../../navigation/object_spawn_placement.js';
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
  /**
   * Last solid hierarchy parent used for new brushes (solid root or CSG group).
   * Updated from selection so + Box Brush appends under the current context.
   */
  private lastBrushInsertParent: THREE.Object3D | null;
  /**
   * Pre-drag solid-root matrices used when baking residual result-mesh pose
   * into the root so repeated live samples do not compound.
   */
  private readonly solidRootBakeBaselines = new WeakMap<SolidModel, THREE.Matrix4>();
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
    this.lastBrushInsertParent = null;
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
    const brush = model.addBoxBrush(DEFAULT_STARTUP_BRUSH_SIZE, SolidOperation.Additive);
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
   * Adopts the first solid model already parented under the world as the
   * working context (startup default solid). Does not push undo or change
   * selection.
   *
   * @returns True when a solid model was found and remembered.
   */
  adoptFirstSolidModelInWorld(): boolean {
    const model = this.findFirstSolidModelInWorld();
    if (!model) return false;
    this.rememberActiveModel(model);
    return true;
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
    if (selectTarget instanceof THREE.Mesh) {
      this.selectionManager.selectObject(selectTarget);
    }
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
   * grid-aligned in front of the active camera (model-local space). Appends
   * under the most recently selected solid parent (CSG group or solid root).
   */
  addBoxBrush(): void {
    const model = this.resolveActiveModel();
    if (!model) {
      this.showStatus?.('Select a solid model or brush first');
      return;
    }
    const parent = this.resolveBrushInsertParent(model);
    const offset = this.computeNewBrushLocalPosition(model);
    const command = new AddSolidBoxBrushCommand(
      model,
      DEFAULT_STARTUP_BRUSH_SIZE,
      SolidOperation.Additive,
      offset,
      parent,
    );
    this.commandStack.push(command);
    const brush = command.getCreatedBrush();
    if (brush?.mesh) {
      this.selectionManager.selectObject(brush.mesh);
      this.lastBrushInsertParent = brush.mesh.parent;
    }
    this.panel.refresh();
    this.syncViewports?.();
    // Selection change already reveals/refreshes the outliner for the new brush.
    // A second full tree pass is unnecessary for large solid models.
    if (!brush?.mesh) {
      this.refreshOutliner?.();
    }
    this.showStatus?.(`Added ${brush?.name ?? 'brush'}`);
  }

  /**
   * Enables or disables inverted-world CSG on the solid model owning the
   * current selection (or the last active solid). Rebuilds immediately.
   *
   * @param inverted True when CSG starts solid so subtractives carve rooms.
   */
  setInvertedWorldForSelection(inverted: boolean): void {
    const model = this.resolveActiveModel();
    if (!model) {
      this.showStatus?.('Select a solid model or brush first');
      return;
    }
    if (model.isInvertedWorld() === inverted) return;
    model.setInvertedWorld(inverted);
    this.rememberActiveModel(model);
    this.panel.refresh();
    this.syncViewports?.();
    this.refreshOutliner?.();
    this.showStatus?.(inverted ? 'Inverted world enabled' : 'Inverted world disabled');
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
    this.refreshOutliner?.();
    this.showStatus?.('Updated brush operation');
  }

  /**
   * Sets the CSG operation on solid compound groups (undoable, batched).
   *
   * @param groups Solid CSG groups.
   * @param operation New operation for the compound branch.
   */
  setGroupOperationForGroups(groups: THREE.Group[], operation: SolidOperation): void {
    if (groups.length === 0) return;
    const command = new SetSolidGroupOperationCommand(groups, operation);
    this.commandStack.push(command);
    this.panel.refresh();
    this.syncViewports?.();
    this.refreshOutliner?.();
    this.showStatus?.('Updated group operation');
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
    this.clearSolidRootBakeBaselines(models);
    this.panel.refresh();
    this.onLiveGeometryUpdated?.(updatedResults);
    this.refreshOutliner?.();
    return this.selectionIsSolidOnly(selectedMeshes);
  }

  /**
   * Moves selected solid brushes and solid CSG groups to first or last among
   * siblings under their own parent (undoable). Each parent tree is handled
   * independently so multi-select does not flatten hierarchy.
   *
   * @param nodes Brush meshes and/or solid CSG groups.
   * @param end Target end among siblings under each node's parent.
   */
  moveBrushesInOrder(nodes: THREE.Object3D[], end: SolidBrushOrderEnd): void {
    const reorderNodes = nodes.filter((node) => SolidBrushVisual.isBrushObject(node) || isSolidCsgGroup(node));
    if (reorderNodes.length === 0) return;
    const command = new ReorderSolidBrushesCommand(reorderNodes, end);
    this.commandStack.push(command);
    this.panel.refresh();
    this.syncViewports?.();
    this.refreshOutliner?.();
    this.showStatus?.(
      end === 'first' ? 'Moved selection to first in hierarchy order' : 'Moved selection to last in hierarchy order',
    );
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
    if (this.tryBakeSolidRootTransformsLive(selectedMeshes)) {
      return;
    }
    this.pendingLiveMeshes = selectedMeshes;
    this.liveTransformGeneration += 1;
    this.scheduleLiveRebuild();
  }

  /**
   * Immediately bakes solid result mesh transforms into solid roots when only
   * result meshes are selected (no CSG rebuild required).
   *
   * @param selectedMeshes Current transform selection.
   * @returns True when all affected models were handled by root bake.
   */
  private tryBakeSolidRootTransformsLive(selectedMeshes: THREE.Mesh[]): boolean {
    const selectedSet = new Set(selectedMeshes);
    const models = this.collectAffectedModels(selectedMeshes);
    if (models.size === 0) return false;
    let handledAll = true;
    const updatedResults: THREE.Mesh[] = [];
    for (const model of models) {
      if (this.bakeSolidRootTransformIfOnlyResultSelected(model, selectedSet)) {
        updatedResults.push(model.getResultMeshForSync());
        continue;
      }
      handledAll = false;
    }
    if (updatedResults.length > 0) {
      this.onLiveGeometryUpdated?.(updatedResults);
    }
    return handledAll;
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

  /**
   * When only the solid result mesh is selected, folds its local transform into
   * the solid model root so the whole solid moves without a CSG rebuild.
   *
   * @param model Solid model.
   * @param selectedSet Selected meshes.
   * @returns True when a root bake was applied.
   */
  private bakeSolidRootTransformIfOnlyResultSelected(model: SolidModel, selectedSet: Set<THREE.Mesh>): boolean {
    const result = model.getResultMesh();
    if (!selectedSet.has(result)) return false;
    const brushSelected = model.getBrushes().some((brush) => brush.mesh && selectedSet.has(brush.mesh));
    if (brushSelected) return false;
    this.bakeResultTransformIntoRoot(model);
    return true;
  }

  /** Reacts to scene selection changes by binding the tools panel. */
  private onSelectionChanged(): void {
    this.bindPanelToSelection();
    this.updateBrushInsertParentFromSelection();
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
   * Resolves where a new box brush should be parented under the active solid.
   * Prefers the current selection (brush parent or selected CSG group), then
   * the last remembered parent still valid for this model.
   *
   * @param model Active solid model.
   * @returns Solid root or solid CSG group.
   */
  private resolveBrushInsertParent(model: SolidModel): THREE.Object3D {
    const fromSelection = this.resolveBrushInsertParentFromSelection(model);
    if (fromSelection) {
      this.lastBrushInsertParent = fromSelection;
      return fromSelection;
    }
    if (this.lastBrushInsertParent && this.isValidBrushInsertParent(model, this.lastBrushInsertParent)) {
      return this.lastBrushInsertParent;
    }
    return model.root;
  }

  /**
   * Derives an insert parent from the current selection under a solid model.
   *
   * @param model Active solid model.
   * @returns Parent object, or null when selection does not imply one.
   */
  private resolveBrushInsertParentFromSelection(model: SolidModel): THREE.Object3D | null {
    const lastMesh = this.selectionManager.getLastSelectedObject();
    if (lastMesh) {
      const fromMesh = this.brushInsertParentFromObject(model, lastMesh);
      if (fromMesh) return fromMesh;
    }
    for (const object of this.selectionManager.getInspectorObjects()) {
      const fromObject = this.brushInsertParentFromObject(model, object);
      if (fromObject) return fromObject;
    }
    return null;
  }

  /**
   * Maps a selected object to a brush insert parent under the given model.
   * Brushes contribute their parent; solid CSG groups and the solid root are
   * used directly.
   *
   * @param model Active solid model.
   * @param object Selected hierarchy object.
   * @returns Insert parent, or null when the object is not under this model.
   */
  private brushInsertParentFromObject(model: SolidModel, object: THREE.Object3D): THREE.Object3D | null {
    if (object === model.root) return model.root;
    if (isSolidCsgGroup(object) && findSolidModelRoot(object) === model.root) {
      return object;
    }
    if (SolidBrushVisual.isBrushObject(object)) {
      const brushModel = SolidModel.fromObject(object);
      if (brushModel !== model) return null;
      const parent = object.parent;
      if (parent && this.isValidBrushInsertParent(model, parent)) return parent;
    }
    return null;
  }

  /**
   * Returns whether a parent may receive new brushes for the model.
   *
   * @param model Solid model.
   * @param parent Candidate parent.
   * @returns True when parent is the solid root or a CSG group under it.
   */
  private isValidBrushInsertParent(model: SolidModel, parent: THREE.Object3D): boolean {
    return isValidSolidTreeParent(model.root, parent, model.root);
  }

  /** Updates remembered brush insert parent when selection is under a solid. */
  private updateBrushInsertParentFromSelection(): void {
    const model = this.findSelectedSolidModel();
    if (!model) return;
    const parent = this.resolveBrushInsertParentFromSelection(model);
    if (parent) this.lastBrushInsertParent = parent;
  }

  /**
   * Finds a solid model from the current selection.
   *
   * @returns Solid model or null.
   */
  private findSelectedSolidModel(): SolidModel | null {
    for (const object of this.selectionManager.getInspectorObjects()) {
      const model = SolidModel.fromObject(object);
      if (model) return model;
    }
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
   * Finds the first solid model root under the world hierarchy.
   *
   * @returns Solid model or null when none exist.
   */
  private findFirstSolidModelInWorld(): SolidModel | null {
    let found: SolidModel | null = null;
    this.worldObject.traverse((object) => {
      if (found) return;
      if (!SolidModel.isSolidModelObject(object)) return;
      found = SolidModel.fromObject(object);
    });
    return found;
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
   * Prefer selected-brush sync plus interactive finalize over a forced full
   * rebuild. Inspector pose writes often update only Object3D transforms, so
   * this path pulls mesh poses into brush instances, marks those brushes dirty,
   * then recompiles — otherwise the wireframe can move while the CSG result
   * stays at the previous compile.
   *
   * @param model Solid model.
   * @param selectedSet Selected meshes from the edit.
   */
  private finalizeModelAfterTransform(model: SolidModel, selectedSet: Set<THREE.Mesh>): void {
    const result = model.getResultMesh();
    const resultSelected = selectedSet.has(result);
    const selectedBrushMeshes = this.collectSelectedBrushMeshes(model, selectedSet);
    if (resultSelected && selectedBrushMeshes.length === 0) {
      // Root was already moved by the gizmo when the result stays at identity.
      if (this.isLocalIdentityPose(result)) {
        return;
      }
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
      model.prepareLiveBrushEdit(selectedBrushMeshes, locks);
    } else {
      model.syncBrushesFromScene(locks);
    }
    this.ensureTransformedBrushesDirty(model, selectedBrushMeshes);
    model.finalizeAfterInteractiveEdit();
  }

  /**
   * Collects solid brush preview meshes that belong to the model and appear in
   * the transform selection set.
   *
   * @param model Solid model.
   * @param selectedSet Meshes from the transform commit.
   * @returns Brush meshes to pull and recompile.
   */
  private collectSelectedBrushMeshes(model: SolidModel, selectedSet: Set<THREE.Mesh>): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    for (const mesh of selectedSet) {
      if (!model.findBrushByMesh(mesh)) continue;
      meshes.push(mesh);
    }
    return meshes;
  }

  /**
   * Marks every transformed brush dirty even when prepareLiveBrushEdit was a
   * no-op (pose already pulled). Guarantees inspector commits recompile CSG.
   *
   * @param model Solid model.
   * @param brushMeshes Transformed brush meshes.
   */
  private ensureTransformedBrushesDirty(model: SolidModel, brushMeshes: readonly THREE.Mesh[]): void {
    if (brushMeshes.length === 0) return;
    const dirtyIds: string[] = [];
    for (const mesh of brushMeshes) {
      const brush = model.findBrushByMesh(mesh);
      if (brush) dirtyIds.push(brush.id);
    }
    if (dirtyIds.length > 0) {
      model.markBrushesDirty(dirtyIds);
    }
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
   * Uses occlusion-aware view-ray placement so brushes land in front of walls
   * the camera is looking at; falls back to model origin without a camera.
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
    const worldPosition = computeOcclusionAwareSpawnPosition({
      camera,
      preferredDistance: DEFAULT_SPAWN_DISTANCE,
      gridInterval,
      raycastRoot: this.worldObject,
      objectRadius: DEFAULT_STARTUP_BRUSH_SIZE * 0.5,
    });
    model.root.updateMatrixWorld(true);
    return model.root.worldToLocal(worldPosition.clone());
  }

  /**
   * Bakes a lone result-mesh transform into the solid model root using the
   * pre-drag root matrix so repeated live samples do not compound.
   *
   * @param model Solid model whose result was moved alone.
   */
  private bakeResultTransformIntoRoot(model: SolidModel): void {
    const root = model.root;
    const result = model.getResultMesh();
    if (this.isLocalIdentityPose(result)) return;
    const baseline = this.captureSolidRootBakeBaseline(model);
    const resultMatrix = new THREE.Matrix4().compose(
      result.position.clone(),
      result.quaternion.clone(),
      result.scale.clone(),
    );
    const combined = baseline.clone().multiply(resultMatrix);
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
   * Captures the solid root matrix once per drag for absolute result→root
   * bakes.
   *
   * @param model Solid model being baked.
   * @returns Pre-drag root local matrix.
   */
  private captureSolidRootBakeBaseline(model: SolidModel): THREE.Matrix4 {
    const existing = this.solidRootBakeBaselines.get(model);
    if (existing) return existing;
    model.root.updateMatrix();
    const baseline = model.root.matrix.clone();
    this.solidRootBakeBaselines.set(model, baseline);
    return baseline;
  }

  /**
   * Drops bake baselines after a transform commit finishes.
   *
   * @param models Models that participated in the commit.
   */
  private clearSolidRootBakeBaselines(models: Iterable<SolidModel>): void {
    for (const model of models) {
      this.solidRootBakeBaselines.delete(model);
    }
  }

  /**
   * Returns true when an object has local identity pose (no residual bake).
   *
   * @param object Object to inspect.
   * @returns True when position is zero, scale is unit, rotation is identity.
   */
  private isLocalIdentityPose(object: THREE.Object3D): boolean {
    if (object.position.lengthSq() > 1e-16) return false;
    if (Math.abs(object.scale.x - 1) > 1e-8) return false;
    if (Math.abs(object.scale.y - 1) > 1e-8) return false;
    if (Math.abs(object.scale.z - 1) > 1e-8) return false;
    const identity = new THREE.Quaternion();
    return Math.abs(object.quaternion.dot(identity)) > 1 - 1e-8;
  }

  /**
   * Resets the result mesh to local identity under the solid model root.
   *
   * @param result Result mesh.
   */
  private resetResultLocalTransform(result: THREE.Mesh): void {
    result.position.set(0, 0, 0);
    result.rotation.set(0, 0, 0);
    result.quaternion.identity();
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

import * as THREE from 'three';
import { SolidBrush } from '../brush/solid_brush.js';
import { SolidBrushInstance } from './solid_brush_instance.js';
import { SolidBrushFactory } from '../brush/solid_brush_factory.js';
import { SolidOperation } from '../types/solid_operation.js';
import { SolidBrushVisual } from './solid_brush_visual.js';
import { FaceTextureMapping } from '../../texture/uv/face_texture_mapping.js';
import { getFaceTextureMaps } from '../../texture/uv/face_texture_storage.js';
import {
  SOLID_MODEL_USERDATA_KEY,
  SOLID_TRIANGLE_SOURCES_USERDATA_KEY,
  isSolidModelObject as isSolidModelObjectKey,
  isResultMesh as isResultMeshKey,
} from './solid_model_keys.js';
import { SolidModelRegistry } from './solid_model_registry.js';
import { SolidBrushCollection } from './solid_brush_collection.js';
import { padSolidDisplayNumber, SolidModelPresentation, type BrushUvSnapshot } from './solid_model_presentation.js';
import { SolidModelRebuildPipeline } from './solid_model_rebuild_pipeline.js';
import { disposeBrushPreviewResources } from './solid_model_mesh_disposal.js';
import { SolidBrushEdgeBatch } from './solid_brush_edge_batch.js';
import {
  pullAllBrushTransforms,
  pullChangedBrushTransforms,
  pullLiveBrushTransform,
  pullTransformIfChanged,
  sameBrushOrder,
} from './solid_brush_transform_sync.js';
import type { SolidBrushTextureLockBaseline } from '../../texture/lock/solid_brush_texture_lock.js';
import { normalizeTextureLockFlags, type TextureLockFlags } from '../../texture/lock/texture_lock_transform.js';
import {
  collectBrushIdsForTriangles,
  writeMapEntryToBrushFaces,
  type SolidTriangleSource,
} from './solid_model_authored_uv.js';
import * as solidOps from './solid_model_ops.js';
import type { SolidModelOpsHost } from './solid_model_ops.js';

export {
  SOLID_MODEL_USERDATA_KEY,
  SOLID_MODEL_RESULT_USERDATA_KEY,
  SOLID_TRIANGLE_SOURCES_USERDATA_KEY,
} from './solid_model_keys.js';

/**
 * A hierarchical solid model: group root, selectable brush children, and a
 * textured compiled result mesh rebuilt via ordered solid CSG.
 */
export class SolidModel {
  readonly root: THREE.Group;
  private resultMesh: THREE.Mesh;
  private readonly brushes: SolidBrushCollection;
  private readonly pipeline: SolidModelRebuildPipeline;
  private readonly presentation = new SolidModelPresentation();
  /** Per-brush texture lock baselines for the active interactive drag. */
  private readonly textureLockBaselines = new Map<string, SolidBrushTextureLockBaseline>();
  private static modelCounter = 0;

  /**
   * Creates a solid model group ready for the scene hierarchy.
   *
   * @param name Optional display name.
   */
  constructor(name?: string) {
    SolidModel.modelCounter += 1;
    this.root = new THREE.Group();
    this.root.name = name ?? `SolidModel${padSolidDisplayNumber(SolidModel.modelCounter)}`;
    this.root.userData[SOLID_MODEL_USERDATA_KEY] = true;
    SolidModelRegistry.register(this.root, this);
    this.brushes = new SolidBrushCollection(this.root);
    this.pipeline = new SolidModelRebuildPipeline({
      getResultMesh: () => this.resultMesh,
      findBrush: (id) => this.brushes.findBrush(id),
      getEvaluationList: () => this.brushes.getEvaluationList(),
      syncBrushOrderFromScene: () => this.brushes.syncBrushOrderFromScene(),
    });
    this.resultMesh = this.presentation.createResultMesh();
    this.root.add(this.resultMesh);
  }

  /**
   * Sets whether interactive UV stick mode is active (legacy). Solid UVs always
   * bake in world space; stick is applied by updating face mappings on
   * transform using position/stretch locks. Flag-only — no remesh or
   * conversion.
   *
   * @param enabled True when either lock is considered on for bake hints.
   */
  setUvStickToBrush(enabled: boolean): void {
    this.pipeline.setUvStickToBrush(enabled);
  }

  /**
   * Returns whether this solid uses inverted-world CSG (starts solid).
   *
   * @returns True when subtractive brushes carve rooms from a full world.
   */
  isInvertedWorld(): boolean {
    return this.pipeline.isInvertedWorld();
  }

  /**
   * Enables or disables inverted-world CSG and rebuilds the solid.
   *
   * @param enabled True for inverted (carved rooms) workflow.
   */
  setInvertedWorld(enabled: boolean): void {
    if (this.pipeline.isInvertedWorld() === enabled) return;
    this.pipeline.setInvertedWorld(enabled);
    this.rebuild(true);
  }

  /**
   * Back-compat alias used by older call sites that referred to mesh.
   *
   * @returns Compiled result mesh.
   */
  get mesh(): THREE.Mesh {
    return this.resultMesh;
  }

  /**
   * Returns whether an object is a solid model root group. Brush meshes and the
   * result mesh do not match; use fromObject for those.
   *
   * @param object Candidate scene object.
   * @returns True only when the object itself is a solid model root.
   */
  static isSolidModelObject(object: THREE.Object3D): boolean {
    return isSolidModelObjectKey(object);
  }

  /**
   * Returns whether an object is the compiled result mesh of a solid model.
   *
   * @param object Candidate object.
   * @returns True for result meshes.
   */
  static isResultMesh(object: THREE.Object3D): boolean {
    return isResultMeshKey(object);
  }

  /**
   * Resolves the SolidModel for a root, brush, or result object.
   *
   * @param object Candidate object.
   * @returns SolidModel or null.
   */
  static fromObject(object: THREE.Object3D): SolidModel | null {
    return SolidModelRegistry.fromObject(object);
  }

  /**
   * Resyncs brush order from the scene graph and rebuilds every solid under a
   * root. Call after outliner reparent when evaluation order must be fully
   * recompiled. Prefer refreshAfterHistoryChange for undo/redo of transforms.
   *
   * @param root Scene or world root to scan.
   */
  static rebuildAllUnder(root: THREE.Object3D): void {
    for (const model of SolidModelRegistry.collectUnder(root)) {
      model.syncBrushOrderFromScene();
      model.markDirty();
      model.rebuild(true);
    }
  }

  /**
   * After undo/redo: only recompile solids that actually changed. Transform
   * undos use partial CSG; brush-order changes force a full model rebuild.
   * Texture-only undos that already remeshed presentation are left alone.
   *
   * @param root Scene or world root to scan.
   */
  static refreshAfterHistoryChange(root: THREE.Object3D): void {
    for (const model of SolidModelRegistry.collectUnder(root)) {
      model.refreshAfterHistoryChange();
    }
  }

  /**
   * Syncs mesh poses / brush order after an external edit (undo, redo). Full
   * rebuild only when evaluation order changed; otherwise partial CSG.
   */
  refreshAfterHistoryChange(): void {
    const previousOrder = this.pipeline.getLastBrushOrder();
    this.syncBrushOrderFromScene();
    if (!sameBrushOrder(previousOrder, this.brushes.getEvaluationList())) {
      this.markDirty();
      this.rebuild(true);
      return;
    }
    this.rebuildChangedHistoryTransforms();
  }

  /**
   * Returns brush instances in tree order.
   *
   * @returns Brush list copy.
   */
  getBrushes(): SolidBrushInstance[] {
    return this.brushes.getBrushes();
  }

  /**
   * Returns the number of brushes.
   *
   * @returns Brush count.
   */
  getBrushCount(): number {
    return this.brushes.getBrushCount();
  }

  /**
   * Finds a brush by id.
   *
   * @param id Brush id.
   * @returns Brush or undefined.
   */
  findBrush(id: string): SolidBrushInstance | undefined {
    return this.brushes.findBrush(id);
  }

  /**
   * Finds a brush by its scene mesh.
   *
   * @param mesh Candidate mesh.
   * @returns Brush or undefined.
   */
  findBrushByMesh(mesh: THREE.Object3D): SolidBrushInstance | undefined {
    return this.brushes.findBrushByMesh(mesh);
  }

  /**
   * Returns the compiled result mesh.
   *
   * @returns Result mesh.
   */
  getResultMesh(): THREE.Mesh {
    return this.resultMesh;
  }

  /**
   * Adds a centered box brush as a selectable child mesh and rebuilds.
   *
   * @param size Cube edge length.
   * @param operation CSG operation.
   * @returns Created brush instance.
   */
  addBoxBrush(size: number = 1, operation: SolidOperation = SolidOperation.Additive): SolidBrushInstance {
    const counter = this.brushes.nextBrushCounter();
    const name = `Brush${padSolidDisplayNumber(counter)}`;
    const brush = SolidBrushFactory.createCenteredBox(size, size, size);
    const instance = new SolidBrushInstance(this.brushes.allocateBrushId(), name, brush, operation);
    const preview = SolidBrushVisual.createBoxPreview(name, size, operation);
    instance.attachMesh(preview);
    this.root.add(preview);
    this.brushes.appendPreparedBrush(instance);
    this.markBrushesDirty([instance.id]);
    this.rebuild();
    return instance;
  }

  /**
   * Prepares a hull-preview brush from convex topology without adding it to the
   * model. Used by face extrude so undo can install/remove the same instance.
   *
   * @param brush Centered local convex topology.
   * @param operation CSG operation for the new brush.
   * @param localPosition Model-local placement for the brush origin.
   * @param textureId Optional default surface texture identity.
   * @returns Configured instance not yet registered on this model.
   */
  prepareTopologyBrush(
    brush: SolidBrush,
    operation: SolidOperation,
    localPosition: THREE.Vector3,
    textureId?: string,
  ): SolidBrushInstance {
    const counter = this.brushes.nextBrushCounter();
    const name = `Brush${padSolidDisplayNumber(counter)}`;
    const instance = new SolidBrushInstance(this.brushes.allocateBrushId(), name, brush, operation);
    instance.position.copy(localPosition);
    if (textureId) {
      instance.setAllFacesTextureId(textureId);
    }
    const preview = SolidBrushVisual.createHullPreview(name, brush, operation);
    instance.attachMesh(preview);
    return instance;
  }

  /**
   * Adds a prebuilt brush instance, creating a preview mesh when missing.
   *
   * @param instance Brush instance to own.
   * @param previewSize Size used when creating a default box preview.
   */
  addBrushInstance(instance: SolidBrushInstance, previewSize: number = 2): void {
    this.brushes.registerBrushAt(instance, this.brushes.getBrushCount(), previewSize);
    this.markBrushesDirty([instance.id]);
    this.rebuild();
  }

  /**
   * Adds many brush instances and optionally performs a single CSG rebuild.
   * Used by map importers to avoid rebuilding after every solid.
   *
   * @param instances Brush instances to own (previews attached when missing).
   * @param previewSize Fallback box size when an instance has no mesh.
   * @param rebuild When true, recompiles the result mesh once after all
   *   inserts.
   */
  addBrushInstancesBatch(instances: SolidBrushInstance[], previewSize: number = 2, rebuild: boolean = true): void {
    for (const instance of instances) {
      this.brushes.registerBrushAt(instance, this.brushes.getBrushCount(), previewSize);
    }
    this.markDirty();
    if (rebuild) {
      this.rebuild(true);
    }
  }

  /**
   * Inserts a brush at a list index and restores sibling order for CSG.
   *
   * @param instance Brush instance to own.
   * @param listIndex Index in the brush evaluation list.
   * @param previewSize Size used when creating a default box preview.
   */
  insertBrushInstance(instance: SolidBrushInstance, listIndex: number, previewSize: number = 2): void {
    this.brushes.registerBrushAt(instance, listIndex, previewSize);
    this.markDirty();
    this.rebuild(true);
  }

  /**
   * Removes a brush and its preview mesh, then rebuilds.
   *
   * @param id Brush id.
   * @param disposeResources When true, disposes preview GPU resources (default
   *   true).
   * @returns True when removed.
   */
  removeBrush(id: string, disposeResources: boolean = true): boolean {
    const touchPeers = this.pipeline.getCachedTouchPeerIds(id);
    const brush = this.brushes.removeBrushFromList(id);
    if (!brush) return false;
    this.detachAndMaybeDisposeBrushMesh(brush, disposeResources);
    this.pipeline.invalidateBrush(id);
    if (touchPeers.length > 0) {
      this.markBrushesDirty(touchPeers);
    }
    this.rebuild(true);
    return true;
  }

  /**
   * Disposes GPU resources for a brush preview mesh (history drop / permanent
   * delete).
   *
   * @param mesh Brush preview mesh.
   */
  disposeBrushMeshResources(mesh: THREE.Mesh): void {
    disposeBrushPreviewResources(mesh);
  }

  /**
   * Updates a brush operation, restyles its preview, and rebuilds. Uses partial
   * CSG (seed + touch peers only), never a full-map force rebuild.
   *
   * @param id Brush id.
   * @param operation New operation.
   * @returns True when found.
   */
  setBrushOperation(id: string, operation: SolidOperation): boolean {
    const brush = this.findBrush(id);
    if (!brush) return false;
    if (brush.operation === operation) return true;
    brush.operation = operation;
    if (brush.mesh) {
      SolidBrushVisual.applyOperationStyle(brush.mesh, operation);
    }
    this.markBrushesDirty([id]);
    this.rebuild(true);
    return true;
  }

  /**
   * Updates brush transform data and the preview mesh, then rebuilds.
   *
   * @param id Brush id.
   * @param position Optional position.
   * @param rotation Optional rotation.
   * @param scale Optional scale.
   * @returns True when found.
   */
  setBrushTransform(id: string, position?: THREE.Vector3, rotation?: THREE.Euler, scale?: THREE.Vector3): boolean {
    const brush = this.findBrush(id);
    if (!brush) return false;
    if (position) brush.position.copy(position);
    if (rotation) brush.rotation.copy(rotation);
    if (scale) brush.scale.copy(scale);
    brush.pushTransformToMesh();
    this.markBrushesDirty([id]);
    this.rebuild();
    return true;
  }

  /**
   * Renames a brush and its preview mesh.
   *
   * @param id Brush id.
   * @param name New name.
   * @returns True when found.
   */
  renameBrush(id: string, name: string): boolean {
    const brush = this.findBrush(id);
    if (!brush) return false;
    brush.name = name;
    if (brush.mesh) brush.mesh.name = name;
    return true;
  }

  /**
   * Duplicates a brush inside this solid model at the same local transform.
   *
   * @param id Source brush id.
   * @param offset Optional position offset applied after cloning (default
   *   none).
   * @returns The new brush instance, or null when the source is missing.
   */
  duplicateBrush(id: string, offset: THREE.Vector3 = new THREE.Vector3(0, 0, 0)): SolidBrushInstance | null {
    const source = this.findBrush(id);
    if (!source) return null;
    const clone = this.cloneBrushWithPreview(source, offset);
    this.brushes.appendPreparedBrush(clone);
    this.markBrushesDirty([clone.id]);
    this.rebuild();
    return clone;
  }

  /**
   * Pulls transforms from all brush meshes (e.g. after gizmo edits). Marks only
   * brushes whose transforms actually changed when order is stable.
   *
   * @param textureLockEnabled Whether Tex Lock should stick face UVs on move.
   */
  syncBrushesFromScene(textureLockEnabled: boolean | TextureLockFlags = false): void {
    const locks = normalizeTextureLockFlags(textureLockEnabled);
    const evaluationList = this.brushes.getEvaluationList();
    const orderBefore = evaluationList.map((brush) => brush.id);
    this.syncBrushOrderFromScene();
    if (!sameBrushOrder(orderBefore, this.brushes.getEvaluationList())) {
      pullAllBrushTransforms(this.brushes.getEvaluationList(), locks);
      this.markDirty();
      return;
    }
    const changedIds = pullChangedBrushTransforms(evaluationList, locks);
    if (changedIds.length > 0) {
      this.markBrushesDirty(changedIds);
    }
  }

  /**
   * Live-drag sync: only inspect selected brush meshes for transform changes.
   * Avoids O(n) mesh compares across the whole solid on every pointer move.
   *
   * @param selectedMeshes Meshes currently being transformed.
   * @param textureLockEnabled Whether Tex Lock should stick face UVs on move.
   * @returns True when at least one owned brush changed.
   */
  syncSelectedBrushesFromScene(
    selectedMeshes: readonly THREE.Mesh[],
    textureLockEnabled: boolean | TextureLockFlags = false,
  ): boolean {
    const locks = normalizeTextureLockFlags(textureLockEnabled);
    const selectedSet = new Set(selectedMeshes);
    const changedIds: string[] = [];
    for (const brush of this.brushes.getEvaluationList()) {
      if (!brush.mesh || !selectedSet.has(brush.mesh)) continue;
      if (pullTransformIfChanged(brush, locks)) {
        changedIds.push(brush.id);
      }
    }
    if (changedIds.length === 0) return false;
    this.markBrushesDirty(changedIds);
    return true;
  }

  /**
   * Live-drag preparation: always pull selected brush transforms and mark
   * dirty. Unlike syncSelectedBrushesFromScene, never skips when transforms
   * already match the mesh — result geometry may still be from an older pose
   * after a missed frame. When textureLockEnabled, face UV mappings stick to
   * each brush (Tex Lock).
   *
   * @param selectedMeshes Meshes currently being transformed.
   * @param textureLockEnabled Whether toolbar Tex Lock is on.
   * @returns True when any selected brush belongs to this model.
   */
  prepareLiveBrushEdit(
    selectedMeshes: readonly THREE.Mesh[],
    textureLockEnabled: boolean | TextureLockFlags = false,
  ): boolean {
    const locks = normalizeTextureLockFlags(textureLockEnabled);
    const selectedSet = new Set(selectedMeshes);
    const dirtyIds: string[] = [];
    for (const brush of this.brushes.getEvaluationList()) {
      if (!brush.mesh || !selectedSet.has(brush.mesh)) continue;
      pullLiveBrushTransform(brush, locks, this.textureLockBaselines);
      dirtyIds.push(brush.id);
    }
    if (dirtyIds.length === 0) return false;
    this.markBrushesDirty(dirtyIds);
    this.pipeline.setInteractiveGeometryCurrent(false);
    return true;
  }

  /**
   * Applies an outliner/scene visibility change for a brush under this model.
   * Hidden brushes leave the CSG evaluation set; showing them re-includes them.
   * Uses partial dirty expansion so only the brush and its touch peers
   * recompile.
   *
   * @param object Brush mesh (or other child) whose visibility changed.
   * @returns True when a brush was found and the model was rebuilt.
   */
  applyBrushVisibilityChange(object: THREE.Object3D): boolean {
    const brush = this.findBrushByMesh(object);
    if (!brush) return false;
    const wasVisible = brush.visible;
    brush.pullTransformFromMesh();
    if (brush.visible === wasVisible) return false;
    this.markVisibilityDirtyAndRebuild(brush);
    return true;
  }

  /**
   * Reorders the internal brush list to match outliner / scene-graph sibling
   * order. CSG tree order follows this list (first = earliest in boolean
   * evaluation).
   */
  syncBrushOrderFromScene(): void {
    this.brushes.syncBrushOrderFromScene();
  }

  /** Marks the model for a full CSG rebuild of every brush. */
  markDirty(): void {
    this.pipeline.markDirty();
  }

  /**
   * Marks specific brushes dirty for a partial CSG rebuild. Neighbor brushes
   * that touch these are included automatically by the compiler.
   *
   * @param brushIds Brush instance ids that changed (transform, shape, op,
   *   texture).
   */
  markBrushesDirty(brushIds: Iterable<string>): void {
    this.pipeline.markBrushesDirty(brushIds);
  }

  /**
   * Rebuilds the compiled result mesh from current brush transforms.
   *
   * @param force Rebuild even when not marked dirty.
   */
  rebuild(force: boolean = false): void {
    if (!this.pipeline.isDirty() && !force) return;
    this.pipeline.compileResultGeometry();
    this.applyPresentationIfGeometryExists(true);
    this.pipeline.resetResultLocalTransform();
    this.pipeline.clearDirtyFlag();
    this.pipeline.setInteractiveGeometryCurrent(true);
    this.refreshStaticBrushEdgeBatches();
  }

  /**
   * Finishes an interactive transform after selected brushes were prepared
   * dirty. Recompiles whenever seeds are dirty or live geometry is not trusted
   * current. Surface materials are scheduled on the next frame for
   * responsiveness.
   */
  finalizeAfterInteractiveEdit(): void {
    this.textureLockBaselines.clear();
    const needsCompile =
      this.pipeline.isFullRebuildRequired() ||
      this.pipeline.getDirtyBrushIdCount() > 0 ||
      !this.pipeline.isInteractiveGeometryCurrent();
    if (needsCompile) {
      this.pipeline.compileResultGeometry(false);
      this.pipeline.setInteractiveGeometryCurrent(true);
    }
    this.pipeline.resetResultLocalTransform();
    this.pipeline.clearDirtyFlag();
    this.schedulePresentationRefresh();
    this.refreshStaticBrushEdgeBatches();
  }

  /**
   * Async full rebuild that yields during CSG and mesh-chunk batches. Keeps the
   * browser responsive for large VMF imports.
   *
   * @param onProgress Optional progress (0..1) and status label.
   */
  async rebuildAsync(onProgress?: (ratio: number, label: string) => void): Promise<void> {
    this.prepareFullAsyncRebuild();
    onProgress?.(0.05, 'Compiling solid CSG…');
    await this.pipeline.compileFullAsync((ratio) => onProgress?.(0.05 + ratio * 0.55, 'Compiling solid CSG…'));
    await this.pipeline.finishAsyncAfterCompile((ratio) => onProgress?.(0.6 + ratio * 0.3, 'Building result mesh…'));
    this.finishAsyncRebuildPresentation(onProgress);
  }

  /**
   * Live rebuild during interactive drag: partial CSG + chunk remesh. Only
   * resyncs dirty brush meshes so large maps stay interactive. Reapplies
   * surface materials so multi-texture draw ranges stay valid.
   */
  rebuildLive(): void {
    if (this.pipeline.getDirtyBrushIdCount() === 0 && !this.pipeline.isFullRebuildRequired()) {
      this.markMeshesThatDriftedDirty();
    }
    this.pipeline.compileResultGeometry(true);
    this.pipeline.resetResultLocalTransform();
    if (this.pipeline.hasResultGeometry()) {
      this.applySurfaceLayoutToResult(false);
    }
    this.pipeline.setDirtyFlag(true);
    this.pipeline.setInteractiveGeometryCurrent(true);
  }

  /**
   * Moves brushes to the start of CSG evaluation order (first boolean operand).
   * Relative order among the moved brushes is preserved.
   *
   * @param brushIds Brush ids to move (scene selection order ignored; list
   *   order used).
   * @returns True when the evaluation order changed.
   */
  moveBrushesToFirst(brushIds: readonly string[]): boolean {
    return this.reorderBrushesAndRebuild(brushIds, 'first');
  }

  /**
   * Moves brushes to the end of CSG evaluation order (last boolean operand).
   * Relative order among the moved brushes is preserved.
   *
   * @param brushIds Brush ids to move.
   * @returns True when the evaluation order changed.
   */
  moveBrushesToLast(brushIds: readonly string[]): boolean {
    return this.reorderBrushesAndRebuild(brushIds, 'last');
  }

  /**
   * Returns evaluation-list indices for the given brush ids.
   *
   * @param brushIds Brush ids to look up.
   * @returns Parallel list of indices (-1 when missing).
   */
  getBrushOrderIndices(brushIds: readonly string[]): number[] {
    return this.brushes.getBrushOrderIndices(brushIds);
  }

  /**
   * Restores an explicit brush evaluation order and rebuilds CSG.
   *
   * @param orderedBrushIds Full or partial ordered brush id list.
   * @returns True when any brush was reordered.
   */
  applyBrushOrder(orderedBrushIds: readonly string[]): boolean {
    if (!this.brushes.applyBrushOrderList(orderedBrushIds)) return false;
    this.markDirty();
    this.rebuild(true);
    return true;
  }

  /**
   * Sets the default surface texture for a whole brush and remeshes that brush
   * only. Does not re-run CSG (geometry is unchanged).
   *
   * @param brushId Brush id.
   * @param textureId Texture identity to apply to all faces of that brush.
   * @returns True when the brush was found.
   */
  setBrushSurfaceTexture(brushId: string, textureId: string): boolean {
    const brush = this.findBrush(brushId);
    if (!brush) return false;
    brush.setAllFacesTextureId(textureId);
    return this.refreshBrushPresentations([brushId]);
  }

  /**
   * Sets one brush face texture and remeshes that brush only (no CSG).
   *
   * @param brushId Brush id.
   * @param surfaceIndex Brush face index.
   * @param textureId Texture identity.
   * @returns True when the brush was found.
   */
  setBrushFaceTexture(brushId: string, surfaceIndex: number, textureId: string): boolean {
    const brush = this.findBrush(brushId);
    if (!brush) return false;
    brush.setFaceTextureId(surfaceIndex, textureId);
    return this.refreshBrushPresentations([brushId]);
  }

  /**
   * Remeshes result presentation for brushes whose face mappings changed.
   * Updates polygon texture ids and mesh chunks only — never runs CSG.
   *
   * @param brushIds Brushes that need UV/material refresh.
   * @returns True when at least one brush was refreshed.
   */
  refreshBrushPresentations(brushIds: readonly string[]): boolean {
    if (brushIds.length === 0) return false;
    const uniqueIds = Array.from(new Set(brushIds));
    const remeshed = this.presentation.collectRemeshedBrushIds(uniqueIds, (brushId) =>
      this.pipeline.updateBrushPolygonTextures(brushId),
    );
    if (remeshed.length === 0) {
      return this.fallbackFullPresentationRebuild(uniqueIds);
    }
    return this.finishPresentationRemesh(remeshed);
  }

  /**
   * Returns the result mesh for clone geometry propagation after live rebuild.
   *
   * @returns Result mesh.
   */
  getResultMeshForSync(): THREE.Mesh {
    return this.resultMesh;
  }

  /**
   * Exposes last CSG compile diagnostics for unit tests and profiling.
   *
   * @returns Copy of compiler stats from the most recent compile.
   */
  getCompilerStatsForTesting(): {
    fullRebuild: boolean;
    recompiledBrushCount: number;
    reusedBrushCount: number;
    preparedBrushCount: number;
  } {
    return this.pipeline.getCompilerStatsForTesting();
  }

  /**
   * Exposes whether the last result mesh write was an in-place partial patch.
   *
   * @returns True after a successful dirty-range patch.
   */
  wasLastResultWritePartialForTesting(): boolean {
    return this.pipeline.wasLastResultWritePartialForTesting();
  }

  /**
   * Captures default and per-face UV mappings for every brush (smear
   * undo/redo).
   *
   * @returns Snapshot list keyed by brush id.
   */
  captureBrushUvSnapshots(): BrushUvSnapshot[] {
    return this.presentation.captureBrushUvSnapshots(this.brushes.getEvaluationList());
  }

  /**
   * Restores brush UV mappings from a smear undo/redo snapshot.
   *
   * @param snapshots Brush UV snapshots previously captured.
   */
  restoreBrushUvSnapshots(snapshots: BrushUvSnapshot[]): void {
    this.presentation.restoreBrushUvSnapshots(snapshots, (id) => this.findBrush(id));
  }

  /**
   * Writes UV editor changes on the result mesh back onto owning brush faces.
   * Call after face-texture apply or UV smear so CSG rebuilds keep phase/scale.
   * Rebakes only the affected brush mesh chunks (never drops the rest of the
   * world).
   */
  syncAuthoredMappingsFromResultMesh(): void {
    const maps = getFaceTextureMaps(this.resultMesh);
    const sources = this.getResultTriangleSources();
    this.pipeline.syncAuthoredMappingsFromMaps(maps, sources, (triangleIndices, mapping, sourceList) => {
      writeMapEntryToBrushFaces(triangleIndices, mapping, sourceList, (id) => this.findBrush(id), this.root);
    });
    if (this.pipeline.hasResultGeometry()) {
      this.applySurfaceLayoutToResult(true);
    }
  }

  /**
   * Writes only the given result-mesh triangle regions back onto brush faces
   * and remeshes only those brushes (never all coplanar neighbors).
   *
   * @param triangleIndices Result triangles that were authored.
   * @param mapping Mapping applied to those triangles.
   */
  syncAuthoredMappingForTriangles(triangleIndices: number[], mapping: FaceTextureMapping): void {
    this.syncAuthoredMappingsForRegions([{ triangleIndices, mapping }]);
  }

  /**
   * Writes multiple result-mesh triangle regions onto brush faces, then
   * remeshes once. Callers must capture all mappings before this runs so
   * multi-select UV edits are not lost when the result mesh is rebuilt
   * mid-loop.
   *
   * @param regions Triangle regions with their world-space mappings.
   */
  syncAuthoredMappingsForRegions(
    regions: ReadonlyArray<{ triangleIndices: number[]; mapping: FaceTextureMapping }>,
  ): void {
    if (regions.length === 0) return;
    const sources = this.getResultTriangleSources();
    const brushIds = new Set<string>();
    for (const region of regions) {
      writeMapEntryToBrushFaces(region.triangleIndices, region.mapping, sources, (id) => this.findBrush(id), this.root);
      collectBrushIdsForTriangles(region.triangleIndices, sources).forEach((id) => brushIds.add(id));
    }
    this.pipeline.rebakeMeshChunksForBrushes(brushIds);
    if (this.pipeline.hasResultGeometry()) {
      this.applySurfaceLayoutToResult(true);
    }
  }

  /**
   * Reads per-triangle brush surface sources from the result mesh.
   *
   * @returns Triangle source list (empty when unset).
   */
  private getResultTriangleSources(): SolidTriangleSource[] {
    const sources = this.resultMesh.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] as SolidTriangleSource[] | undefined;
    return sources ?? [];
  }

  /**
   * Builds the ops host bag for shared lifecycle helpers.
   *
   * @returns Solid model ops host.
   */
  private getOpsHost(): SolidModelOpsHost {
    return {
      root: this.root,
      resultMesh: this.resultMesh,
      brushes: this.brushes,
      pipeline: this.pipeline,
      presentation: this.presentation,
      findBrush: (id) => this.findBrush(id),
      markBrushesDirty: (ids) => this.markBrushesDirty(ids),
      markDirty: () => this.markDirty(),
      rebuild: (force) => this.rebuild(force),
    };
  }

  /** Rebuilds partial CSG after history when only brush transforms drifted. */
  private rebuildChangedHistoryTransforms(): void {
    solidOps.rebuildChangedHistoryTransforms(this.getOpsHost());
  }

  /**
   * Detaches a brush preview mesh from the root and optionally disposes it.
   *
   * @param brush Removed brush instance.
   * @param disposeResources Whether to free GPU resources.
   */
  private detachAndMaybeDisposeBrushMesh(brush: SolidBrushInstance, disposeResources: boolean): void {
    solidOps.detachAndMaybeDisposeBrushMesh(this.getOpsHost(), brush, disposeResources);
  }

  /**
   * Clones a source brush with offset and attaches a hull preview mesh.
   *
   * @param source Source brush.
   * @param offset Position offset applied after cloning.
   * @returns Prepared clone with mesh parented under root.
   */
  private cloneBrushWithPreview(source: SolidBrushInstance, offset: THREE.Vector3): SolidBrushInstance {
    return solidOps.cloneBrushWithPreview(this.getOpsHost(), source, offset);
  }

  /**
   * Marks visibility-related seeds dirty and rebuilds CSG.
   *
   * @param brush Brush whose visibility changed.
   */
  private markVisibilityDirtyAndRebuild(brush: SolidBrushInstance): void {
    solidOps.markVisibilityDirtyAndRebuild(this.getOpsHost(), brush);
  }

  /**
   * Marks brushes dirty when their preview mesh pose no longer matches
   * instance.
   */
  private markMeshesThatDriftedDirty(): void {
    solidOps.markMeshesThatDriftedDirty(this.getOpsHost());
  }

  /**
   * Moves listed brushes to first/last evaluation slots and rebuilds.
   *
   * @param brushIds Brushes to move.
   * @param end Which end of the evaluation list.
   * @returns True when order changed.
   */
  private reorderBrushesAndRebuild(brushIds: readonly string[], end: 'first' | 'last'): boolean {
    return solidOps.reorderBrushesAndRebuild(this.getOpsHost(), brushIds, end);
  }

  /**
   * Falls back to full CSG rebuild when polygon caches are missing for texture
   * remesh.
   *
   * @param brushIds Brushes that need refresh.
   * @returns Always true after rebuild.
   */
  private fallbackFullPresentationRebuild(brushIds: readonly string[]): boolean {
    return solidOps.fallbackFullPresentationRebuild(this.getOpsHost(), brushIds);
  }

  /**
   * Completes presentation remesh after polygon textures updated.
   *
   * @param remeshed Brush ids with updated polygon caches.
   * @returns True when presentation was refreshed.
   */
  private finishPresentationRemesh(remeshed: readonly string[]): boolean {
    return solidOps.finishPresentationRemesh(this.getOpsHost(), remeshed);
  }

  /** Prepares state and pulls transforms for a full async rebuild. */
  private prepareFullAsyncRebuild(): void {
    solidOps.prepareFullAsyncRebuild(this.getOpsHost());
  }

  /**
   * Applies materials and clears edges after async CSG completion.
   *
   * @param onProgress Optional progress callback.
   */
  private finishAsyncRebuildPresentation(onProgress?: (ratio: number, label: string) => void): void {
    solidOps.finishAsyncRebuildPresentation(this.getOpsHost(), onProgress);
    this.refreshStaticBrushEdgeBatches();
  }

  /**
   * Rebakes static brush edge batches under this solid root after structural or
   * transform commits. Selection membership is preserved via
   * SolidBrushEdgeBatch.
   */
  private refreshStaticBrushEdgeBatches(): void {
    SolidBrushEdgeBatch.rebuildForSolidRoot(this.root);
  }

  /**
   * Applies surface layout when result geometry exists.
   *
   * @param forceMaterials Material rebuild flag.
   */
  private applyPresentationIfGeometryExists(forceMaterials: boolean): void {
    solidOps.applyPresentationIfGeometryExists(this.getOpsHost(), forceMaterials);
  }

  /**
   * Writes face maps and materials onto the result mesh.
   *
   * @param forceMaterials Reserved; solid results always preserve order.
   */
  private applySurfaceLayoutToResult(forceMaterials: boolean): void {
    solidOps.applySurfaceLayoutToResult(this.getOpsHost(), forceMaterials);
  }

  /** Applies surface materials on the next frame after interactive commit. */
  private schedulePresentationRefresh(): void {
    solidOps.schedulePresentationRefresh(this.getOpsHost());
  }
}

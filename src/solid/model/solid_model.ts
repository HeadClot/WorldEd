import * as THREE from 'three';
import { SolidBrushInstance } from './solid_brush_instance.js';
import { SolidBrushFactory } from '../brush/solid_brush_factory.js';
import { SolidCsgCompiler } from '../algorithm/solid_csg_compiler.js';
import { SolidSurfaceRegion } from '../algorithm/surface_triangulator.js';
import { SolidOperation } from '../types/solid_operation.js';
import { SolidBrushVisual } from './solid_brush_visual.js';
import { SolidBrushEdgeMaterials } from './solid_brush_edge_materials.js';
import { SolidBrushMeshChunkBuilder } from '../mesh/solid_brush_mesh_chunk.js';
import { SolidMeshChunkCache } from '../mesh/solid_mesh_chunk_cache.js';
import { SolidResultBuffer } from '../mesh/solid_result_buffer.js';
import { createContentMaterial } from '../../materials/content_material_factory.js';
import { DECORATIVE_EDGE_USERDATA_KEY, removeDecorativeEdges } from '../../utils/mesh_edge_sync.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '../../texture/texture_id.js';
import { Theme } from '../../theme.js';
import {
  FaceTextureMapping,
  createDefaultFaceTextureMapping,
} from '../../texture/face_texture_mapping.js';
import {
  getFaceTextureMaps,
  setFaceTextureMapsShared,
} from '../../texture/face_texture_storage.js';
import { rebuildSolidResultMaterials } from '../../texture/surface_material_builder.js';
import { forBatchesAsync } from '../../utils/async_yield.js';

/**
 * UserData key marking the solid model root group.
 */
export const SOLID_MODEL_USERDATA_KEY = 'isSolidModel';

/**
 * UserData key marking the compiled CSG result mesh under a solid model.
 */
export const SOLID_MODEL_RESULT_USERDATA_KEY = 'isSolidModelResult';

/**
 * UserData key storing per-triangle brush surface sources on the result mesh.
 */
export const SOLID_TRIANGLE_SOURCES_USERDATA_KEY = 'solidTriangleSources';

/**
 * Registry of solid model roots (groups) to controller instances.
 * Kept off userData so Object3D.clone() remains safe.
 */
const solidModelRegistry = new WeakMap<THREE.Object3D, SolidModel>();

/**
 * A hierarchical solid model: group root, selectable brush children, and a
 * textured compiled result mesh rebuilt via Sander-style solid CSG.
 */
export class SolidModel {
  readonly root: THREE.Group;
  private brushes: SolidBrushInstance[];
  private resultMesh: THREE.Mesh;
  private brushCounter: number;
  private readonly compiler: SolidCsgCompiler;
  private readonly meshChunkCache: SolidMeshChunkCache;
  private readonly chunkBuilder: SolidBrushMeshChunkBuilder;
  private readonly resultBuffer: SolidResultBuffer;
  private dirty: boolean;
  /** When true, the next compile recompiles every brush. */
  private fullRebuildRequired: boolean;
  /** Brush ids pending partial recompile when fullRebuildRequired is false. */
  private readonly dirtyBrushIds: Set<string>;
  /**
   * True when rebuildLive already produced current result geometry so commit
   * can skip a second full CSG pass.
   */
  private interactiveGeometryCurrent: boolean;
  private lastSurfaceRegions: SolidSurfaceRegion[];
  /**
   * When true, solid result UVs are baked in brush-local space (Tex Lock).
   * When false, UVs are baked in world space.
   */
  private uvStickToBrush: boolean;
  private static modelCounter = 0;

  /**
   * Creates a solid model group ready for the scene hierarchy.
   * @param name Optional display name.
   */
  constructor(name?: string) {
    SolidModel.modelCounter += 1;
    this.root = new THREE.Group();
    this.root.name = name ?? `SolidModel${this.padNumber(SolidModel.modelCounter)}`;
    this.root.userData[SOLID_MODEL_USERDATA_KEY] = true;
    solidModelRegistry.set(this.root, this);
    this.resultMesh = this.createResultMesh();
    this.root.add(this.resultMesh);
    this.brushes = [];
    this.brushCounter = 0;
    this.compiler = new SolidCsgCompiler();
    this.meshChunkCache = new SolidMeshChunkCache();
    this.chunkBuilder = new SolidBrushMeshChunkBuilder();
    this.resultBuffer = new SolidResultBuffer();
    this.dirty = true;
    this.fullRebuildRequired = true;
    this.dirtyBrushIds = new Set();
    this.interactiveGeometryCurrent = false;
    this.lastSurfaceRegions = [];
    this.uvStickToBrush = true;
  }

  /**
   * Sets whether solid result UV bake sticks textures to each brush (Tex Lock).
   * @param enabled True for brush-local UV, false for world UV.
   */
  setUvStickToBrush(enabled: boolean): void {
    if (this.uvStickToBrush === enabled) return;
    this.uvStickToBrush = enabled;
    // Remesh UV only — keep CSG polygon caches for partial updates.
    this.meshChunkCache.clear();
    this.dirty = true;
    for (const brush of this.brushes) {
      this.dirtyBrushIds.add(brush.id);
    }
  }

  /**
   * Back-compat alias used by older call sites that referred to mesh.
   * @returns Compiled result mesh.
   */
  get mesh(): THREE.Mesh {
    return this.resultMesh;
  }

  /**
   * Returns whether an object is a solid model root group.
   * Brush meshes and the result mesh do not match; use fromObject for those.
   * @param object Candidate scene object.
   * @returns True only when the object itself is a solid model root.
   */
  static isSolidModelObject(object: THREE.Object3D): boolean {
    return object.userData[SOLID_MODEL_USERDATA_KEY] === true;
  }

  /**
   * Returns whether an object is the compiled result mesh of a solid model.
   * @param object Candidate object.
   * @returns True for result meshes.
   */
  static isResultMesh(object: THREE.Object3D): boolean {
    return object.userData[SOLID_MODEL_RESULT_USERDATA_KEY] === true;
  }

  /**
   * Resolves the SolidModel for a root, brush, or result object.
   * @param object Candidate object.
   * @returns SolidModel or null.
   */
  static fromObject(object: THREE.Object3D): SolidModel | null {
    const direct = solidModelRegistry.get(object);
    if (direct) return direct;
    let current: THREE.Object3D | null = object;
    while (current) {
      const model = solidModelRegistry.get(current);
      if (model) return model;
      current = current.parent;
    }
    return null;
  }

  /**
   * Resyncs brush order from the scene graph and rebuilds every solid under a root.
   * Call after outliner reparent when evaluation order must be fully recompiled.
   * Prefer refreshAfterHistoryChange for undo/redo of transforms.
   * @param root Scene or world root to scan.
   */
  static rebuildAllUnder(root: THREE.Object3D): void {
    for (const model of SolidModel.collectModelsUnder(root)) {
      model.syncBrushOrderFromScene();
      model.markDirty();
      model.rebuild(true);
    }
  }

  /**
   * After undo/redo: only recompile solids that actually changed.
   * Transform undos use partial CSG; brush-order changes force a full model rebuild.
   * Texture-only undos that already remeshed presentation are left alone.
   * @param root Scene or world root to scan.
   */
  static refreshAfterHistoryChange(root: THREE.Object3D): void {
    for (const model of SolidModel.collectModelsUnder(root)) {
      model.refreshAfterHistoryChange();
    }
  }

  /**
   * Collects registered solid models under a scene root.
   * @param root Scene or world root.
   * @returns Unique solid models.
   */
  private static collectModelsUnder(root: THREE.Object3D): Set<SolidModel> {
    const models = new Set<SolidModel>();
    root.traverse((object) => {
      if (!SolidModel.isSolidModelObject(object)) return;
      const model = solidModelRegistry.get(object);
      if (model) models.add(model);
    });
    return models;
  }

  /**
   * Syncs mesh poses / brush order after an external edit (undo, redo).
   * Full rebuild only when evaluation order changed; otherwise partial CSG.
   */
  refreshAfterHistoryChange(): void {
    const previousOrder = this.compiler.getLastBrushOrder();
    this.syncBrushOrderFromScene();
    if (!this.sameBrushOrder(previousOrder, this.brushes)) {
      this.markDirty();
      this.rebuild(true);
      return;
    }
    const changedIds = this.pullChangedBrushTransforms(false);
    if (changedIds.length === 0) return;
    this.markBrushesDirty(changedIds);
    this.rebuild(true);
  }

  /**
   * Returns brush instances in tree order.
   * @returns Brush list copy.
   */
  getBrushes(): SolidBrushInstance[] {
    return this.brushes.slice();
  }

  /**
   * Returns the number of brushes.
   * @returns Brush count.
   */
  getBrushCount(): number {
    return this.brushes.length;
  }

  /**
   * Finds a brush by id.
   * @param id Brush id.
   * @returns Brush or undefined.
   */
  findBrush(id: string): SolidBrushInstance | undefined {
    return this.brushes.find((brush) => brush.id === id);
  }

  /**
   * Finds a brush by its scene mesh.
   * @param mesh Candidate mesh.
   * @returns Brush or undefined.
   */
  findBrushByMesh(mesh: THREE.Object3D): SolidBrushInstance | undefined {
    return this.brushes.find((brush) => brush.mesh === mesh);
  }

  /**
   * Returns the compiled result mesh.
   * @returns Result mesh.
   */
  getResultMesh(): THREE.Mesh {
    return this.resultMesh;
  }

  /**
   * Adds a centered box brush as a selectable child mesh and rebuilds.
   * @param size Cube edge length.
   * @param operation CSG operation.
   * @returns Created brush instance.
   */
  addBoxBrush(
    size: number = 2,
    operation: SolidOperation = SolidOperation.Additive,
  ): SolidBrushInstance {
    this.brushCounter += 1;
    const name = `Brush${this.padNumber(this.brushCounter)}`;
    const brush = SolidBrushFactory.createCenteredBox(size, size, size);
    const instance = new SolidBrushInstance(this.allocateBrushId(), name, brush, operation);
    const preview = SolidBrushVisual.createBoxPreview(name, size, operation);
    instance.attachMesh(preview);
    this.root.add(preview);
    this.brushes.push(instance);
    this.markBrushesDirty([instance.id]);
    this.rebuild();
    return instance;
  }

  /**
   * Adds a prebuilt brush instance, creating a preview mesh when missing.
   * @param instance Brush instance to own.
   * @param previewSize Size used when creating a default box preview.
   */
  addBrushInstance(instance: SolidBrushInstance, previewSize: number = 2): void {
    this.registerBrushAt(instance, this.brushes.length, previewSize);
    this.markBrushesDirty([instance.id]);
    this.rebuild();
  }

  /**
   * Adds many brush instances and optionally performs a single CSG rebuild.
   * Used by map importers to avoid rebuilding after every solid.
   * @param instances Brush instances to own (previews attached when missing).
   * @param previewSize Fallback box size when an instance has no mesh.
   * @param rebuild When true, recompiles the result mesh once after all inserts.
   */
  addBrushInstancesBatch(
    instances: SolidBrushInstance[],
    previewSize: number = 2,
    rebuild: boolean = true,
  ): void {
    for (const instance of instances) {
      this.registerBrushAt(instance, this.brushes.length, previewSize);
    }
    this.markDirty();
    if (rebuild) {
      this.rebuild(true);
    }
  }

  /**
   * Inserts a brush at a list index and restores sibling order for CSG.
   * @param instance Brush instance to own.
   * @param listIndex Index in the brush evaluation list.
   * @param previewSize Size used when creating a default box preview.
   */
  insertBrushInstance(
    instance: SolidBrushInstance,
    listIndex: number,
    previewSize: number = 2,
  ): void {
    this.registerBrushAt(instance, listIndex, previewSize);
    this.markDirty();
    this.rebuild(true);
  }

  /**
   * Removes a brush and its preview mesh, then rebuilds.
   * @param id Brush id.
   * @param disposeResources When true, disposes preview GPU resources (default true).
   * @returns True when removed.
   */
  removeBrush(id: string, disposeResources: boolean = true): boolean {
    const index = this.brushes.findIndex((brush) => brush.id === id);
    if (index < 0) return false;
    const touchPeers = this.compiler.getCachedTouchPeerIds(id);
    const brush = this.brushes[index];
    if (brush.mesh) {
      this.root.remove(brush.mesh);
      if (disposeResources) {
        this.disposeMeshResources(brush.mesh);
      }
    }
    this.brushes.splice(index, 1);
    this.compiler.invalidateBrush(id);
    this.meshChunkCache.remove(id);
    this.resultBuffer.clear();
    this.dirty = true;
    if (touchPeers.length > 0) {
      this.markBrushesDirty(touchPeers);
    }
    this.rebuild(true);
    return true;
  }

  /**
   * Disposes GPU resources for a brush preview mesh (history drop / permanent delete).
   * @param mesh Brush preview mesh.
   */
  disposeBrushMeshResources(mesh: THREE.Mesh): void {
    this.disposeMeshResources(mesh);
  }

  /**
   * Updates a brush operation, restyles its preview, and rebuilds.
   * Uses partial CSG (seed + touch peers only), never a full-map force rebuild.
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
   * @param id Brush id.
   * @param position Optional position.
   * @param rotation Optional rotation.
   * @param scale Optional scale.
   * @returns True when found.
   */
  setBrushTransform(
    id: string,
    position?: THREE.Vector3,
    rotation?: THREE.Euler,
    scale?: THREE.Vector3,
  ): boolean {
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
   * @param id Source brush id.
   * @param offset Optional position offset applied after cloning (default none).
   * @returns The new brush instance, or null when the source is missing.
   */
  duplicateBrush(
    id: string,
    offset: THREE.Vector3 = new THREE.Vector3(0, 0, 0),
  ): SolidBrushInstance | null {
    const source = this.findBrush(id);
    if (!source) return null;
    source.pullTransformFromMesh();
    this.brushCounter += 1;
    const name = `${source.name}_copy`;
    const clone = source.cloneWithId(this.allocateBrushId(), name);
    clone.position.add(offset);
    const preview = SolidBrushVisual.createHullPreview(name, clone.brush, clone.operation);
    clone.attachMesh(preview);
    this.root.add(preview);
    this.brushes.push(clone);
    this.markBrushesDirty([clone.id]);
    this.rebuild();
    return clone;
  }

  /**
   * Estimates a box preview edge length from brush local bounds.
   * @param source Brush to measure.
   * @returns Preview cube size.
   */
  private estimateBrushPreviewSize(source: SolidBrushInstance): number {
    const bounds = source.brush.computeLocalBounds();
    const size = new THREE.Vector3();
    bounds.getSize(size);
    const maxAxis = Math.max(size.x, size.y, size.z);
    return maxAxis > 1e-6 ? maxAxis : 2;
  }

  /**
   * Pulls transforms from all brush meshes (e.g. after gizmo edits).
   * Marks only brushes whose transforms actually changed when order is stable.
   * @param textureLockEnabled Whether Tex Lock should stick face UVs on move.
   */
  syncBrushesFromScene(textureLockEnabled: boolean = false): void {
    const orderBefore = this.brushes.map((brush) => brush.id);
    this.syncBrushOrderFromScene();
    if (!this.sameBrushOrder(orderBefore, this.brushes)) {
      this.pullAllBrushTransforms(textureLockEnabled);
      this.markDirty();
      return;
    }
    const changedIds = this.pullChangedBrushTransforms(textureLockEnabled);
    if (changedIds.length > 0) {
      this.markBrushesDirty(changedIds);
    }
  }

  /**
   * Live-drag sync: only inspect selected brush meshes for transform changes.
   * Avoids O(n) mesh compares across the whole solid on every pointer move.
   * @param selectedMeshes Meshes currently being transformed.
   * @param textureLockEnabled Whether Tex Lock should stick face UVs on move.
   * @returns True when at least one owned brush changed.
   */
  syncSelectedBrushesFromScene(
    selectedMeshes: readonly THREE.Mesh[],
    textureLockEnabled: boolean = false,
  ): boolean {
    const selectedSet = new Set(selectedMeshes);
    const changedIds: string[] = [];
    for (const brush of this.brushes) {
      if (!brush.mesh || !selectedSet.has(brush.mesh)) continue;
      if (this.pullTransformIfChanged(brush, textureLockEnabled)) {
        changedIds.push(brush.id);
      }
    }
    if (changedIds.length === 0) return false;
    this.markBrushesDirty(changedIds);
    return true;
  }

  /**
   * Live-drag preparation: always pull selected brush transforms and mark dirty.
   * Unlike syncSelectedBrushesFromScene, never skips when transforms already match
   * the mesh — result geometry may still be from an older pose after a missed frame.
   * When textureLockEnabled, face UV mappings stick to each brush (Tex Lock).
   * @param selectedMeshes Meshes currently being transformed.
   * @param textureLockEnabled Whether toolbar Tex Lock is on.
   * @returns True when this model owns at least one selected brush.
   */
  prepareLiveBrushEdit(
    selectedMeshes: readonly THREE.Mesh[],
    textureLockEnabled: boolean = false,
  ): boolean {
    const selectedSet = new Set(selectedMeshes);
    const dirtyIds: string[] = [];
    for (const brush of this.brushes) {
      if (!brush.mesh || !selectedSet.has(brush.mesh)) continue;
      this.pullLiveBrushTransform(brush, textureLockEnabled);
      dirtyIds.push(brush.id);
    }
    if (dirtyIds.length === 0) return false;
    this.markBrushesDirty(dirtyIds);
    this.interactiveGeometryCurrent = false;
    return true;
  }

  /**
   * Applies an outliner/scene visibility change for a brush under this model.
   * Hidden brushes leave the CSG evaluation set; showing them re-includes them.
   * Uses partial dirty expansion so only the brush and its touch peers recompile.
   * @param object Brush mesh (or other child) whose visibility changed.
   * @returns True when a brush was found and the model was rebuilt.
   */
  applyBrushVisibilityChange(object: THREE.Object3D): boolean {
    const brush = this.findBrushByMesh(object);
    if (!brush) return false;
    const wasVisible = brush.visible;
    brush.pullTransformFromMesh();
    if (brush.visible === wasVisible) {
      return false;
    }
    const seedIds = [brush.id, ...this.compiler.getCachedTouchPeerIds(brush.id)];
    this.markBrushesDirty(seedIds);
    if (!brush.visible) {
      this.meshChunkCache.remove(brush.id);
    }
    this.rebuild(true);
    return true;
  }

  /**
   * Reorders the internal brush list to match outliner / scene-graph sibling order.
   * CSG tree order follows this list (first = earliest in boolean evaluation).
   */
  syncBrushOrderFromScene(): void {
    const ordered: SolidBrushInstance[] = [];
    const remaining = new Map(this.brushes.map((brush) => [brush.id, brush] as const));
    for (const child of this.root.children) {
      if (!SolidBrushVisual.isBrushObject(child)) continue;
      const brush = this.findBrushByMesh(child);
      if (!brush) continue;
      ordered.push(brush);
      remaining.delete(brush.id);
    }
    remaining.forEach((brush) => ordered.push(brush));
    this.brushes = ordered;
  }

  /**
   * Marks the model for a full CSG rebuild of every brush.
   */
  markDirty(): void {
    this.dirty = true;
    this.fullRebuildRequired = true;
    this.dirtyBrushIds.clear();
    this.interactiveGeometryCurrent = false;
  }

  /**
   * Marks specific brushes dirty for a partial CSG rebuild.
   * Neighbor brushes that touch these are included automatically by the compiler.
   * @param brushIds Brush instance ids that changed (transform, shape, op, texture).
   */
  markBrushesDirty(brushIds: Iterable<string>): void {
    this.dirty = true;
    if (this.fullRebuildRequired) return;
    for (const brushId of brushIds) {
      this.dirtyBrushIds.add(brushId);
    }
  }

  /**
   * Rebuilds the compiled result mesh from current brush transforms.
   * @param force Rebuild even when not marked dirty.
   */
  rebuild(force: boolean = false): void {
    if (!this.dirty && !force) return;
    this.compileResultGeometry();
    if (this.hasResultGeometry()) {
      this.applySurfaceLayoutToResult(true);
      this.clearResultContentEdges();
    }
    this.resetResultLocalTransform();
    this.dirty = false;
    this.interactiveGeometryCurrent = true;
  }

  /**
   * Finishes an interactive transform after selected brushes were prepared dirty.
   * Recompiles whenever seeds are dirty or live geometry is not trusted current.
   * Surface materials are scheduled on the next frame for responsiveness.
   */
  finalizeAfterInteractiveEdit(): void {
    const needsCompile =
      this.fullRebuildRequired || this.dirtyBrushIds.size > 0 || !this.interactiveGeometryCurrent;
    if (needsCompile) {
      this.compileResultGeometry(false);
      this.interactiveGeometryCurrent = true;
    }
    this.resetResultLocalTransform();
    this.dirty = false;
    this.schedulePresentationRefresh();
  }

  /**
   * Async full rebuild that yields during CSG and mesh-chunk batches.
   * Keeps the browser responsive for large VMF imports.
   * @param onProgress Optional progress (0..1) and status label.
   */
  async rebuildAsync(onProgress?: (ratio: number, label: string) => void): Promise<void> {
    this.markDirty();
    this.syncBrushOrderFromScene();
    for (const brush of this.brushes) {
      brush.pullTransformFromMesh();
    }
    onProgress?.(0.05, 'Compiling solid CSG…');
    await this.compiler.compileAsync(
      this.brushes,
      { forceFull: true, skipPolygonAssembly: true },
      (ratio) => onProgress?.(0.05 + ratio * 0.55, 'Compiling solid CSG…'),
    );
    await this.rebuildDirtyMeshChunksAsync((ratio) =>
      onProgress?.(0.6 + ratio * 0.3, 'Building result mesh…'),
    );
    const brushOrder = this.compiler.getLastBrushOrder();
    this.meshChunkCache.pruneToIds(new Set(brushOrder));
    this.writeResultFromChunks(brushOrder);
    this.lastSurfaceRegions = this.resultBuffer.getSurfaceRegions();
    this.resultMesh.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] =
      this.resultBuffer.getTriangleSources();
    this.clearDirtyTracking();
    if (this.hasResultGeometry()) {
      onProgress?.(0.95, 'Applying materials…');
      this.applySurfaceLayoutToResult(true);
      this.clearResultContentEdges();
    }
    this.resetResultLocalTransform();
    this.dirty = false;
    this.interactiveGeometryCurrent = true;
    onProgress?.(1, 'Done');
  }

  /**
   * Live rebuild during interactive drag: partial CSG + chunk remesh.
   * Only resyncs dirty brush meshes so large maps stay interactive.
   * Reapplies surface materials so multi-texture draw ranges stay valid.
   */
  rebuildLive(): void {
    if (this.dirtyBrushIds.size === 0 && !this.fullRebuildRequired) {
      this.markMeshesThatDriftedDirty();
    }
    this.compileResultGeometry(true);
    this.resetResultLocalTransform();
    if (this.hasResultGeometry()) {
      this.applySurfaceLayoutToResult(false);
    }
    this.dirty = true;
    this.interactiveGeometryCurrent = true;
  }

  /**
   * Marks brushes dirty when their preview mesh pose no longer matches instance.
   * Covers callers that move the mesh then call rebuildLive without prepareLive.
   */
  private markMeshesThatDriftedDirty(): void {
    for (const brush of this.brushes) {
      if (!brush.mesh) continue;
      if (
        !brush.position.equals(brush.mesh.position) ||
        !this.eulerEquals(brush.rotation, brush.mesh.rotation) ||
        !brush.scale.equals(brush.mesh.scale)
      ) {
        this.markBrushesDirty([brush.id]);
      }
    }
  }

  /**
   * Moves brushes to the start of CSG evaluation order (first boolean operand).
   * Relative order among the moved brushes is preserved.
   * @param brushIds Brush ids to move (scene selection order ignored; list order used).
   * @returns True when the evaluation order changed.
   */
  moveBrushesToFirst(brushIds: readonly string[]): boolean {
    return this.reorderBrushesToEnd(brushIds, 'first');
  }

  /**
   * Moves brushes to the end of CSG evaluation order (last boolean operand).
   * Relative order among the moved brushes is preserved.
   * @param brushIds Brush ids to move.
   * @returns True when the evaluation order changed.
   */
  moveBrushesToLast(brushIds: readonly string[]): boolean {
    return this.reorderBrushesToEnd(brushIds, 'last');
  }

  /**
   * Returns evaluation-list indices for the given brush ids.
   * @param brushIds Brush ids to look up.
   * @returns Parallel list of indices (-1 when missing).
   */
  getBrushOrderIndices(brushIds: readonly string[]): number[] {
    return brushIds.map((brushId) => this.brushes.findIndex((brush) => brush.id === brushId));
  }

  /**
   * Restores an explicit brush evaluation order and rebuilds CSG.
   * @param orderedBrushIds Full or partial ordered brush id list.
   * @returns True when any brush was reordered.
   */
  applyBrushOrder(orderedBrushIds: readonly string[]): boolean {
    const idSet = new Set(orderedBrushIds);
    const reordered: SolidBrushInstance[] = [];
    for (const brushId of orderedBrushIds) {
      const brush = this.findBrush(brushId);
      if (brush) reordered.push(brush);
    }
    for (const brush of this.brushes) {
      if (!idSet.has(brush.id)) reordered.push(brush);
    }
    if (reordered.length !== this.brushes.length) return false;
    let changed = false;
    for (let index = 0; index < reordered.length; index++) {
      if (reordered[index].id !== this.brushes[index].id) {
        changed = true;
        break;
      }
    }
    if (!changed) return false;
    this.brushes = reordered;
    this.applyBrushMeshSiblingOrder();
    this.markDirty();
    this.rebuild(true);
    return true;
  }

  /**
   * Sets the default surface texture for a whole brush and remeshes that brush only.
   * Does not re-run CSG (geometry is unchanged).
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
   * @param brushIds Brushes that need UV/material refresh.
   * @returns True when at least one brush was refreshed.
   */
  refreshBrushPresentations(brushIds: readonly string[]): boolean {
    if (brushIds.length === 0) return false;
    const uniqueIds = Array.from(new Set(brushIds));
    const remeshed: string[] = [];
    for (const brushId of uniqueIds) {
      if (this.updateBrushPolygonTextures(brushId)) {
        remeshed.push(brushId);
      }
    }
    if (remeshed.length === 0) {
      this.markBrushesDirty(uniqueIds);
      this.rebuild(true);
      return true;
    }
    this.resultMesh.updateMatrixWorld(true);
    const worldMatrix = this.resultMesh.matrixWorld;
    for (const brushId of remeshed) {
      this.rebuildOneMeshChunk(brushId, worldMatrix);
    }
    const brushOrder = this.compiler.getLastBrushOrder();
    if (brushOrder.length === 0) {
      this.markBrushesDirty(remeshed);
      this.rebuild(true);
      return true;
    }
    const patched = this.resultBuffer.tryPatchDirty(remeshed, brushOrder, this.meshChunkCache);
    if (!patched) {
      this.resultBuffer.rebuildFull(brushOrder, this.meshChunkCache);
      this.uploadResultBufferToMesh(false);
    } else {
      this.uploadResultBufferToMesh(true);
    }
    this.lastSurfaceRegions = this.resultBuffer.getSurfaceRegions();
    this.resultMesh.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] =
      this.resultBuffer.getTriangleSources();
    if (this.hasResultGeometry()) {
      this.applySurfaceLayoutToResult(true);
    }
    this.dirty = false;
    this.interactiveGeometryCurrent = true;
    return true;
  }

  /**
   * Syncs cached polygon texture ids from the brush's face mappings.
   * @param brushId Brush id.
   * @returns True when polygon cache exists and was updated.
   */
  private updateBrushPolygonTextures(brushId: string): boolean {
    const brush = this.findBrush(brushId);
    if (!brush) return false;
    return this.compiler.updateCachedPolygonTextures(brushId, (surfaceIndex) =>
      brush.getSurfaceTextureId(surfaceIndex),
    );
  }

  /**
   * Returns the result mesh for clone geometry propagation after live rebuild.
   * @returns Result mesh.
   */
  getResultMeshForSync(): THREE.Mesh {
    return this.resultMesh;
  }

  /**
   * Exposes last CSG compile diagnostics for unit tests and profiling.
   * @returns Copy of compiler stats from the most recent compile.
   */
  getCompilerStatsForTesting(): {
    fullRebuild: boolean;
    recompiledBrushCount: number;
    reusedBrushCount: number;
    preparedBrushCount: number;
  } {
    return this.compiler.getLastCompileStats();
  }

  /**
   * Exposes whether the last result mesh write was an in-place partial patch.
   * @returns True after a successful dirty-range patch.
   */
  wasLastResultWritePartialForTesting(): boolean {
    return this.resultBuffer.wasLastWritePartial();
  }

  /**
   * Pulls brush transforms, runs CSG, remeshes dirty brush chunks, patches result.
   * @param liveDrag When true, only resyncs dirty brush meshes (no full order scan).
   */
  private compileResultGeometry(liveDrag: boolean = false): void {
    if (!liveDrag) {
      this.syncBrushOrderFromScene();
      for (const brush of this.brushes) {
        brush.pullTransformFromMesh();
      }
    } else {
      for (const brushId of this.dirtyBrushIds) {
        this.findBrush(brushId)?.pullTransformFromMesh();
      }
    }
    this.compiler.compile(this.brushes, this.buildCompileOptions());
    this.rebuildDirtyMeshChunks();
    const brushOrder = this.compiler.getLastBrushOrder();
    this.meshChunkCache.pruneToIds(new Set(brushOrder));
    this.writeResultFromChunks(brushOrder);
    this.lastSurfaceRegions = this.resultBuffer.getSurfaceRegions();
    this.resultMesh.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] =
      this.resultBuffer.getTriangleSources();
    this.clearDirtyTracking();
  }

  /**
   * Patches dirty brush slices when layout is stable; otherwise rebuilds fully.
   * Always restores any missing mesh chunks first so a prior UV-smear invalidation
   * cannot drop most of the world on the next full assemble.
   * @param brushOrder Visible brush ids in evaluation order.
   */
  private writeResultFromChunks(brushOrder: string[]): void {
    this.ensureMeshChunksForBrushOrder(brushOrder);
    const dirtyIds = this.compiler.getLastUpdateBrushIds();
    const patched = this.resultBuffer.tryPatchDirty(dirtyIds, brushOrder, this.meshChunkCache);
    if (patched) {
      this.uploadResultBufferToMesh(true);
      return;
    }
    const suffixRebuilt = this.resultBuffer.tryRebuildFromFirstChanged(
      dirtyIds,
      brushOrder,
      this.meshChunkCache,
    );
    if (!suffixRebuilt) {
      this.resultBuffer.rebuildFull(brushOrder, this.meshChunkCache);
    }
    this.uploadResultBufferToMesh(false);
  }

  /**
   * Rebuilds any missing mesh chunks from cached CSG polygons.
   * @param brushOrder Brush ids that must have chunks before assemble.
   */
  private ensureMeshChunksForBrushOrder(brushOrder: readonly string[]): void {
    this.resultMesh.updateMatrixWorld(true);
    const worldMatrix = this.resultMesh.matrixWorld;
    for (const brushId of brushOrder) {
      if (this.meshChunkCache.get(brushId)) continue;
      if (!this.compiler.getCachedPolygons(brushId)) continue;
      this.rebuildOneMeshChunk(brushId, worldMatrix);
    }
  }

  /**
   * Uploads the segmented result buffer onto the result mesh geometry.
   * @param preferInPlace When true, keep existing geometry object if possible.
   */
  private uploadResultBufferToMesh(preferInPlace: boolean): void {
    if (!preferInPlace) {
      this.stripStaleDecorativeEdges(this.resultMesh);
    }
    this.resultBuffer.uploadToGeometry(this.resultMesh.geometry);
    this.resultMesh.geometry.userData.solidMeshUpdateRanges =
      this.resultBuffer.wasLastWritePartial() ? this.resultBuffer.getLastUpdateRanges() : [];
  }

  /**
   * Rebuilds triangulated UV-baked mesh chunks for brushes recompiled this pass.
   */
  private rebuildDirtyMeshChunks(): void {
    this.resultMesh.updateMatrixWorld(true);
    const worldMatrix = this.resultMesh.matrixWorld;
    for (const brushId of this.compiler.getLastUpdateBrushIds()) {
      this.rebuildOneMeshChunk(brushId, worldMatrix);
    }
  }

  /**
   * Rebuilds dirty mesh chunks in batches with browser yields.
   * @param onProgress Optional 0..1 progress for the chunk phase.
   */
  private async rebuildDirtyMeshChunksAsync(onProgress?: (ratio: number) => void): Promise<void> {
    this.resultMesh.updateMatrixWorld(true);
    const worldMatrix = this.resultMesh.matrixWorld;
    const dirtyIds = this.compiler.getLastUpdateBrushIds();
    await forBatchesAsync(
      dirtyIds.length,
      20,
      (start, end) => {
        for (let index = start; index < end; index++) {
          this.rebuildOneMeshChunk(dirtyIds[index], worldMatrix);
        }
      },
      onProgress,
    );
  }

  /**
   * Rebuilds one brush mesh chunk from cached CSG polygons.
   * @param brushId Brush instance id.
   * @param worldMatrix Result mesh world matrix for UV projection.
   */
  private rebuildOneMeshChunk(brushId: string, worldMatrix: THREE.Matrix4): void {
    const polygons = this.compiler.getCachedPolygons(brushId) ?? [];
    const brush = this.findBrush(brushId);
    const brushModelMatrix = brush
      ? new THREE.Matrix4().compose(
          brush.position,
          new THREE.Quaternion().setFromEuler(brush.rotation),
          brush.scale,
        )
      : new THREE.Matrix4();
    const chunk = this.chunkBuilder.build(
      polygons,
      (surfaceIndex) => this.resolveBrushSurfaceMapping(brush, surfaceIndex),
      {
        stickToBrush: this.uvStickToBrush,
        resultWorldMatrix: worldMatrix,
        brushModelMatrix,
        resolveLocalFaceNormal: (surfaceIndex) =>
          this.resolveBrushFaceLocalNormal(brush, surfaceIndex),
        resolveModelFaceNormal: (surfaceIndex) =>
          this.resolveBrushFaceModelNormal(brush, surfaceIndex),
      },
    );
    this.meshChunkCache.set(brushId, chunk);
  }

  /**
   * Brush-local face normal for brush-local UV projection.
   * @param brush Brush instance or undefined.
   * @param surfaceIndex Face index.
   * @returns Unit normal in brush local space.
   */
  private resolveBrushFaceLocalNormal(
    brush: SolidBrushInstance | undefined,
    surfaceIndex: number,
  ): THREE.Vector3 {
    if (!brush) return new THREE.Vector3(0, 1, 0);
    return (
      brush.brush.planes[surfaceIndex]?.normal.clone().normalize() ?? new THREE.Vector3(0, 1, 0)
    );
  }

  /**
   * Model-space brush face normal used for world UV projection.
   * @param brush Brush instance or undefined.
   * @param surfaceIndex Face index.
   * @returns Unit normal in solid model space.
   */
  private resolveBrushFaceModelNormal(
    brush: SolidBrushInstance | undefined,
    surfaceIndex: number,
  ): THREE.Vector3 {
    if (!brush) return new THREE.Vector3(0, 1, 0);
    const localNormal = brush.brush.planes[surfaceIndex]?.normal ?? new THREE.Vector3(0, 1, 0);
    const localMatrix = new THREE.Matrix4().compose(
      brush.position,
      new THREE.Quaternion().setFromEuler(brush.rotation),
      brush.scale,
    );
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(localMatrix);
    return localNormal.clone().applyMatrix3(normalMatrix).normalize();
  }

  /**
   * Resolves a face mapping for chunk UV bake.
   * @param brush Owning brush or undefined.
   * @param surfaceIndex Face index.
   * @returns Face texture mapping.
   */
  private resolveBrushSurfaceMapping(
    brush: SolidBrushInstance | undefined,
    surfaceIndex: number,
  ): FaceTextureMapping {
    if (brush) return brush.getSurfaceMapping(surfaceIndex);
    return createDefaultFaceTextureMapping(DEFAULT_CHECKER_TEXTURE_ID);
  }

  /**
   * Builds compiler options from the current dirty-tracking state.
   * @returns Partial or full compile options.
   */
  private buildCompileOptions(): {
    forceFull?: boolean;
    dirtyBrushIds?: Iterable<string>;
    skipPolygonAssembly?: boolean;
  } {
    if (this.fullRebuildRequired) {
      return { forceFull: true, skipPolygonAssembly: true };
    }
    return {
      dirtyBrushIds: Array.from(this.dirtyBrushIds),
      skipPolygonAssembly: true,
    };
  }

  /**
   * Clears dirty flags after a successful compile.
   */
  private clearDirtyTracking(): void {
    this.fullRebuildRequired = false;
    this.dirtyBrushIds.clear();
  }

  /**
   * Pulls mesh transforms and returns ids of brushes that actually changed.
   * @returns Brush ids whose transform or visibility changed.
   */
  private pullChangedBrushTransforms(textureLockEnabled: boolean = false): string[] {
    const changedIds: string[] = [];
    for (const brush of this.brushes) {
      if (this.pullTransformIfChanged(brush, textureLockEnabled)) {
        changedIds.push(brush.id);
      }
    }
    return changedIds;
  }

  /**
   * Pulls transforms from every brush mesh without dirty tracking.
   * @param textureLockEnabled Whether Tex Lock should stick face UVs.
   */
  private pullAllBrushTransforms(textureLockEnabled: boolean = false): void {
    for (const brush of this.brushes) {
      this.pullBrushTransformWithOptionalTextureLock(brush, textureLockEnabled);
    }
  }

  /**
   * Copies mesh transform into the brush when it differs from the stored one.
   * @param brush Brush instance to sync.
   * @param textureLockEnabled Whether Tex Lock should stick face UVs.
   * @returns True when any transform or visibility component changed.
   */
  private pullTransformIfChanged(
    brush: SolidBrushInstance,
    textureLockEnabled: boolean = false,
  ): boolean {
    if (!brush.mesh) {
      brush.pullTransformFromMesh();
      return false;
    }
    const mesh = brush.mesh;
    const changed =
      !brush.position.equals(mesh.position) ||
      !this.eulerEquals(brush.rotation, mesh.rotation) ||
      !brush.scale.equals(mesh.scale) ||
      brush.visible !== mesh.visible;
    if (!changed) return false;
    this.pullBrushTransformWithOptionalTextureLock(brush, textureLockEnabled);
    return true;
  }

  /**
   * Pulls mesh transform into the brush.
   * Result UVs stick via brush-local bake (uvStickToBrush), not offset rewrites.
   * @param brush Brush instance.
   * @param textureLockEnabled Reserved; UV stick mode is controlled separately.
   */
  private pullBrushTransformWithOptionalTextureLock(
    brush: SolidBrushInstance,
    textureLockEnabled: boolean,
  ): void {
    void textureLockEnabled;
    brush.pullTransformFromMesh();
  }

  /**
   * Live-drag pull: mesh pose only (no per-frame face-offset churn).
   * @param brush Brush instance.
   * @param textureLockEnabled Reserved; UV stick mode is controlled separately.
   */
  private pullLiveBrushTransform(brush: SolidBrushInstance, textureLockEnabled: boolean): void {
    void textureLockEnabled;
    brush.pullTransformFromMesh();
  }

  /**
   * Compares two brush id sequences for equality.
   * @param before Previous ordered ids.
   * @param brushes Current brush list.
   * @returns True when order and membership match.
   */
  private sameBrushOrder(before: string[], brushes: SolidBrushInstance[]): boolean {
    if (before.length !== brushes.length) return false;
    for (let index = 0; index < before.length; index++) {
      if (before[index] !== brushes[index].id) return false;
    }
    return true;
  }

  /**
   * Compares Euler rotations component-wise.
   * @param a First rotation.
   * @param b Second rotation.
   * @returns True when equal.
   */
  private eulerEquals(a: THREE.Euler, b: THREE.Euler): boolean {
    return a.x === b.x && a.y === b.y && a.z === b.z && a.order === b.order;
  }

  /**
   * Writes face maps and materials onto the result mesh.
   * UVs are already baked into brush mesh chunks; this never reprojects them.
   * Uses a solid-specific material path that does not clone every triangle index
   * table (critical for large VMF maps during live drag and texture paint).
   * @param _forceMaterials Reserved; solid results always preserve order.
   */
  private applySurfaceLayoutToResult(_forceMaterials: boolean): void {
    const textureRegions = this.lastSurfaceRegions.map((region) => {
      const mapping = this.resolveRegionMapping(region);
      return {
        triangleIndices: region.triangleIndices,
        textureId: mapping.textureId || region.textureId,
        mapping,
      };
    });
    setFaceTextureMapsShared(
      this.resultMesh,
      textureRegions.map((region) => ({
        triangleIndices: region.triangleIndices,
        mapping: region.mapping,
      })),
    );
    rebuildSolidResultMaterials(
      this.resultMesh,
      textureRegions.map((region) => ({
        triangleIndices: region.triangleIndices,
        textureId: region.textureId,
      })),
    );
  }

  /**
   * Resolves the authored face mapping for one compiled surface region.
   * @param region Surface region with brush source identity.
   * @returns Mapping to bake onto the result mesh.
   */
  private resolveRegionMapping(region: {
    textureId: string;
    brushId: string;
    surfaceIndex: number;
  }): FaceTextureMapping {
    const brush = this.findBrush(region.brushId);
    if (brush) return brush.getSurfaceMapping(region.surfaceIndex);
    return createDefaultFaceTextureMapping(region.textureId || DEFAULT_CHECKER_TEXTURE_ID);
  }

  /**
   * Captures default and per-face UV mappings for every brush (smear undo/redo).
   * @returns Snapshot list keyed by brush id.
   */
  captureBrushUvSnapshots(): Array<{
    brushId: string;
    defaultMapping: FaceTextureMapping;
    faceMappings: (FaceTextureMapping | undefined)[];
  }> {
    return this.brushes.map((brush) => ({
      brushId: brush.id,
      defaultMapping: brush.serializeDefaultMapping(),
      faceMappings: brush.serializeFaceMappings(),
    }));
  }

  /**
   * Restores brush UV mappings from a smear undo/redo snapshot.
   * @param snapshots Brush UV snapshots previously captured.
   */
  restoreBrushUvSnapshots(
    snapshots: Array<{
      brushId: string;
      defaultMapping: FaceTextureMapping;
      faceMappings: (FaceTextureMapping | undefined)[];
    }>,
  ): void {
    for (const snapshot of snapshots) {
      const brush = this.findBrush(snapshot.brushId);
      if (!brush) continue;
      brush.restoreFaceMappings(snapshot.defaultMapping, snapshot.faceMappings);
    }
  }

  /**
   * Writes UV editor changes on the result mesh back onto owning brush faces.
   * Call after face-texture apply or UV smear so CSG rebuilds keep phase/scale.
   * Rebakes only the affected brush mesh chunks (never drops the rest of the world).
   */
  syncAuthoredMappingsFromResultMesh(): void {
    const maps = getFaceTextureMaps(this.resultMesh);
    const sources =
      (this.resultMesh.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] as
        Array<{ brushId: string; surfaceIndex: number }> | undefined) ?? [];
    for (const entry of maps) {
      this.writeMapEntryToBrushFaces(entry.triangleIndices, entry.mapping, sources);
    }
    const brushIds = this.collectBrushIdsFromMaps(maps, sources);
    this.rebakeMeshChunksForBrushes(brushIds);
  }

  /**
   * Collects unique brush ids referenced by result face maps.
   * @param maps Result face texture maps.
   * @param sources Per-triangle solid sources.
   * @returns Brush ids whose UV chunks should rebake.
   */
  private collectBrushIdsFromMaps(
    maps: Array<{ triangleIndices: number[] }>,
    sources: Array<{ brushId: string; surfaceIndex: number }>,
  ): Set<string> {
    const brushIds = new Set<string>();
    for (const entry of maps) {
      for (const triangleIndex of entry.triangleIndices) {
        const source = sources[triangleIndex];
        if (source?.brushId) brushIds.add(source.brushId);
      }
    }
    return brushIds;
  }

  /**
   * Rebuilds mesh chunks for specific brushes from cached polygons and current maps.
   * When layout is stable, patches only those UV ranges into the result mesh.
   * @param brushIds Brushes whose chunks need UV rebake.
   */
  private rebakeMeshChunksForBrushes(brushIds: Set<string>): void {
    if (brushIds.size === 0) return;
    this.resultMesh.updateMatrixWorld(true);
    const worldMatrix = this.resultMesh.matrixWorld;
    const order = this.compiler.getLastBrushOrder();
    const dirtyIds: string[] = [];
    for (const brushId of brushIds) {
      if (!this.compiler.getCachedPolygons(brushId)) continue;
      this.rebuildOneMeshChunk(brushId, worldMatrix);
      dirtyIds.push(brushId);
    }
    if (dirtyIds.length === 0 || order.length === 0) return;
    this.ensureMeshChunksForBrushOrder(order);
    const patched = this.resultBuffer.tryPatchDirty(dirtyIds, order, this.meshChunkCache);
    if (!patched) {
      this.resultBuffer.rebuildFull(order, this.meshChunkCache);
    }
    this.uploadResultBufferToMesh(patched);
    this.lastSurfaceRegions = this.resultBuffer.getSurfaceRegions();
    this.resultMesh.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] =
      this.resultBuffer.getTriangleSources();
  }

  /**
   * Applies one result-mesh mapping to the brush faces that own its triangles.
   * @param triangleIndices Result triangle indices for the region.
   * @param mapping Authored mapping from the UV editor or texture tools.
   * @param sources Per-triangle brush surface sources.
   */
  private writeMapEntryToBrushFaces(
    triangleIndices: number[],
    mapping: FaceTextureMapping,
    sources: Array<{ brushId: string; surfaceIndex: number }>,
  ): void {
    const written = new Set<string>();
    for (const triangleIndex of triangleIndices) {
      const source = sources[triangleIndex];
      if (!source?.brushId) continue;
      const key = `${source.brushId}:${source.surfaceIndex}`;
      if (written.has(key)) continue;
      written.add(key);
      const brush = this.findBrush(source.brushId);
      if (!brush) continue;
      brush.setFaceMapping(source.surfaceIndex, mapping);
    }
  }

  /**
   * Returns whether the result mesh has triangle geometry.
   * @returns True when a position attribute with vertices exists.
   */
  private hasResultGeometry(): boolean {
    const position = this.resultMesh.geometry.getAttribute('position');
    return !!position && position.count >= 3;
  }

  /**
   * Keeps the compiled mesh at local identity under the solid model root.
   */
  private resetResultLocalTransform(): void {
    this.resultMesh.position.set(0, 0, 0);
    this.resultMesh.rotation.set(0, 0, 0);
    this.resultMesh.scale.set(1, 1, 1);
  }

  /**
   * Creates the empty result mesh that receives compiled solid geometry.
   * @returns Result mesh child.
   */
  private createResultMesh(): THREE.Mesh {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(0), 3));
    const material = createContentMaterial(Theme.boxColor);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'Result';
    mesh.userData[SOLID_MODEL_RESULT_USERDATA_KEY] = true;
    return mesh;
  }

  /**
   * Replaces result buffer attributes with compiled triangle data.
   * @param positions Position floats.
   * @param normals Normal floats.
   * @param uvs Optional UV floats (2 components per vertex).
   */
  private replaceResultGeometry(
    positions: Float32Array,
    normals: Float32Array,
    uvs?: Float32Array,
  ): void {
    const oldGeometry = this.resultMesh.geometry;
    const geometry = new THREE.BufferGeometry();
    const safePositions = positions.length >= 9 ? positions : new Float32Array(0);
    const safeNormals =
      normals.length === safePositions.length ? normals : new Float32Array(safePositions.length);
    const safeUvs = this.buildSafeUvArray(safePositions.length / 3, uvs);
    geometry.setAttribute('position', new THREE.BufferAttribute(safePositions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(safeNormals, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(safeUvs, 2));
    if (safePositions.length > 0) {
      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();
    }
    this.resultMesh.geometry = geometry;
    oldGeometry.dispose();
    this.stripStaleDecorativeEdges(this.resultMesh);
  }

  /**
   * Builds a UV array matching vertex count.
   * @param vertexCount Number of vertices.
   * @param uvs Optional source UVs.
   * @returns UV float array of length vertexCount * 2.
   */
  private buildSafeUvArray(vertexCount: number, uvs: Float32Array | undefined): Float32Array {
    const expected = vertexCount * 2;
    if (uvs && uvs.length === expected) return uvs;
    return new Float32Array(expected);
  }

  /**
   * Removes decorative edge children from a mesh.
   * @param mesh Mesh to clean.
   */
  private stripStaleDecorativeEdges(mesh: THREE.Mesh): void {
    const stale = mesh.children.filter(
      (child) => child.userData[DECORATIVE_EDGE_USERDATA_KEY] === true,
    );
    for (const child of stale) {
      mesh.remove(child);
      if (child instanceof THREE.LineSegments) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) child.material.dispose();
      }
    }
  }

  /**
   * Disposes geometry and materials for a removed brush mesh.
   * Shared brush edge materials are retained for reuse.
   * @param mesh Brush preview mesh.
   */
  private disposeMeshResources(mesh: THREE.Mesh): void {
    mesh.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
        child.geometry?.dispose();
        this.disposeOwnedMaterials(child.material);
      }
    });
  }

  /**
   * Disposes mesh-owned materials while leaving shared edge materials alive.
   * @param material Material or material array on a disposed mesh child.
   */
  private disposeOwnedMaterials(material: THREE.Material | THREE.Material[] | undefined): void {
    if (Array.isArray(material)) {
      material.forEach((entry) => this.disposeOwnedMaterial(entry));
      return;
    }
    if (material) this.disposeOwnedMaterial(material);
  }

  /**
   * Disposes one material unless it is a shared brush edge material.
   * @param material Material to dispose.
   */
  private disposeOwnedMaterial(material: THREE.Material): void {
    if (SolidBrushEdgeMaterials.isSharedMaterial(material)) return;
    material.dispose();
  }

  /**
   * Registers a brush at a list index, ensuring preview mesh and sibling order.
   * @param instance Brush instance to own.
   * @param listIndex Desired index in the evaluation list.
   * @param previewSize Default box preview edge length when mesh is missing.
   */
  private registerBrushAt(
    instance: SolidBrushInstance,
    listIndex: number,
    previewSize: number,
  ): void {
    if (this.findBrush(instance.id)) return;
    this.ensureBrushPreviewMesh(instance, previewSize);
    const clampedIndex = Math.max(0, Math.min(listIndex, this.brushes.length));
    this.brushes.splice(clampedIndex, 0, instance);
    this.applyBrushMeshSiblingOrder();
  }

  /**
   * Creates and attaches a hull preview matching the brush solid when missing.
   * Falls back to a sized box only when the brush topology is empty.
   * @param instance Brush instance.
   * @param previewSize Fallback box edge length when hull data is missing.
   */
  private ensureBrushPreviewMesh(instance: SolidBrushInstance, previewSize: number): void {
    if (instance.mesh) {
      instance.pushTransformToMesh();
      return;
    }
    if (instance.brush.faces.length >= 4 && instance.brush.vertices.length >= 4) {
      const hullPreview = SolidBrushVisual.createHullPreview(
        instance.name,
        instance.brush,
        instance.operation,
      );
      instance.attachMesh(hullPreview);
      return;
    }
    const measuredSize = this.estimateBrushPreviewSize(instance);
    const size = measuredSize > 1e-6 ? measuredSize : previewSize;
    const boxPreview = SolidBrushVisual.createBoxPreview(instance.name, size, instance.operation);
    instance.attachMesh(boxPreview);
  }

  /**
   * Reorders brush preview meshes under the root to match evaluation list order.
   */
  private applyBrushMeshSiblingOrder(): void {
    for (const brush of this.brushes) {
      if (!brush.mesh) continue;
      this.root.add(brush.mesh);
    }
  }

  /**
   * Moves listed brushes to the first or last evaluation slots and rebuilds.
   * @param brushIds Brushes to move (unknown ids ignored).
   * @param end Which end of the evaluation list to place them on.
   * @returns True when order changed.
   */
  private reorderBrushesToEnd(brushIds: readonly string[], end: 'first' | 'last'): boolean {
    const moving: SolidBrushInstance[] = [];
    const movingIds = new Set<string>();
    for (const brushId of brushIds) {
      if (movingIds.has(brushId)) continue;
      const brush = this.findBrush(brushId);
      if (!brush) continue;
      moving.push(brush);
      movingIds.add(brushId);
    }
    if (moving.length === 0) return false;
    const remaining = this.brushes.filter((brush) => !movingIds.has(brush.id));
    const next = end === 'first' ? moving.concat(remaining) : remaining.concat(moving);
    let changed = false;
    for (let index = 0; index < next.length; index++) {
      if (next[index].id !== this.brushes[index].id) {
        changed = true;
        break;
      }
    }
    if (!changed) return false;
    this.brushes = next;
    this.applyBrushMeshSiblingOrder();
    this.markDirty();
    this.rebuild(true);
    return true;
  }

  /**
   * Applies surface materials on the next frame after interactive commit.
   * CSG result meshes never use white content outline edges (brushes own edges).
   */
  private schedulePresentationRefresh(): void {
    const mesh = this.resultMesh;
    requestAnimationFrame(() => {
      if (this.resultMesh !== mesh) return;
      if (!this.hasResultGeometry()) return;
      this.applySurfaceLayoutToResult(true);
      this.clearResultContentEdges();
    });
  }

  /**
   * Ensures the solid result mesh has no content decorative outline edges.
   * Brush volume helpers provide colored edges; result shows solid surfaces only.
   */
  private clearResultContentEdges(): void {
    removeDecorativeEdges(this.resultMesh);
  }

  /**
   * Allocates a unique brush id.
   * @returns Unique string id.
   */
  private allocateBrushId(): string {
    return `${this.root.uuid}-brush-${this.brushCounter}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Pads a number to two digits.
   * @param value Number to pad.
   * @returns Zero-padded string.
   */
  private padNumber(value: number): string {
    return value < 10 ? `0${value}` : String(value);
  }
}

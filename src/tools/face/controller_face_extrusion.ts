import * as THREE from 'three';
import { SelectionMode } from '@/types/selection_mode.js';
import { FaceSelection, ManagerFaceSelection } from '@/selection/face/manager_face_selection.js';
import { RaycasterFaceSelection, FacePickResult } from '@/selection/face/raycaster_face_selection.js';
import { FaceSelectionHighlight } from '@/selection/face/face_selection_highlight.js';
import { CommandStack } from '@/commands/command_stack.js';
import { ExtrudeCreation, CommandMeshFacesExtrude } from '@/tools/face/commands/command_mesh_faces_extrude.js';
import { createConvexPrismFromFace } from '@/transform/extrusion/convex_face_prism.js';
import { createConvexPrismBrushFromFace } from '@/transform/extrusion/convex_face_prism_brush.js';
import { groupSelectionsIntoFaceRegions, FaceRegion } from '@/selection/face/face_region_grouper.js';
import { buildFacePickRegionKey } from '@/selection/face/solid_triangle_source_index.js';
import { SOLID_TRIANGLE_SOURCES_USERDATA_KEY } from '@/solid/model/solid_model_keys.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import type { SolidTriangleSourceRef } from '@/selection/face/solid_result_face_indices.js';

/**
 * Callback for selection mode changes.
 *
 * @param mode The new selection mode.
 */
export type SelectionModeCallback = (mode: SelectionMode) => void;

/**
 * Callback for face selection set changes.
 *
 * @param faces The current face selection entries.
 */
export type FaceSelectionChangedListener = (faces: FaceSelection[]) => void;

/**
 * Central controller for face selection and extrusion operations. Extrusion
 * creates a new convex prism object; source meshes stay unchanged.
 */
export class ControllerFaceExtrusion {
  private selectionManager: ManagerFaceSelection;
  private raycaster: RaycasterFaceSelection;
  private highlight: FaceSelectionHighlight | null;
  private commandStack: CommandStack;
  private gridSnap: GridSnap;
  private worldRoot: THREE.Object3D;
  private currentMode: SelectionMode;
  private modeChangedCallback: SelectionModeCallback | null;
  private faceSelectionChangedCallback: FaceSelectionChangedListener | null;
  private availableMeshes: THREE.Mesh[];
  private extrudeCounter: number;
  private lastCreatedMeshes: THREE.Mesh[];
  private isFaceDragActive: boolean;
  private lastDragRegionKey: string | null;
  /** True when external listeners need a post-drag selection notification. */
  private externalSelectionNotifyPending: boolean;

  /**
   * Creates a new face extrusion controller.
   *
   * @param scene The Three.js scene for highlight rendering.
   * @param commandStack The command stack for undo/redo.
   * @param gridSnap The grid snap configuration for snapping extrusion
   *   distances.
   * @param worldRoot The parent group for newly created extrusion meshes.
   */
  constructor(scene: THREE.Scene, commandStack: CommandStack, gridSnap: GridSnap, worldRoot: THREE.Object3D) {
    this.selectionManager = new ManagerFaceSelection();
    this.raycaster = new RaycasterFaceSelection();
    this.highlight = new FaceSelectionHighlight(scene);
    this.commandStack = commandStack;
    this.gridSnap = gridSnap;
    this.worldRoot = worldRoot;
    this.currentMode = SelectionMode.OBJECT;
    this.modeChangedCallback = null;
    this.faceSelectionChangedCallback = null;
    this.availableMeshes = [];
    this.extrudeCounter = 0;
    this.lastCreatedMeshes = [];
    this.isFaceDragActive = false;
    this.lastDragRegionKey = null;
    this.externalSelectionNotifyPending = false;
    this.bindSelectionChangeCallback();
  }

  /** Binds the internal selection change callback to update highlights. */
  private bindSelectionChangeCallback(): void {
    this.selectionManager.setSelectionChangedCallback((faces) => this.onFaceSelectionChanged(faces));
  }

  /**
   * Registers a listener for face selection changes (highlights stay internal).
   * Heavy listeners (UV editor target rebuild) are deferred while
   * drag-painting.
   *
   * @param callback Invoked with the current face list, or null to clear.
   */
  setFaceSelectionChangedCallback(callback: FaceSelectionChangedListener | null): void {
    this.faceSelectionChangedCallback = callback;
  }

  /**
   * Handles face selection changes by updating visual highlights immediately.
   * External listeners are deferred during drag-paint so UV/target rebuilds do
   * not run once per painted surface.
   *
   * @param faces The new set of selected faces.
   */
  private onFaceSelectionChanged(faces: FaceSelection[]): void {
    if (this.highlight) {
      this.highlight.setSelectedFaces(faces);
    }
    if (!this.faceSelectionChangedCallback) return;
    if (this.isFaceDragActive) {
      this.externalSelectionNotifyPending = true;
      return;
    }
    this.faceSelectionChangedCallback(faces);
  }

  /** Notifies deferred external selection listeners after a drag ends. */
  private flushExternalSelectionNotify(): void {
    if (!this.externalSelectionNotifyPending) return;
    this.externalSelectionNotifyPending = false;
    if (!this.faceSelectionChangedCallback) return;
    this.faceSelectionChangedCallback(this.selectionManager.getSelectedFaces());
  }

  /**
   * Sets the current selection mode.
   *
   * @param mode The selection mode to activate.
   */
  setSelectionMode(mode: SelectionMode): void {
    if (mode === this.currentMode) return;
    if (mode === SelectionMode.OBJECT) {
      this.selectionManager.deselectAll();
    }
    this.currentMode = mode;
    this.notifyModeChange();
  }

  /**
   * Returns the current selection mode.
   *
   * @returns The active selection mode.
   */
  getSelectionMode(): SelectionMode {
    return this.currentMode;
  }

  /**
   * Registers a callback for selection mode changes.
   *
   * @param callback The function to call when mode changes.
   */
  setModeChangedCallback(callback: SelectionModeCallback): void {
    this.modeChangedCallback = callback;
  }

  /** Notifies the mode change callback of a mode transition. */
  private notifyModeChange(): void {
    if (this.modeChangedCallback) {
      this.modeChangedCallback(this.currentMode);
    }
  }

  /**
   * Updates the available meshes for face picking.
   *
   * @param meshes The meshes in the scene.
   */
  setAvailableMeshes(meshes: THREE.Mesh[]): void {
    this.availableMeshes = meshes;
  }

  /**
   * Returns the current face-pick mesh list (for tests).
   *
   * @returns Available meshes array.
   */
  getAvailableMeshesForTesting(): THREE.Mesh[] {
    return this.availableMeshes.slice();
  }

  /**
   * Processes a pointer down event for face selection. Starts a drag-paint
   * session so holding and moving selects more faces.
   *
   * @param event The pointer event.
   * @param camera The viewport camera.
   * @param renderer The viewport renderer.
   * @returns The picked face when a hit occurred, otherwise null (event still
   *   consumed while in face mode).
   */
  onPointerDown(event: MouseEvent, camera: THREE.Camera, pickElement: HTMLElement): FacePickResult | null {
    if (this.currentMode !== SelectionMode.FACE) return null;
    this.isFaceDragActive = true;
    this.lastDragRegionKey = null;
    const result = this.raycaster.pickFace(event, camera, pickElement, this.availableMeshes);
    if (!result) {
      if (!event.shiftKey) {
        this.selectionManager.deselectAll();
      }
      return null;
    }
    this.paintSelectFace(result, event.shiftKey, false);
    return result;
  }

  /**
   * Continues face drag-paint while the pointer moves with the button held. New
   * faces under the cursor are added to the selection.
   *
   * @param event The pointer event.
   * @param camera The viewport camera.
   * @param renderer The viewport renderer.
   * @returns The painted pick result, or null when nothing new was painted.
   */
  onPointerMove(event: MouseEvent, camera: THREE.Camera, pickElement: HTMLElement): FacePickResult | null {
    if (this.currentMode !== SelectionMode.FACE) return null;
    if (!this.isFaceDragActive) return null;
    const result = this.raycaster.pickFace(event, camera, pickElement, this.availableMeshes);
    if (!result) return null;
    this.paintSelectFace(result, true, true);
    return result;
  }

  /** Ends a face drag-paint session and flushes deferred selection listeners. */
  onPointerUp(): void {
    this.isFaceDragActive = false;
    this.lastDragRegionKey = null;
    this.flushExternalSelectionNotify();
  }

  /**
   * Returns whether a face drag-paint session is active.
   *
   * @returns True while dragging to select faces.
   */
  isDraggingFaces(): boolean {
    return this.isFaceDragActive;
  }

  /**
   * Picks a face at the pointer without changing selection (for smear tools).
   *
   * @param event The pointer event.
   * @param camera The viewport camera.
   * @param renderer The viewport renderer.
   * @returns Pick result or null.
   */
  pickFaceAtPointer(event: MouseEvent, camera: THREE.Camera, pickElement: HTMLElement): FacePickResult | null {
    if (this.currentMode !== SelectionMode.FACE) return null;
    return this.raycaster.pickFace(event, camera, pickElement, this.availableMeshes);
  }

  /**
   * Selects the face unit for a pick, optionally additive while dragging. Solid
   * results expand only within one brush face; ordinary meshes use coplanar.
   *
   * @param result The raycast pick result.
   * @param addToSelection Whether to add to existing selection.
   * @param skipIfSameRegion When true, ignores repeats of the last drag region.
   */
  private paintSelectFace(result: FacePickResult, addToSelection: boolean, skipIfSameRegion: boolean): void {
    const regionKey = buildFacePickRegionKey(result.mesh, result.faceIndex);
    if (skipIfSameRegion && regionKey === this.lastDragRegionKey) return;
    this.lastDragRegionKey = regionKey;
    this.selectionManager.selectFace(result.mesh, result.faceIndex, addToSelection);
  }

  /**
   * Returns the current set of selected faces.
   *
   * @returns The face selection array.
   */
  getSelectedFaces(): FaceSelection[] {
    return this.selectionManager.getSelectedFaces();
  }

  /**
   * Returns the count of selected faces.
   *
   * @returns The number of selected faces.
   */
  getSelectedFaceCount(): number {
    return this.selectionManager.getSelectedFaceCount();
  }

  /**
   * Programmatically selects a face on a mesh. Useful for testing.
   *
   * @param mesh The mesh containing the face.
   * @param faceIndex The triangle index to select.
   * @param addToSelection Whether to add to existing selection.
   */
  selectFace(mesh: THREE.Mesh, faceIndex: number, addToSelection: boolean): void {
    this.selectionManager.selectFace(mesh, faceIndex, addToSelection);
  }

  /**
   * Extrudes selected faces by the current snap interval (or 1.0 if snap is
   * off).
   *
   * @returns Newly created convex prism meshes (one per face region).
   */
  extrudeSelectedFacesByDefaultDistance(): THREE.Mesh[] {
    const distance = this.resolveDefaultExtrudeDistance();
    return this.extrudeSelectedFaces(distance);
  }

  /**
   * Chooses a sensible default extrude distance from snap settings.
   *
   * @returns Positive extrude distance.
   */
  private resolveDefaultExtrudeDistance(): number {
    if (this.gridSnap.isEnabled()) {
      return Math.max(this.gridSnap.getInterval(), 0.01);
    }
    return 1.0;
  }

  /**
   * Creates one new convex prism per distinct selected face region. Solid
   * result faces spawn brushes on their solid model; ordinary mesh faces spawn
   * regular meshes. Source geometry is never modified.
   *
   * @param displacement The extrusion distance along each face normal.
   * @returns Selectable created meshes (prisms and/or brush previews).
   */
  extrudeSelectedFaces(displacement: number): THREE.Mesh[] {
    const faces = this.selectionManager.getSelectedFaces();
    if (faces.length === 0) return [];
    const regions = groupSelectionsIntoFaceRegions(faces);
    if (regions.length === 0) return [];
    const safeDistance = this.resolveSafeDistance(displacement);
    const creations = this.buildExtrudeCreations(regions, safeDistance);
    if (creations.length === 0) return [];
    const command = new CommandMeshFacesExtrude(creations);
    this.commandStack.push(command);
    this.lastCreatedMeshes = command.getCreatedMeshes();
    this.selectionManager.deselectAll();
    return this.lastCreatedMeshes.slice();
  }

  /**
   * Builds mesh and brush extrude products for each face region.
   *
   * @param regions Distinct selected face regions.
   * @param distance Safe extrude distance.
   * @returns Creations ready for the undo command.
   */
  private buildExtrudeCreations(regions: FaceRegion[], distance: number): ExtrudeCreation[] {
    const creations: ExtrudeCreation[] = [];
    regions.forEach((region) => {
      const creation = this.buildExtrudeCreationForRegion(region, distance);
      if (creation) {
        creations.push(creation);
      }
    });
    return creations;
  }

  /**
   * Builds one extrude product for a face region (mesh or solid brush).
   *
   * @param region Face region to extrude.
   * @param distance Extrude distance along the face normal.
   * @returns Creation entry, or null when geometry could not be built.
   */
  private buildExtrudeCreationForRegion(region: FaceRegion, distance: number): ExtrudeCreation | null {
    const solidContext = this.resolveSolidBrushContext(region);
    if (solidContext) {
      return this.buildBrushExtrudeCreation(region, distance, solidContext);
    }
    return this.buildMeshExtrudeCreation(region, distance);
  }

  /**
   * Builds a regular mesh prism for a non-solid face region.
   *
   * @param region Ordinary mesh face region.
   * @param distance Extrude distance.
   * @returns Mesh creation, or null on failure.
   */
  private buildMeshExtrudeCreation(region: FaceRegion, distance: number): ExtrudeCreation | null {
    this.extrudeCounter += 1;
    const objectName = `Extrude${String(this.extrudeCounter).padStart(3, '0')}`;
    const prism = createConvexPrismFromFace(region.mesh, region.faceIndices, distance, objectName);
    if (!prism) return null;
    return { kind: 'mesh', mesh: prism, parent: this.worldRoot };
  }

  /**
   * Builds a solid brush prism under the owning solid model.
   *
   * @param region Solid result face region.
   * @param distance Extrude distance.
   * @param context Owning model and source brush metadata.
   * @returns Brush creation, or null on failure.
   */
  private buildBrushExtrudeCreation(
    region: FaceRegion,
    distance: number,
    context: { model: SolidModel; brushId: string; surfaceIndex: number },
  ): ExtrudeCreation | null {
    const placement = createConvexPrismBrushFromFace(region.mesh, region.faceIndices, distance, context.model.root);
    if (!placement) return null;
    const sourceBrush = context.model.findBrush(context.brushId);
    const operation = sourceBrush?.operation ?? SolidOperation.Additive;
    const textureId = sourceBrush?.getSurfaceTextureId(context.surfaceIndex);
    const instance = context.model.prepareTopologyBrush(placement.brush, operation, placement.localPosition, textureId);
    return { kind: 'brush', model: context.model, instance };
  }

  /**
   * Resolves solid model and authored brush face when the region belongs to a
   * CSG result surface.
   *
   * @param region Candidate face region.
   * @returns Solid context, or null for ordinary meshes.
   */
  private resolveSolidBrushContext(
    region: FaceRegion,
  ): { model: SolidModel; brushId: string; surfaceIndex: number } | null {
    if (!SolidModel.isResultMesh(region.mesh)) return null;
    if (SolidBrushVisual.isBrushObject(region.mesh)) return null;
    const model = SolidModel.fromObject(region.mesh);
    if (!model) return null;
    const seedIndex = region.faceIndices[0];
    if (seedIndex === undefined) return null;
    const source = this.readTriangleSource(region.mesh, seedIndex);
    if (!source) return null;
    return { model, brushId: source.brushId, surfaceIndex: source.surfaceIndex };
  }

  /**
   * Reads the authored solid triangle source for a result triangle.
   *
   * @param mesh Solid result mesh.
   * @param faceIndex Triangle index.
   * @returns Source ref, or null when missing.
   */
  private readTriangleSource(mesh: THREE.Mesh, faceIndex: number): SolidTriangleSourceRef | null {
    const raw = mesh.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY];
    if (!Array.isArray(raw) || raw.length === 0) return null;
    const seed = raw[faceIndex] as SolidTriangleSourceRef | undefined;
    if (!seed?.brushId || typeof seed.surfaceIndex !== 'number') return null;
    return seed;
  }

  /**
   * Returns meshes created by the most recent extrude.
   *
   * @returns The last extruded meshes.
   */
  getLastCreatedMeshes(): THREE.Mesh[] {
    return this.lastCreatedMeshes.slice();
  }

  /**
   * Returns the first mesh from the most recent extrude, if any.
   *
   * @returns The first extruded mesh, or null.
   */
  getLastCreatedMesh(): THREE.Mesh | null {
    return this.lastCreatedMeshes.length > 0 ? this.lastCreatedMeshes[0]! : null;
  }

  /**
   * Resolves a usable extrude distance from the requested value and snap state.
   *
   * @param displacement Requested displacement.
   * @returns Non-zero extrude distance.
   */
  private resolveSafeDistance(displacement: number): number {
    const snappedDisplacement = this.gridSnap.isEnabled() ? this.gridSnap.snapValue(displacement) : displacement;
    if (Math.abs(snappedDisplacement) < 1e-8) {
      return this.resolveDefaultExtrudeDistance();
    }
    return snappedDisplacement;
  }

  /**
   * Clears face selection and recent extrude bookkeeping. Safe to call when the
   * scene graph is replaced (load) or reset.
   */
  clearFaceSelection(): void {
    this.selectionManager.deselectAll();
    this.lastCreatedMeshes = [];
  }

  /**
   * Removes face selections that no longer exist in the world (mesh deleted,
   * triangle gone, or solid brush surface removed by undo). Other faces in a
   * multi-selection are kept.
   *
   * @param sceneRoot World root for membership tests.
   * @returns True when any face was dropped.
   */
  pruneInvalidFaceSelection(sceneRoot: THREE.Object3D): boolean {
    return this.selectionManager.pruneInvalidSelections(sceneRoot);
  }

  /** Disposes all internal resources. */
  dispose(): void {
    this.highlight?.dispose();
    this.highlight = null;
    this.raycaster.dispose();
    this.selectionManager.clear();
    this.availableMeshes = [];
    this.lastCreatedMeshes = [];
  }
}

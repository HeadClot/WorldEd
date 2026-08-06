import * as THREE from 'three';
import type { CoordinatorEditorOrientation } from '@/navigation/orientation/coordinator_editor_orientation.js';
import type { EditorOrientationAxisId } from '@/navigation/orientation/editor_orientation_axis.js';
import type { ViewportEditor } from '@/viewports/core/viewport_editor.js';
import { findPickSurfaceAtClientPoint } from '@/utils/pointer_client_hit.js';
import {
  gridAlignPickModeFromAxis,
  gridAlignPickModeIsEdge,
  gridAlignPickModeIsFace,
  gridAlignPickModeIsVertexOrigin,
  gridAlignPickModeToAxis,
  type GridAlignPickMode,
} from './grid_align_pick_mode.js';
import { PickerGridFaceAlign } from './picker_grid_face_align.js';
import { PickerGridEdgeAlign, resolveNearestEdgeEndpointForOrigin } from './picker_grid_edge_align.js';
import { PickerGridVertexOrigin } from './picker_grid_vertex_origin.js';
import { PreviewGridFaceAlign } from './preview_grid_face_align.js';
import { PreviewGridEdgeAlign } from './preview_grid_edge_align.js';
import { PreviewGridVertexOrigin } from './preview_grid_vertex_origin.js';

/** Dependencies for grid and camera orientation picks. */
export interface HandlerGridOrientationDependencies {
  worldObject: THREE.Group;
  orientationCoordinator: CoordinatorEditorOrientation;
  getViewports: () => readonly ViewportEditor[];
  getPrimaryScene: () => THREE.Scene;
  showStatusMessage: (message: string) => void;
  /**
   * Notified when the armed single-use pick mode changes (for chrome
   * highlight).
   */
  onPickModeChanged?: (mode: GridAlignPickMode) => void;
  /**
   * Returns whether Shift is held. When true during edge align, origin stays on
   * the free edge point (no vertex snap / Zero Origin).
   */
  isShiftPressed?: () => boolean;
}

/**
 * Owns grid tool actions: independent grid and camera resets, face align, and
 * edge axis align with non-picking triad preview.
 */
export class HandlerGridOrientation {
  private readonly deps: HandlerGridOrientationDependencies;
  private readonly facePicker: PickerGridFaceAlign;
  private readonly edgePicker: PickerGridEdgeAlign;
  private readonly vertexPicker: PickerGridVertexOrigin;
  private facePreview: PreviewGridFaceAlign | null;
  private edgePreview: PreviewGridEdgeAlign | null;
  private vertexPreview: PreviewGridVertexOrigin | null;
  private pickMode: GridAlignPickMode;
  private lastEdgeHover: {
    axis: EditorOrientationAxisId;
    edge: import('./picker_grid_edge_align.js').GridEdgePickResult;
    camera: THREE.Camera;
  } | null;

  /**
   * Creates a grid orientation handler.
   *
   * @param deps Shared world, orientation, and status services.
   */
  constructor(deps: HandlerGridOrientationDependencies) {
    this.deps = deps;
    this.facePicker = new PickerGridFaceAlign();
    this.edgePicker = new PickerGridEdgeAlign();
    this.vertexPicker = new PickerGridVertexOrigin();
    this.facePreview = null;
    this.edgePreview = null;
    this.vertexPreview = null;
    this.pickMode = 'none';
    this.lastEdgeHover = null;
  }

  /**
   * Returns whether any orientation pick is armed.
   *
   * @returns True while waiting for a face or edge click.
   */
  isAlignPickArmed(): boolean {
    return this.pickMode !== 'none';
  }

  /**
   * Returns the current armed pick mode.
   *
   * @returns Pick mode.
   */
  getPickMode(): GridAlignPickMode {
    return this.pickMode;
  }

  /** Arms single-use face pick for grid align-to-face. */
  armAlignPick(): void {
    this.armMode('grid_face', 'Click a face to align the grid · Esc cancels');
  }

  /**
   * Arms single-use edge pick for grid axis align.
   *
   * @param axis Working-frame axis to assign from the edge.
   */
  armEdgeAlignPick(axis: EditorOrientationAxisId): void {
    const mode = gridAlignPickModeFromAxis(axis);
    const label = axis.toUpperCase();
    this.armMode(mode, `Click an edge to align grid ${label} · Esc cancels`);
  }

  /** Arms single-use face pick for camera align-to-face. */
  armCameraAlignPick(): void {
    this.armMode('camera_face', 'Click a face to align the camera · Esc cancels');
  }

  /** Arms single-use vertex pick to zero the grid lattice origin. */
  armOriginVertexPick(): void {
    this.armMode('grid_origin_vertex', 'Click a vertex to zero the grid origin · Esc cancels');
  }

  /** Disarms the current pick without changing orientation. */
  disarmAlignPick(): void {
    if (this.pickMode === 'none') {
      return;
    }
    this.setPickMode('none');
    this.clearHoverPreview();
    this.deps.showStatusMessage('Orientation pick cancelled');
  }

  /** Resets only the grid orientation to world defaults. */
  resetOrientation(): void {
    this.clearArmedPickQuietly();
    this.deps.orientationCoordinator.resetGridToDefault();
  }

  /** Resets only the camera orientation to world defaults. */
  resetCameraOrientation(): void {
    this.clearArmedPickQuietly();
    this.deps.orientationCoordinator.resetCameraToDefault();
  }

  /**
   * Updates hover preview under the pointer while a pick is armed.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param camera Viewport camera under the pointer.
   * @param pickElement Viewport pick element under the pointer.
   */
  updateHoverAtPointer(clientX: number, clientY: number, camera: THREE.Camera, pickElement: HTMLElement): void {
    if (this.pickMode === 'none') {
      return;
    }
    if (gridAlignPickModeIsFace(this.pickMode)) {
      this.updateFaceHover(clientX, clientY, camera, pickElement);
      return;
    }
    if (gridAlignPickModeIsEdge(this.pickMode)) {
      this.updateEdgeHover(clientX, clientY, camera, pickElement);
      return;
    }
    if (gridAlignPickModeIsVertexOrigin(this.pickMode)) {
      this.updateVertexHover(clientX, clientY, camera, pickElement);
    }
  }

  /** Clears hover when the pointer leaves pickable content. */
  clearHoverPreview(): void {
    this.facePreview?.clearHover();
    this.edgePreview?.clearPreview();
    this.vertexPreview?.clearHover();
    this.lastEdgeHover = null;
  }

  /**
   * Refreshes constant on-screen scale and Shift free-origin highlight state
   * for visible edge-align arrows. Call each frame so camera fly/zoom and Shift
   * toggles update without pointer motion.
   */
  updatePreviewScreenScales(): void {
    if (this.lastEdgeHover && gridAlignPickModeIsEdge(this.pickMode)) {
      this.showEdgePreview(this.lastEdgeHover.axis, this.lastEdgeHover.edge, this.lastEdgeHover.camera);
      return;
    }
    this.edgePreview?.updateScreenScale();
  }

  /**
   * Attempts a pick at the given client point with known camera and element.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param camera Viewport camera under the pointer.
   * @param pickElement Viewport pick element under the pointer.
   * @returns True when orientation was applied.
   */
  tryAlignPickAtPointer(clientX: number, clientY: number, camera: THREE.Camera, pickElement: HTMLElement): boolean {
    if (this.pickMode === 'none') {
      return false;
    }
    if (gridAlignPickModeIsFace(this.pickMode)) {
      return this.tryFacePick(clientX, clientY, camera, pickElement);
    }
    if (gridAlignPickModeIsEdge(this.pickMode)) {
      return this.tryEdgePick(clientX, clientY, camera, pickElement);
    }
    if (gridAlignPickModeIsVertexOrigin(this.pickMode)) {
      return this.tryVertexOriginPick(clientX, clientY, camera, pickElement);
    }
    return false;
  }

  /**
   * Attempts a pick by resolving the viewport under the pointer.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param ownerDocument Document that owns the client coordinates, or null.
   * @returns True when orientation was applied.
   */
  tryAlignPickAtClientPoint(clientX: number, clientY: number, ownerDocument: Document | null = null): boolean {
    if (this.pickMode === 'none') {
      return false;
    }
    const pane = this.resolvePickPane(clientX, clientY, ownerDocument);
    if (!pane) {
      this.deps.showStatusMessage('Click in a 3D viewport');
      return false;
    }
    return this.tryAlignPickAtPointer(clientX, clientY, pane.camera, pane.pickElement);
  }

  /**
   * Updates hover by resolving the viewport under the pointer.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param ownerDocument Document that owns the client coordinates, or null.
   */
  updateHoverAtClientPoint(clientX: number, clientY: number, ownerDocument: Document | null = null): void {
    if (this.pickMode === 'none') {
      return;
    }
    const pane = this.resolvePickPane(clientX, clientY, ownerDocument);
    if (!pane) {
      this.clearHoverPreview();
      return;
    }
    this.updateHoverAtPointer(clientX, clientY, pane.camera, pane.pickElement);
  }

  /** Releases preview resources. */
  dispose(): void {
    this.setPickMode('none');
    this.facePreview?.dispose();
    this.facePreview = null;
    this.edgePreview?.dispose();
    this.edgePreview = null;
    this.vertexPreview?.dispose();
    this.vertexPreview = null;
  }

  /**
   * Arms a pick mode and clears the previous preview.
   *
   * @param mode Mode to arm.
   * @param statusMessage Status bar text.
   */
  private armMode(mode: GridAlignPickMode, statusMessage: string): void {
    this.clearHoverPreview();
    this.setPickMode(mode);
    if (gridAlignPickModeIsFace(mode)) {
      this.ensureFacePreview();
    }
    if (gridAlignPickModeIsEdge(mode)) {
      this.ensureEdgePreview();
      this.ensureVertexPreview();
    }
    if (gridAlignPickModeIsVertexOrigin(mode)) {
      this.ensureVertexPreview();
    }
    this.deps.showStatusMessage(statusMessage);
  }

  /** Disarms pick and clears preview without a cancel status message. */
  private clearArmedPickQuietly(): void {
    this.setPickMode('none');
    this.clearHoverPreview();
  }

  /**
   * Stores the armed pick mode and notifies chrome when it changes.
   *
   * @param mode Next pick mode.
   */
  private setPickMode(mode: GridAlignPickMode): void {
    if (this.pickMode === mode) {
      return;
    }
    this.pickMode = mode;
    this.deps.onPickModeChanged?.(mode);
  }

  /**
   * Updates orange face hover while a face mode is armed.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param camera Viewport camera.
   * @param pickElement Viewport pick element.
   */
  private updateFaceHover(clientX: number, clientY: number, camera: THREE.Camera, pickElement: HTMLElement): void {
    const pick = this.pickFaceAt(clientX, clientY, camera, pickElement);
    this.ensureFacePreview().setHoverPick(pick);
  }

  /**
   * Updates edge triad hover while an edge mode is armed.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param camera Viewport camera.
   * @param pickElement Viewport pick element.
   */
  private updateEdgeHover(clientX: number, clientY: number, camera: THREE.Camera, pickElement: HTMLElement): void {
    const axis = gridAlignPickModeToAxis(this.pickMode);
    if (!axis) {
      return;
    }
    const edge = this.pickEdgeAt(clientX, clientY, camera, pickElement);
    if (!edge) {
      this.edgePreview?.clearPreview();
      this.vertexPreview?.clearHover();
      this.lastEdgeHover = null;
      return;
    }
    this.lastEdgeHover = { axis, edge, camera };
    this.showEdgePreview(axis, edge, camera);
  }

  /**
   * Shows the proposed triad under the cursor. Without Shift, also shows a
   * white marker on the edge endpoint that will become Zero Origin. With Shift,
   * free edge-point origin and no vertex highlight.
   *
   * @param axis Axis being aligned.
   * @param edge Edge pick.
   * @param camera Viewport camera for look-direction sign.
   */
  private showEdgePreview(
    axis: EditorOrientationAxisId,
    edge: import('./picker_grid_edge_align.js').GridEdgePickResult,
    camera: THREE.Camera,
  ): void {
    const look = new THREE.Vector3();
    camera.getWorldDirection(look);
    const freeEdgeOrigin = this.isShiftPressedForEdgeAlign();
    const planeOrigin = freeEdgeOrigin ? edge.closestPoint : resolveNearestEdgeEndpointForOrigin(edge);
    const outcome = this.deps.orientationCoordinator.previewGridAxisToEdge(axis, edge.direction, planeOrigin, look);
    if (!outcome.ok) {
      this.edgePreview?.clearPreview();
      this.vertexPreview?.clearHover();
      return;
    }
    this.ensureEdgePreview().setPreview(edge.closestPoint, outcome.basis, edge.pointA, edge.pointB, axis, camera);
    if (freeEdgeOrigin) {
      this.vertexPreview?.clearHover();
      return;
    }
    this.ensureVertexPreview().setHoverPoint(planeOrigin);
  }

  /**
   * Returns whether Shift requests free edge-point align without vertex snap.
   *
   * @returns True when Shift is held.
   */
  private isShiftPressedForEdgeAlign(): boolean {
    return this.deps.isShiftPressed?.() === true;
  }

  /**
   * Commits a face pick for grid or camera.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param camera Viewport camera.
   * @param pickElement Viewport pick element.
   * @returns True when applied.
   */
  private tryFacePick(clientX: number, clientY: number, camera: THREE.Camera, pickElement: HTMLElement): boolean {
    const pick = this.pickFaceAt(clientX, clientY, camera, pickElement);
    if (!pick) {
      this.deps.showStatusMessage('No face hit · click a mesh face');
      return false;
    }
    const mode = this.pickMode;
    this.clearArmedPickQuietly();
    if (mode === 'camera_face') {
      this.deps.orientationCoordinator.alignCameraToFace(pick.faceNormal, pick.hitPoint);
      return true;
    }
    this.deps.orientationCoordinator.alignGridToFace(pick.faceNormal, pick.hitPoint);
    return true;
  }

  /**
   * Commits an edge pick for grid axis align.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param camera Viewport camera.
   * @param pickElement Viewport pick element.
   * @returns True when applied.
   */
  private tryEdgePick(clientX: number, clientY: number, camera: THREE.Camera, pickElement: HTMLElement): boolean {
    const axis = gridAlignPickModeToAxis(this.pickMode);
    if (!axis) {
      return false;
    }
    const edge = this.pickEdgeAt(clientX, clientY, camera, pickElement);
    if (!edge) {
      this.deps.showStatusMessage('No edge hit · click a mesh edge');
      return false;
    }
    const look = new THREE.Vector3();
    camera.getWorldDirection(look);
    const freeEdgeOrigin = this.isShiftPressedForEdgeAlign();
    const planeOrigin = freeEdgeOrigin ? edge.closestPoint : resolveNearestEdgeEndpointForOrigin(edge);
    this.clearArmedPickQuietly();
    return this.deps.orientationCoordinator.alignGridAxisToEdge(axis, edge.direction, planeOrigin, look);
  }

  /**
   * Updates vertex hover while origin-zero mode is armed.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param camera Viewport camera.
   * @param pickElement Viewport pick element.
   */
  private updateVertexHover(clientX: number, clientY: number, camera: THREE.Camera, pickElement: HTMLElement): void {
    const vertex = this.pickVertexAt(clientX, clientY, camera, pickElement);
    if (!vertex) {
      this.vertexPreview?.clearHover();
      return;
    }
    this.ensureVertexPreview().setHoverPoint(vertex.worldPoint);
  }

  /**
   * Commits a vertex pick as the grid lattice origin.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param camera Viewport camera.
   * @param pickElement Viewport pick element.
   * @returns True when applied.
   */
  private tryVertexOriginPick(
    clientX: number,
    clientY: number,
    camera: THREE.Camera,
    pickElement: HTMLElement,
  ): boolean {
    const vertex = this.pickVertexAt(clientX, clientY, camera, pickElement);
    if (!vertex) {
      this.deps.showStatusMessage('No vertex hit · click a mesh vertex');
      return false;
    }
    this.clearArmedPickQuietly();
    this.deps.orientationCoordinator.setGridOrigin(vertex.worldPoint);
    return true;
  }

  /**
   * Picks a face using the shared face raycaster.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param camera Viewport camera.
   * @param pickElement Viewport pick element.
   * @returns Face pick result, or null.
   */
  private pickFaceAt(clientX: number, clientY: number, camera: THREE.Camera, pickElement: HTMLElement) {
    const event = this.createSyntheticMouseEvent(clientX, clientY);
    return this.facePicker.pickFace(event, camera, pickElement, this.deps.worldObject);
  }

  /**
   * Picks an edge under the pointer.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param camera Viewport camera.
   * @param pickElement Viewport pick element.
   * @returns Edge pick result, or null.
   */
  private pickEdgeAt(clientX: number, clientY: number, camera: THREE.Camera, pickElement: HTMLElement) {
    const event = this.createSyntheticMouseEvent(clientX, clientY);
    return this.edgePicker.pickEdge(event, camera, pickElement, this.deps.worldObject);
  }

  /**
   * Picks a vertex under the pointer.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param camera Viewport camera.
   * @param pickElement Viewport pick element.
   * @returns Vertex pick result, or null.
   */
  private pickVertexAt(clientX: number, clientY: number, camera: THREE.Camera, pickElement: HTMLElement) {
    const event = this.createSyntheticMouseEvent(clientX, clientY);
    return this.vertexPicker.pickVertex(event, camera, pickElement, this.deps.worldObject);
  }

  /**
   * Resolves camera and pick element for the pane under a client point.
   *
   * @param clientX Pointer client X.
   * @param clientY Pointer client Y.
   * @param ownerDocument Document that owns the client coordinates, or null.
   * @returns Pane pick context, or null.
   */
  private resolvePickPane(
    clientX: number,
    clientY: number,
    ownerDocument: Document | null,
  ): { camera: THREE.Camera; pickElement: HTMLElement } | null {
    const viewport = findPickSurfaceAtClientPoint(
      this.deps.getViewports(),
      (candidate) => candidate.getContentElement(),
      clientX,
      clientY,
      ownerDocument,
    );
    if (!viewport) {
      return null;
    }
    const pickElement = viewport.getContentElement();
    if (!pickElement) {
      return null;
    }
    return {
      camera: viewport.getCamera(),
      pickElement,
    };
  }

  /**
   * Ensures the face hover preview exists.
   *
   * @returns Face preview instance.
   */
  private ensureFacePreview(): PreviewGridFaceAlign {
    if (this.facePreview) {
      return this.facePreview;
    }
    this.facePreview = new PreviewGridFaceAlign(this.deps.getPrimaryScene());
    return this.facePreview;
  }

  /**
   * Ensures the edge triad preview exists.
   *
   * @returns Edge preview instance.
   */
  private ensureEdgePreview(): PreviewGridEdgeAlign {
    if (this.edgePreview) {
      return this.edgePreview;
    }
    this.edgePreview = new PreviewGridEdgeAlign(this.deps.getPrimaryScene());
    return this.edgePreview;
  }

  /**
   * Ensures the vertex origin hover preview exists.
   *
   * @returns Vertex preview instance.
   */
  private ensureVertexPreview(): PreviewGridVertexOrigin {
    if (this.vertexPreview) {
      return this.vertexPreview;
    }
    this.vertexPreview = new PreviewGridVertexOrigin(this.deps.getPrimaryScene());
    return this.vertexPreview;
  }

  /**
   * Creates a synthetic mouse event for raycasting.
   *
   * @param clientX Client X.
   * @param clientY Client Y.
   * @returns Mouse event with client coordinates.
   */
  private createSyntheticMouseEvent(clientX: number, clientY: number): MouseEvent {
    return {
      clientX,
      clientY,
      button: 0,
      buttons: 1,
      preventDefault: () => {},
      stopPropagation: () => {},
    } as unknown as MouseEvent;
  }
}

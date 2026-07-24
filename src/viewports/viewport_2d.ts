import * as THREE from 'three';
import { Theme } from '../theme.js';
import { BaseViewport } from './base_viewport.js';
import { Grids, GridPlane } from './grids.js';
import { OrthoPanHandler } from '../managers/ortho_pan_handler.js';
import { SelectionManager } from '../managers/selection_manager.js';
import { SelectionHighlight } from '../selection/selection_highlight.js';
import { SceneRaycaster } from '../selection/scene_raycaster.js';
import { SelectionClickThrough } from '../selection/selection_click_through.js';
import { TransformCallback, MeshResolveCallback } from './viewport_3d.js';
import { FrustumPlanes } from '../types/frustum_planes.js';
import { ViewportShadingController } from './viewport_shading_controller.js';
import { ShadingMode } from '../types/shading_mode.js';
import { blurActiveFormField } from '../utils/dom_focus.js';
import { clampOrthoZoomFactor } from './ortho_zoom_limits.js';
import { isEditorHelperObject } from '../utils/mesh_edge_sync.js';
import { DEFAULT_ORTHO_HALF_EXTENT } from '../types/editor_config.js';
import { getDefaultSceneFocus } from '../navigation/default_camera_placement.js';
import { OrthoDepthRanger } from './ortho_depth_ranger.js';

export class Viewport2D extends BaseViewport {
  private camera: THREE.OrthographicCamera;
  private grids: Grids;
  private gridPlane: GridPlane;
  private selectableObjects: THREE.Mesh[];
  private selectionManager: SelectionManager | null;
  private selectionHighlight: SelectionHighlight | null;
  private raycaster: SceneRaycaster;
  private worldGroup: THREE.Group | null;
  private gizmoGroup: THREE.Group | null;
  private transformCallback: TransformCallback | null;
  private faceSelectionCallback: ((event: MouseEvent) => boolean) | null;
  private clipPlaneCallback: ((event: MouseEvent) => boolean) | null;
  private meshResolveCallback: MeshResolveCallback | null;
  private shadingController: ViewportShadingController;

  /**
   * Creates a new 2D orthographic viewport. Defaults to wireframe shading:
   * decorative white outlines only (no fill).
   *
   * @param container The DOM element that will contain this viewport.
   * @param name The display name shown in the viewport toolbar.
   * @param plane The grid plane orientation for this viewport.
   * @param cameraPosition The camera position for the orthographic view.
   */
  constructor(container: HTMLElement, name: string, plane: GridPlane, cameraPosition: THREE.Vector3) {
    super(container, name, ShadingMode.WIREFRAME);
    this.gridPlane = plane;
    this.grids = new Grids(50, 50, plane, 'orthographic');
    this.camera = this.createCamera(cameraPosition, plane);
    this.initializeState();
    this.setupPanHandler();
    this.setupClickSelection();
    this.scene.add(this.grids.getScene());
    this.shadingController = new ViewportShadingController(this);
    this.shadingController.setShadingMode(ShadingMode.WIREFRAME);
  }

  /** Initializes the mutable state properties of this viewport. */
  private initializeState(): void {
    this.selectableObjects = [];
    this.selectionManager = null;
    this.selectionHighlight = null;
    this.worldGroup = null;
    this.raycaster = new SceneRaycaster();
    this.faceSelectionCallback = null;
    this.clipPlaneCallback = null;
    this.meshResolveCallback = null;
  }

  /**
   * Sets the world group reference for object collection.
   *
   * @param group The world group containing scene objects.
   */
  setWorldGroup(group: THREE.Group): void {
    this.worldGroup = group;
  }

  /**
   * Collects all selectable meshes from the world group.
   *
   * @returns An array of selectable mesh objects.
   */
  collectSelectableObjects(): THREE.Mesh[] {
    if (!this.worldGroup) return [];
    const meshes: THREE.Mesh[] = [];
    this.worldGroup.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (isEditorHelperObject(child)) return;
      meshes.push(child);
    });
    return meshes;
  }

  /**
   * Sets the selection manager for this viewport.
   *
   * @param manager The selection manager instance.
   */
  setSelectionManager(manager: SelectionManager): void {
    this.selectionManager = manager;
  }

  /**
   * Sets the selection highlight for this viewport.
   *
   * @param highlight The selection highlight instance.
   */
  setSelectionHighlight(highlight: SelectionHighlight): void {
    this.selectionHighlight = highlight;
  }

  /**
   * Sets the selectable objects for raycasting.
   *
   * @param objects The meshes to make selectable.
   */
  setSelectableObjects(objects: THREE.Mesh[]): void {
    this.selectableObjects = objects;
  }

  /**
   * Returns the current selectable objects array.
   *
   * @returns The array of selectable meshes.
   */
  getSelectableObjects(): THREE.Mesh[] {
    return this.selectableObjects;
  }

  /**
   * Sets the gizmo group to be rendered in this viewport. Removes any
   * previously set gizmo group to avoid duplicates.
   *
   * @param group The Three.js group containing gizmo handles.
   */
  setGizmoGroup(group: THREE.Group): void {
    if (this.gizmoGroup) {
      this.scene.remove(this.gizmoGroup);
    }
    this.gizmoGroup = group;
    this.scene.add(group);
  }

  /**
   * Returns the gizmo group for this viewport.
   *
   * @returns The gizmo group, or null if not set.
   */
  getGizmoGroup(): THREE.Group | null {
    return this.gizmoGroup;
  }

  /**
   * Sets the callback to handle transform gizmo pointer events.
   *
   * @param callback The transform event handler function.
   */
  setTransformCallback(callback: TransformCallback): void {
    this.transformCallback = callback;
  }

  /**
   * Sets the callback to handle face selection pointer events.
   *
   * @param callback The face selection event handler function.
   */
  setFaceSelectionCallback(callback: (event: MouseEvent) => boolean): void {
    this.faceSelectionCallback = callback;
  }

  /**
   * Sets the callback to handle clip plane tool pointer events.
   *
   * @param callback The clip plane event handler function.
   */
  setClipPlaneCallback(callback: (event: MouseEvent) => boolean): void {
    this.clipPlaneCallback = callback;
  }

  /**
   * Sets the callback that remaps raycast hits to world meshes.
   *
   * @param callback The mesh resolve function, or null to disable remapping.
   */
  setMeshResolveCallback(callback: MeshResolveCallback | null): void {
    this.meshResolveCallback = callback;
  }

  /** Configures pointer event listeners for selection and transform. */
  private setupClickSelection(): void {
    this.renderer.domElement.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      blurActiveFormField();
      if (this.transformCallback && this.transformCallback(event)) return;
      if (this.faceSelectionCallback && this.faceSelectionCallback(event)) return;
      if (this.clipPlaneCallback && this.clipPlaneCallback(event)) return;
      if (!this.selectionManager) return;
      this.handleObjectSelection(event);
    });
    this.renderer.domElement.addEventListener('pointermove', (event) => {
      if (this.transformCallback) this.transformCallback(event);
    });
    this.renderer.domElement.addEventListener('pointerup', (event) => {
      if (this.transformCallback) this.transformCallback(event);
    });
  }

  /**
   * Handles a mouse click to select or deselect objects. Plain clicks cycle
   * through overlapping meshes; Shift adds; Ctrl/Meta toggles.
   *
   * @param event The pointer event from the click.
   */
  private handleObjectSelection(event: MouseEvent): void {
    const stack = this.getObjectPickStack(event);
    const additive = event.shiftKey;
    const toggle = event.ctrlKey || event.metaKey;
    if (stack.length === 0) {
      if (!additive && !toggle) this.selectionManager?.clearSelection();
      return;
    }
    if (!this.selectionManager) return;
    const picked = this.resolvePickFromStack(stack, additive, toggle);
    if (picked) {
      this.selectionManager.selectFromClick(picked, additive, toggle);
    }
  }

  /**
   * Builds the near-to-far world-mesh pick stack under the pointer. Used for
   * click-through selection and for bounds/gizmo skip decisions.
   *
   * @param event The pointer event providing screen coordinates.
   * @returns Unique world meshes ordered closest to farthest.
   */
  getObjectPickStack(event: MouseEvent): THREE.Mesh[] {
    const objects = this.getEffectiveSelectableObjects();
    if (objects.length === 0) return [];
    const intersections = this.raycaster.castIntersections(this.camera, this.renderer, event, objects);
    return SelectionClickThrough.uniqueMeshesFromHits(intersections, (mesh) => this.resolveClickedMesh(mesh));
  }

  /**
   * Chooses the mesh for a click: frontmost for multi-select, cycle for plain.
   *
   * @param stack Unique world meshes ordered near-to-far.
   * @param additive True when Shift is held.
   * @param toggle True when Ctrl/Meta is held.
   * @returns Mesh to apply selection to, or null.
   */
  private resolvePickFromStack(stack: THREE.Mesh[], additive: boolean, toggle: boolean): THREE.Mesh | null {
    if (stack.length === 0 || !this.selectionManager) return null;
    if (additive || toggle) return stack[0];
    return SelectionClickThrough.pickFromStack(stack, this.selectionManager);
  }

  /**
   * Returns selectable meshes, falling back to world group traversal when
   * empty.
   *
   * @returns Meshes available for raycasting.
   */
  private getEffectiveSelectableObjects(): THREE.Mesh[] {
    if (this.selectableObjects.length > 0) return this.selectableObjects;
    return this.collectSelectableObjects();
  }

  /**
   * Remaps a raycast hit to the authoritative world mesh when possible.
   *
   * @param clicked The mesh returned by the raycaster.
   * @returns The mesh that should enter the selection set.
   */
  private resolveClickedMesh(clicked: THREE.Mesh): THREE.Mesh {
    if (this.meshResolveCallback) {
      return this.meshResolveCallback(clicked);
    }
    return clicked;
  }

  /**
   * Builds the orthographic camera with the default startup zoom level. Sets a
   * stable up vector per plane so top-down lookAt is not degenerate.
   *
   * @param position World-space camera position for this orthographic plane.
   * @param plane Grid plane for this viewport.
   * @returns A configured orthographic camera looking at the default focus.
   */
  private createCamera(position: THREE.Vector3, plane: GridPlane): THREE.OrthographicCamera {
    const extent = DEFAULT_ORTHO_HALF_EXTENT;
    const camera = new THREE.OrthographicCamera(-extent, extent, extent, -extent, 0.1, 1000);
    camera.position.copy(position);
    this.applyPlaneCameraUp(camera, plane);
    const focus = getDefaultSceneFocus();
    camera.lookAt(focus.x, focus.y, focus.z);
    return camera;
  }

  /**
   * Chooses a camera up vector that is never parallel to the look direction.
   * Top (XZ) looks down -Y, so world +Y cannot be used as up.
   *
   * @param camera Orthographic camera to configure.
   * @param plane Viewport grid plane.
   */
  private applyPlaneCameraUp(camera: THREE.OrthographicCamera, plane: GridPlane): void {
    if (plane === 'xz') {
      camera.up.set(0, 0, -1);
      return;
    }
    camera.up.set(0, 1, 0);
  }

  /** Attaches orthographic pan and wheel-zoom handling to the canvas. */
  private setupPanHandler(): void {
    new OrthoPanHandler(this.renderer.domElement, this.camera, (factor) => this.zoom(factor));
  }

  /**
   * Zooms the orthographic frustum about its view-space center. Factor is
   * clamped so half-height stays within safe min/max extents.
   *
   * @param factor Multiplier for frustum size (greater than 1 zooms out).
   */
  private zoom(factor: number): void {
    const currentHalfHeight = (this.camera.top - this.camera.bottom) / 2;
    const safeFactor = clampOrthoZoomFactor(currentHalfHeight, factor);
    if (Math.abs(safeFactor - 1) < 1e-12) return;
    const centerX = (this.camera.left + this.camera.right) / 2;
    const centerY = (this.camera.top + this.camera.bottom) / 2;
    const halfWidth = ((this.camera.right - this.camera.left) * safeFactor) / 2;
    const halfHeight = currentHalfHeight * safeFactor;
    this.camera.left = centerX - halfWidth;
    this.camera.right = centerX + halfWidth;
    this.camera.top = centerY + halfHeight;
    this.camera.bottom = centerY - halfHeight;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Resizes the renderer and restores the default orthographic framing.
   *
   * @param width Viewport width in CSS pixels.
   * @param height Viewport height in CSS pixels.
   */
  resize(width: number, height: number): void {
    this.renderer.setSize(width, height);
    const aspect = width / height;
    const size = DEFAULT_ORTHO_HALF_EXTENT;
    this.camera.left = -size * aspect;
    this.camera.right = size * aspect;
    this.camera.top = size;
    this.camera.bottom = -size;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Updates depth range, grids, and renders the orthographic scene. Depth
   * ranging keeps all content in front of the camera (any ±X for side) without
   * changing zoom or lateral pan.
   */
  render(): void {
    OrthoDepthRanger.update(this.camera, this.scene);
    this.grids.update(this.camera);
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Returns the orthographic camera for this viewport.
   *
   * @returns The orthographic camera instance.
   */
  getCamera(): THREE.OrthographicCamera {
    return this.camera;
  }

  /**
   * Returns the current orthographic frustum plane values.
   *
   * @returns An object with left, right, top, and bottom frustum values.
   */
  getCameraFrustum(): FrustumPlanes {
    return {
      left: this.camera.left,
      right: this.camera.right,
      top: this.camera.top,
      bottom: this.camera.bottom,
    };
  }

  /**
   * Returns the shading controller for this viewport.
   *
   * @returns The ViewportShadingController instance.
   */
  getShadingController(): ViewportShadingController {
    return this.shadingController;
  }

  /**
   * Sets the shading mode for this viewport and updates the toolbar highlight.
   *
   * @param mode The shading mode to apply.
   */
  setShadingMode(mode: ShadingMode): void {
    this.shadingController.setShadingMode(mode);
    this.getViewportToolbar().setActiveShadingMode(mode);
  }

  /**
   * Returns the current shading mode of this viewport.
   *
   * @returns The current ShadingMode value.
   */
  getShadingMode(): ShadingMode {
    return this.shadingController.getShadingMode();
  }

  /**
   * Updates the shading controller overlay with current meshes.
   *
   * @param meshes The meshes to generate wireframe overlays for.
   */
  updateShadingMeshes(meshes: THREE.Mesh[]): void {
    this.shadingController.updateMeshes(meshes);
  }

  /**
   * Returns the grid system for this viewport.
   *
   * @returns The Grids instance.
   */
  getGrid(): Grids {
    return this.grids;
  }

  /**
   * Legacy accessor used by older grid update call sites.
   *
   * @returns The grid system (supports setSnapInterval).
   */
  getGridHelper(): Grids {
    return this.grids;
  }
}

import * as THREE from 'three';
import { InputManager } from '../input/input_manager.js';
import { TransformGizmo } from '../../transform/gizmo/transform_gizmo.js';
import { ViewportSyncManager } from './viewport_sync_manager.js';
import { createDefaultStartupSolidModel } from '../../solid/model/default_startup_solid_model.js';
import { ViewportRegistry } from './viewport_registry.js';
import type { EditorViewport } from '../../viewports/editor_viewport.js';
import { getGizmoPlaneForKind } from '../../viewports/editor_viewport.js';
import { Viewport2D } from '../../viewports/viewport_2d.js';
import { Viewport3D } from '../../viewports/viewport_3d.js';
import type { SharedWebGLSurface } from '../../viewports/shared_webgl_surface.js';
import type { SharedWorldScene } from '../../viewports/shared_world_scene.js';

/** Created viewport instances after bootstrap (compatibility accessors). */
export interface BootstrappedViewports {
  viewport2DTop: Viewport2D;
  viewport2DFront: Viewport2D;
  viewport2DSide: Viewport2D;
  viewport3D: Viewport3D;
  registry: ViewportRegistry;
}

/** Creates editor viewports via the registry on a shared scene and surface. */
export class ViewportSceneBootstrap {
  /**
   * Instantiates the default four-pane layout into the given containers.
   *
   * @param viewportContainers DOM containers ordered top, front, side,
   *   perspective.
   * @param inputManager Input manager for perspective viewports.
   * @param sharedScene Shared world scene.
   * @param surface Shared WebGL surface.
   * @returns Compatibility viewport map plus registry.
   */
  createViewports(
    viewportContainers: HTMLElement[],
    inputManager: InputManager,
    sharedScene: SharedWorldScene,
    surface: SharedWebGLSurface,
  ): BootstrappedViewports {
    const registry = new ViewportRegistry();
    registry.populateDefaultQuad(viewportContainers, {
      inputManager,
      sharedScene: sharedScene.getScene(),
      surface,
    });
    const viewports = registry.getAllViewports();
    const top = viewports[0];
    const front = viewports[1];
    const side = viewports[2];
    const perspective = viewports[3];
    if (
      !(top instanceof Viewport2D) ||
      !(front instanceof Viewport2D) ||
      !(side instanceof Viewport2D) ||
      !(perspective instanceof Viewport3D)
    ) {
      throw new Error('Default viewport quad must be Top, Front, Side, Perspective');
    }
    return {
      viewport2DTop: top,
      viewport2DFront: front,
      viewport2DSide: side,
      viewport3D: perspective,
      registry,
    };
  }

  /**
   * Adds shared world objects and gizmo clones to the shared scene.
   *
   * @param worldObject Root hierarchy group.
   * @param bootstrapped Bootstrapped viewports and registry.
   * @param sharedScene Shared world scene host.
   * @param viewportSyncManager Selectable-object helper.
   * @param transformGizmo Gizmo whose handle groups are cloned per viewport.
   */
  addSharedObjects(
    worldObject: THREE.Group,
    bootstrapped: BootstrappedViewports,
    sharedScene: SharedWorldScene,
    viewportSyncManager: ViewportSyncManager,
    transformGizmo: TransformGizmo,
  ): void {
    worldObject.add(this.createDefaultSolidModelRoot());
    sharedScene.setWorldObject(worldObject);
    const allViewports = bootstrapped.registry.getAllViewports();
    this.applyWorldGroupReferences(allViewports, worldObject);
    viewportSyncManager.setViewportRoles(null, allViewports);
    viewportSyncManager.setWorldObject(worldObject);
    this.bindMeshResolveCallbacks(allViewports, viewportSyncManager);
    this.addGizmoToAllViewports(allViewports, transformGizmo);
    viewportSyncManager.syncWorldObjectToViewports(worldObject);
  }

  /**
   * Reapplies gizmo and selectable bindings after a registry mutation.
   *
   * @param worldObject Root hierarchy group.
   * @param registry Live viewport registry.
   * @param sharedScene Shared world scene.
   * @param viewportSyncManager Sync / selectable helper.
   * @param transformGizmo Transform gizmo source.
   */
  rewireAfterViewportMutation(
    worldObject: THREE.Group,
    registry: ViewportRegistry,
    sharedScene: SharedWorldScene,
    viewportSyncManager: ViewportSyncManager,
    transformGizmo: TransformGizmo,
  ): void {
    sharedScene.setWorldObject(worldObject);
    const allViewports = registry.getAllViewports();
    this.applyWorldGroupReferences(allViewports, worldObject);
    viewportSyncManager.setViewportRoles(null, allViewports);
    this.bindMeshResolveCallbacks(allViewports, viewportSyncManager);
    this.addGizmoToAllViewports(allViewports, transformGizmo);
    viewportSyncManager.syncWorldObjectToViewports(worldObject);
  }

  /**
   * Points every viewport at the shared world group reference.
   *
   * @param viewports Live viewports.
   * @param worldObject Shared hierarchy root.
   */
  private applyWorldGroupReferences(viewports: readonly EditorViewport[], worldObject: THREE.Group): void {
    viewports.forEach((viewport) => viewport.setWorldGroup(worldObject));
  }

  /**
   * Wires mesh resolve callbacks (identity for shared-scene meshes).
   *
   * @param viewports Live viewports.
   * @param viewportSyncManager Provides resolveToWorldMesh.
   */
  private bindMeshResolveCallbacks(
    viewports: readonly EditorViewport[],
    viewportSyncManager: ViewportSyncManager,
  ): void {
    const resolve = (mesh: THREE.Mesh) => viewportSyncManager.resolveToWorldMesh(mesh);
    viewports.forEach((viewport) => viewport.setMeshResolveCallback(resolve));
  }

  /**
   * Adds a cloned transform gizmo group for each pane (visibility toggled
   * later).
   *
   * @param viewports Live viewports.
   * @param transformGizmo Source gizmo for handle group clones.
   */
  private addGizmoToAllViewports(viewports: readonly EditorViewport[], transformGizmo: TransformGizmo): void {
    viewports.forEach((viewport) => {
      const plane = getGizmoPlaneForKind(viewport.getViewportKind());
      viewport.setGizmoGroup(transformGizmo.getHandleGroupClone(plane));
    });
  }

  /**
   * Creates the default solid model root for a new editor session.
   *
   * @returns Solid model root group to parent under the world.
   */
  private createDefaultSolidModelRoot(): THREE.Group {
    return createDefaultStartupSolidModel().root;
  }
}

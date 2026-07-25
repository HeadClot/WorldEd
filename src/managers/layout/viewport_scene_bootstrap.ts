import * as THREE from 'three';
import { Theme } from '../../theme.js';
import { InputManager } from '../input/input_manager.js';
import { Viewport3D } from '../../viewports/viewport_3d.js';
import { Viewport2D } from '../../viewports/viewport_2d.js';
import { TransformGizmo } from '../../transform/gizmo/transform_gizmo.js';
import { ViewportSyncManager } from './viewport_sync_manager.js';
import { createDefaultStartupSolidModel } from '../../solid/model/default_startup_solid_model.js';
import {
  getDefaultFrontCameraPosition,
  getDefaultSideCameraPosition,
  getDefaultTopCameraPosition,
} from '../../navigation/default_camera_placement.js';

/** Created viewport instances after bootstrap. */
export interface BootstrappedViewports {
  viewport2DTop: Viewport2D;
  viewport2DFront: Viewport2D;
  viewport2DSide: Viewport2D;
  viewport3D: Viewport3D;
}

/** Creates the four editor viewports and seeds shared world content. */
export class ViewportSceneBootstrap {
  /**
   * Instantiates all four viewport types into the given containers.
   *
   * @param viewportContainers DOM containers ordered top, front, side,
   *   perspective.
   * @param inputManager Input manager for the 3D viewport.
   * @returns The four viewport instances.
   */
  createViewports(viewportContainers: HTMLElement[], inputManager: InputManager): BootstrappedViewports {
    return {
      viewport2DTop: new Viewport2D(viewportContainers[0]!, 'Top', 'xz', getDefaultTopCameraPosition()),
      viewport2DFront: new Viewport2D(viewportContainers[1]!, 'Front', 'xy', getDefaultFrontCameraPosition()),
      viewport2DSide: new Viewport2D(viewportContainers[2]!, 'Side', 'yz', getDefaultSideCameraPosition()),
      viewport3D: new Viewport3D(viewportContainers[3]!, inputManager),
    };
  }

  /**
   * Adds shared world objects, lights, and gizmo clones to all viewport scenes.
   *
   * @param worldObject Root hierarchy group.
   * @param viewports The four viewports.
   * @param viewportSyncManager Sync manager for clone resolution.
   * @param transformGizmo Gizmo whose handle groups are cloned per viewport.
   */
  addSharedObjects(
    worldObject: THREE.Group,
    viewports: BootstrappedViewports,
    viewportSyncManager: ViewportSyncManager,
    transformGizmo: TransformGizmo,
  ): void {
    worldObject.add(this.createDefaultSolidModelRoot());
    viewports.viewport2DTop.setWorldGroup(worldObject);
    viewports.viewport2DFront.setWorldGroup(worldObject);
    viewports.viewport2DSide.setWorldGroup(worldObject);
    viewports.viewport3D.setWorldGroup(worldObject);
    viewports.viewport3D.getScene().add(worldObject);
    viewportSyncManager.setWorldObject(worldObject);
    this.bindMeshResolveCallbacks(viewports, viewportSyncManager);
    this.addLightsTo2DScenes(viewports);
    this.addGizmoToAllViewports(viewports, transformGizmo);
  }

  /**
   * Wires clone-to-world mesh resolution into every viewport.
   *
   * @param viewports The four viewports.
   * @param viewportSyncManager Sync manager providing resolveToWorldMesh.
   */
  private bindMeshResolveCallbacks(viewports: BootstrappedViewports, viewportSyncManager: ViewportSyncManager): void {
    const resolve = (mesh: THREE.Mesh) => viewportSyncManager.resolveToWorldMesh(mesh);
    viewports.viewport2DTop.setMeshResolveCallback(resolve);
    viewports.viewport2DFront.setMeshResolveCallback(resolve);
    viewports.viewport2DSide.setMeshResolveCallback(resolve);
    viewports.viewport3D.setMeshResolveCallback(resolve);
  }

  /**
   * Adds a cloned transform gizmo group to each viewport scene.
   *
   * @param viewports The four viewports.
   * @param transformGizmo Source gizmo for handle group clones.
   */
  private addGizmoToAllViewports(viewports: BootstrappedViewports, transformGizmo: TransformGizmo): void {
    const pairs: Array<{
      viewport: BootstrappedViewports[keyof BootstrappedViewports];
      plane: 'xz' | 'xy' | 'yz' | 'xyz';
    }> = [
      { viewport: viewports.viewport2DTop, plane: 'xz' },
      { viewport: viewports.viewport2DFront, plane: 'xy' },
      { viewport: viewports.viewport2DSide, plane: 'yz' },
      { viewport: viewports.viewport3D, plane: 'xyz' },
    ];
    pairs.forEach(({ viewport, plane }) => {
      viewport.setGizmoGroup(transformGizmo.getHandleGroupClone(plane));
    });
  }

  /**
   * Creates the default solid model root for a new editor session (unit box at
   * the world origin).
   *
   * @returns Solid model root group to parent under the world.
   */
  private createDefaultSolidModelRoot(): THREE.Group {
    return createDefaultStartupSolidModel().root;
  }

  /**
   * Adds lighting to all 2D viewport scenes.
   *
   * @param viewports The four viewports (3D is skipped).
   */
  private addLightsTo2DScenes(viewports: BootstrappedViewports): void {
    const list = [viewports.viewport2DTop, viewports.viewport2DFront, viewports.viewport2DSide];
    list.forEach((vp) => {
      const scene = vp.getScene();
      scene.add(new THREE.AmbientLight(Theme.lightAmbient, 0.5));
      const directional = new THREE.DirectionalLight(Theme.lightDirectional, 0.8);
      directional.position.set(5, 10, 5);
      scene.add(directional);
    });
  }
}

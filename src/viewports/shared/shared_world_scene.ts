import * as THREE from 'three';
import { Theme } from '@/theme.js';

/**
 * Owns the single authoritative Three.js scene for in-window multi-view
 * rendering. World content is parented once; panes only contribute cameras.
 */
export class SharedWorldScene {
  private readonly scene: THREE.Scene;
  private readonly helpersRoot: THREE.Group;
  private worldObject: THREE.Group | null;

  /** Creates an empty shared scene with a helpers root. */
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = null;
    this.scene.name = 'shared_editor_scene';
    this.helpersRoot = new THREE.Group();
    this.helpersRoot.name = 'shared_helpers_root';
    this.scene.add(this.helpersRoot);
    this.worldObject = null;
    this.addDefaultLights();
  }

  /**
   * Returns the shared scene.
   *
   * @returns Scene instance.
   */
  getScene(): THREE.Scene {
    return this.scene;
  }

  /**
   * Returns the helpers root for grids, gizmos, and overlays.
   *
   * @returns Helpers group.
   */
  getHelpersRoot(): THREE.Group {
    return this.helpersRoot;
  }

  /**
   * Parents the authoritative world group under the shared scene.
   *
   * @param worldObject Editor world hierarchy root.
   */
  setWorldObject(worldObject: THREE.Group): void {
    if (this.worldObject?.parent === this.scene) {
      this.scene.remove(this.worldObject);
    }
    this.worldObject = worldObject;
    this.scene.add(worldObject);
  }

  /**
   * Returns the world group when set.
   *
   * @returns World group or null.
   */
  getWorldObject(): THREE.Group | null {
    return this.worldObject;
  }

  /**
   * Adds a helper object under the helpers root.
   *
   * @param object Grid, gizmo, or overlay object.
   */
  addHelper(object: THREE.Object3D): void {
    this.helpersRoot.add(object);
  }

  /**
   * Removes a helper object from the helpers root.
   *
   * @param object Previously added helper.
   */
  removeHelper(object: THREE.Object3D): void {
    this.helpersRoot.remove(object);
  }

  /** Adds ambient and directional fill lights for non-matcap helpers. */
  private addDefaultLights(): void {
    const ambient = new THREE.AmbientLight(Theme.lightAmbient, 0.7);
    ambient.name = 'shared_ambient';
    this.scene.add(ambient);
    const directional = new THREE.DirectionalLight(Theme.lightDirectional, 0.9);
    directional.name = 'shared_directional';
    directional.position.set(5, 10, 5);
    this.scene.add(directional);
  }
}

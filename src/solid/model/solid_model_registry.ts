import * as THREE from 'three';
import { isSolidModelObject } from './solid_model_keys.js';
import type { SolidModel } from './solid_model.js';

/**
 * Registry of solid model roots (groups) to controller instances. Kept off
 * userData so Object3D.clone() remains safe.
 */
export class SolidModelRegistry {
  private static readonly registry = new WeakMap<THREE.Object3D, SolidModel>();

  /**
   * Associates a solid model root with its controller.
   *
   * @param root Solid model root group.
   * @param model Controller instance.
   */
  static register(root: THREE.Object3D, model: SolidModel): void {
    SolidModelRegistry.registry.set(root, model);
  }

  /**
   * Looks up a solid model by its registered root object only.
   *
   * @param object Candidate root.
   * @returns Solid model or undefined.
   */
  static get(object: THREE.Object3D): SolidModel | undefined {
    return SolidModelRegistry.registry.get(object);
  }

  /**
   * Resolves the SolidModel for a root, brush, or result object by walking
   * parents.
   *
   * @param object Candidate object.
   * @returns SolidModel or null.
   */
  static fromObject(object: THREE.Object3D): SolidModel | null {
    const direct = SolidModelRegistry.registry.get(object);
    if (direct) return direct;
    let current: THREE.Object3D | null = object.parent;
    while (current) {
      const model = SolidModelRegistry.registry.get(current);
      if (model) return model;
      current = current.parent;
    }
    return null;
  }

  /**
   * Collects registered solid models under a scene root.
   *
   * @param root Scene or world root.
   * @returns Unique solid models.
   */
  static collectUnder(root: THREE.Object3D): Set<SolidModel> {
    const models = new Set<SolidModel>();
    root.traverse((object) => {
      if (!isSolidModelObject(object)) return;
      const model = SolidModelRegistry.registry.get(object);
      if (model) models.add(model);
    });
    return models;
  }
}

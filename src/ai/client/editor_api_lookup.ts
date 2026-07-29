import type * as THREE from 'three';
import { SolidModel } from '../../solid/model/solid_model.js';
import { SolidModelRegistry } from '../../solid/model/solid_model_registry.js';
import type { SolidBrushInstance } from '../../solid/model/solid_brush_instance.js';

/** Lookup result for a brush and its owning solid model. */
export interface BrushLookup {
  model: SolidModel;
  brush: SolidBrushInstance;
}

/**
 * Lists solid models registered under the world root.
 *
 * @param worldObject Scene world group.
 * @returns Solid models in traversal discovery order.
 */
export function listSolidModels(worldObject: THREE.Object3D): SolidModel[] {
  return Array.from(SolidModelRegistry.collectUnder(worldObject));
}

/**
 * Finds a solid model by root uuid.
 *
 * @param worldObject Scene world group.
 * @param modelId Solid model root uuid.
 * @returns Model or null.
 */
export function findSolidModel(worldObject: THREE.Object3D, modelId: string): SolidModel | null {
  for (const model of listSolidModels(worldObject)) {
    if (model.root.uuid === modelId) return model;
  }
  return null;
}

/**
 * Finds a brush by id across all solid models under the world.
 *
 * @param worldObject Scene world group.
 * @param brushId Brush instance id.
 * @returns Brush lookup or null.
 */
export function findBrush(worldObject: THREE.Object3D, brushId: string): BrushLookup | null {
  for (const model of listSolidModels(worldObject)) {
    const brush = model.findBrush(brushId);
    if (brush) return { model, brush };
  }
  return null;
}

/**
 * Resolves brush meshes for a list of brush ids.
 *
 * @param worldObject Scene world group.
 * @param brushIds Brush ids to resolve.
 * @returns Preview meshes that exist.
 */
export function resolveBrushMeshes(worldObject: THREE.Object3D, brushIds: readonly string[]): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  for (const brushId of brushIds) {
    const found = findBrush(worldObject, brushId);
    if (found?.brush.mesh) meshes.push(found.brush.mesh);
  }
  return meshes;
}

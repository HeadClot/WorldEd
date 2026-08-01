import * as THREE from 'three';
import { SolidBrushVisual } from '@/solid/model/solid_brush_visual.js';
import { SolidModel } from '@/solid/model/solid_model.js';

/**
 * Collects brush instance ids under a hierarchy root that belong to one solid.
 *
 * @param model Owning solid model.
 * @param root Hierarchy node to scan.
 * @returns Brush instance ids under the root.
 */
export function hierarchySeedBrushIdsCollectUnder(model: SolidModel, root: THREE.Object3D): string[] {
  const brushIds: string[] = [];
  root.traverse((object) => {
    hierarchySeedBrushIdAppendIfOwned(model, object, brushIds);
  });
  return brushIds;
}

/**
 * Maps each solid model to brush ids found under the given hierarchy roots.
 *
 * @param seedRoots Hierarchy roots to scan.
 * @returns Model → seed brush id set.
 */
export function hierarchySeedBrushIdsByModelCollect(
  seedRoots: readonly THREE.Object3D[],
): Map<SolidModel, Set<string>> {
  const seedsByModel = new Map<SolidModel, Set<string>>();
  for (const root of seedRoots) {
    hierarchySeedBrushIdsUnderRootCollect(root, seedsByModel);
  }
  return seedsByModel;
}

/**
 * Walks one hierarchy root and records brush ids on their owning solids.
 *
 * @param root Hierarchy node to scan.
 * @param seedsByModel Accumulator map.
 */
function hierarchySeedBrushIdsUnderRootCollect(root: THREE.Object3D, seedsByModel: Map<SolidModel, Set<string>>): void {
  root.traverse((object) => {
    hierarchySeedBrushRecordIfOwned(object, seedsByModel);
  });
}

/**
 * Records one object as a hierarchy seed when it is a solid brush preview.
 *
 * @param object Scene object under a hierarchy root.
 * @param seedsByModel Accumulator map.
 */
function hierarchySeedBrushRecordIfOwned(object: THREE.Object3D, seedsByModel: Map<SolidModel, Set<string>>): void {
  if (!SolidBrushVisual.isBrushObject(object)) {
    return;
  }
  const model = SolidModel.fromObject(object);
  if (!model) {
    return;
  }
  const brush = model.findBrushByMesh(object);
  if (!brush) {
    return;
  }
  hierarchyModelSeedSetEnsure(seedsByModel, model).add(brush.id);
}

/**
 * Appends a brush id when the object is a brush preview owned by the model.
 *
 * @param model Owning solid model.
 * @param object Scene object candidate.
 * @param brushIds Accumulator list.
 */
function hierarchySeedBrushIdAppendIfOwned(model: SolidModel, object: THREE.Object3D, brushIds: string[]): void {
  if (!SolidBrushVisual.isBrushObject(object)) {
    return;
  }
  const brush = model.findBrushByMesh(object);
  if (brush) {
    brushIds.push(brush.id);
  }
}

/**
 * Returns the seed set for a model, creating it when missing.
 *
 * @param seedsByModel Accumulator map.
 * @param model Solid model key.
 * @returns Mutable seed id set for the model.
 */
function hierarchyModelSeedSetEnsure(seedsByModel: Map<SolidModel, Set<string>>, model: SolidModel): Set<string> {
  let seedIds = seedsByModel.get(model);
  if (seedIds) {
    return seedIds;
  }
  seedIds = new Set<string>();
  seedsByModel.set(model, seedIds);
  return seedIds;
}

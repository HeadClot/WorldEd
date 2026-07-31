import * as THREE from 'three';
import { sameBrushOrder } from '@/solid/model/solid_brush_transform_sync.js';
import type { SolidModelOpsHost } from '@/solid/model/solid_model_ops.js';
import { SolidModel } from '@/solid/model/solid_model.js';
import {
  hierarchySeedBrushIdsByModelCollect,
  hierarchySeedBrushIdsCollectUnder,
} from './solid_hierarchy_seed_collector.js';

/**
 * After group/ungroup/reparent on one solid: resync evaluation order and
 * recompile only seed brushes plus automatic touch peers. Full rebuild when
 * evaluation order changed.
 *
 * @param host Solid model host.
 * @param seedBrushIds Brushes whose hierarchy placement changed.
 * @param compileOrderLastRead Previous compile evaluation order reader.
 */
export function hierarchyMutationRefreshOnHost(
  host: SolidModelOpsHost,
  seedBrushIds: readonly string[],
  compileOrderLastRead: () => string[],
): void {
  const previousOrder = compileOrderLastRead();
  host.brushes.syncBrushOrderFromScene();
  const evaluationList = host.brushes.getEvaluationList();
  if (!sameBrushOrder(previousOrder, evaluationList)) {
    host.markDirty();
    host.rebuild(true);
    return;
  }
  if (seedBrushIds.length > 0) {
    host.markBrushesDirty(seedBrushIds);
  }
  host.rebuild(true);
}

/**
 * Refreshes only solid models that own the given hierarchy roots, using brush
 * descendants under those roots as partial CSG seeds. Unrelated solids are left
 * untouched.
 *
 * @param seedRoots Hierarchy nodes that moved, grouped, or ungrouped.
 */
export function hierarchyMutationRefreshFromRoots(seedRoots: readonly THREE.Object3D[]): void {
  const seedsByModel = hierarchySeedBrushIdsByModelCollect(seedRoots);
  for (const [model, seedIds] of seedsByModel) {
    model.hierarchyMutationRefresh(Array.from(seedIds));
  }
}

/**
 * Collects unique brush ids under several hierarchy roots for one solid.
 *
 * @param model Owning solid model.
 * @param seedRoots Hierarchy roots to scan.
 * @returns Unique brush instance ids.
 */
export function hierarchySeedBrushIdsCollectUnderRoots(
  model: SolidModel,
  seedRoots: readonly THREE.Object3D[],
): string[] {
  const seedIds = new Set<string>();
  for (const root of seedRoots) {
    for (const brushId of hierarchySeedBrushIdsCollectUnder(model, root)) {
      seedIds.add(brushId);
    }
  }
  return Array.from(seedIds);
}

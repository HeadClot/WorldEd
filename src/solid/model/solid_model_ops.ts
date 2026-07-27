import * as THREE from 'three';
import { removeDecorativeEdges } from '../../utils/mesh_edge_sync.js';
import { pullChangedBrushTransforms, collectDriftedBrushIds } from './solid_brush_transform_sync.js';
import { disposeBrushPreviewResources } from './solid_model_mesh_disposal.js';
import { SolidBrushVisual } from './solid_brush_visual.js';
import type { SolidBrushInstance } from './solid_brush_instance.js';
import type { SolidBrushCollection } from './solid_brush_collection.js';
import type { SolidModelRebuildPipeline } from './solid_model_rebuild_pipeline.js';
import type { SolidModelPresentation } from './solid_model_presentation.js';

/** Dependencies shared by solid model private lifecycle operations. */
export interface SolidModelOpsHost {
  root: THREE.Group;
  resultMesh: THREE.Mesh;
  brushes: SolidBrushCollection;
  pipeline: SolidModelRebuildPipeline;
  presentation: SolidModelPresentation;
  findBrush: (id: string) => SolidBrushInstance | undefined;
  markBrushesDirty: (brushIds: Iterable<string>) => void;
  markDirty: () => void;
  rebuild: (force?: boolean) => void;
}

/**
 * Rebuilds partial CSG after history when only brush transforms drifted.
 *
 * @param host Solid model host.
 */
export function rebuildChangedHistoryTransforms(host: SolidModelOpsHost): void {
  const changedIds = pullChangedBrushTransforms(host.brushes.getEvaluationList(), {
    positionLock: true,
    stretchLock: true,
  });
  if (changedIds.length === 0) return;
  host.markBrushesDirty(changedIds);
  host.rebuild(true);
}

/**
 * Detaches a brush preview mesh from the root and optionally disposes it.
 *
 * @param host Solid model host.
 * @param brush Removed brush instance.
 * @param disposeResources Whether to free GPU resources.
 */
export function detachAndMaybeDisposeBrushMesh(
  host: SolidModelOpsHost,
  brush: SolidBrushInstance,
  disposeResources: boolean,
): void {
  if (!brush.mesh) return;
  host.root.remove(brush.mesh);
  if (disposeResources) disposeBrushPreviewResources(brush.mesh);
}

/**
 * Clones a source brush with offset and attaches a hull preview mesh.
 *
 * @param host Solid model host.
 * @param source Source brush.
 * @param offset Position offset applied after cloning.
 * @returns Prepared clone with mesh parented under root.
 */
export function cloneBrushWithPreview(
  host: SolidModelOpsHost,
  source: SolidBrushInstance,
  offset: THREE.Vector3,
): SolidBrushInstance {
  source.pullTransformFromMesh();
  host.brushes.nextBrushCounter();
  const name = `${source.name}_copy`;
  const clone = source.cloneWithId(host.brushes.allocateBrushId(), name);
  clone.position.add(offset);
  const preview = SolidBrushVisual.createHullPreview(name, clone.brush, clone.operation);
  clone.attachMesh(preview);
  host.root.add(preview);
  return clone;
}

/**
 * Marks visibility-related seeds dirty and rebuilds CSG.
 *
 * @param host Solid model host.
 * @param brush Brush whose visibility changed.
 */
export function markVisibilityDirtyAndRebuild(host: SolidModelOpsHost, brush: SolidBrushInstance): void {
  const seedIds = [brush.id, ...host.pipeline.getCachedTouchPeerIds(brush.id)];
  host.markBrushesDirty(seedIds);
  if (!brush.visible) {
    host.pipeline.removeMeshChunk(brush.id);
  }
  host.rebuild(true);
}

/**
 * Marks brushes dirty when their preview mesh pose no longer matches instance.
 * Covers callers that move the mesh then call rebuildLive without prepareLive.
 *
 * @param host Solid model host.
 */
export function markMeshesThatDriftedDirty(host: SolidModelOpsHost): void {
  const driftedIds = collectDriftedBrushIds(host.brushes.getEvaluationList());
  if (driftedIds.length === 0) return;
  host.markBrushesDirty(driftedIds);
}

/**
 * Moves listed brushes to first/last evaluation slots and rebuilds.
 *
 * @param host Solid model host.
 * @param brushIds Brushes to move.
 * @param end Which end of the evaluation list.
 * @returns True when order changed.
 */
export function reorderBrushesAndRebuild(
  host: SolidModelOpsHost,
  brushIds: readonly string[],
  end: 'first' | 'last',
): boolean {
  if (!host.brushes.reorderBrushesToEnd(brushIds, end)) return false;
  host.markDirty();
  host.rebuild(true);
  return true;
}

/**
 * Falls back to full CSG rebuild when polygon caches are missing for texture
 * remesh.
 *
 * @param host Solid model host.
 * @param brushIds Brushes that need refresh.
 * @returns Always true after rebuild.
 */
export function fallbackFullPresentationRebuild(host: SolidModelOpsHost, brushIds: readonly string[]): boolean {
  host.markBrushesDirty(brushIds);
  host.rebuild(true);
  return true;
}

/**
 * Completes presentation remesh after polygon textures updated.
 *
 * @param host Solid model host.
 * @param remeshed Brush ids with updated polygon caches.
 * @returns True when presentation was refreshed.
 */
export function finishPresentationRemesh(host: SolidModelOpsHost, remeshed: readonly string[]): boolean {
  if (!host.pipeline.remeshPresentationForBrushes(remeshed)) {
    return fallbackFullPresentationRebuild(host, remeshed);
  }
  if (host.pipeline.hasResultGeometry()) {
    applySurfaceLayoutToResult(host, true);
  }
  return true;
}

/**
 * Prepares state and pulls transforms for a full async rebuild.
 *
 * @param host Solid model host.
 */
export function prepareFullAsyncRebuild(host: SolidModelOpsHost): void {
  host.markDirty();
  host.brushes.syncBrushOrderFromScene();
  for (const brush of host.brushes.getEvaluationList()) {
    brush.pullTransformFromMesh();
  }
}

/**
 * Applies materials and clears edges after async CSG completion.
 *
 * @param host Solid model host.
 * @param onProgress Optional progress callback.
 */
export function finishAsyncRebuildPresentation(
  host: SolidModelOpsHost,
  onProgress?: (ratio: number, label: string) => void,
): void {
  if (host.pipeline.hasResultGeometry()) {
    onProgress?.(0.95, 'Applying materials…');
    applySurfaceLayoutToResult(host, true);
    clearResultContentEdges(host);
  }
  host.pipeline.resetResultLocalTransform();
  host.pipeline.clearDirtyFlag();
  host.pipeline.setInteractiveGeometryCurrent(true);
  onProgress?.(1, 'Done');
}

/**
 * Applies surface layout when result geometry exists.
 *
 * @param host Solid model host.
 * @param forceMaterials Material rebuild flag.
 */
export function applyPresentationIfGeometryExists(host: SolidModelOpsHost, forceMaterials: boolean): void {
  if (!host.pipeline.hasResultGeometry()) return;
  applySurfaceLayoutToResult(host, forceMaterials);
  clearResultContentEdges(host);
}

/**
 * Writes face maps and materials onto the result mesh.
 *
 * @param host Solid model host.
 * @param forceMaterials Reserved; solid results always preserve order.
 */
export function applySurfaceLayoutToResult(host: SolidModelOpsHost, forceMaterials: boolean): void {
  host.presentation.applySurfaceLayoutToResult(
    host.resultMesh,
    host.pipeline.getLastSurfaceRegions(),
    (id) => host.findBrush(id),
    forceMaterials,
  );
}

/**
 * Applies surface materials on the next frame after interactive commit. CSG
 * result meshes never use white content outline edges (brushes own edges).
 *
 * @param host Solid model host.
 */
export function schedulePresentationRefresh(host: SolidModelOpsHost): void {
  const mesh = host.resultMesh;
  requestAnimationFrame(() => {
    if (host.resultMesh !== mesh) return;
    if (!host.pipeline.hasResultGeometry()) return;
    applySurfaceLayoutToResult(host, true);
    clearResultContentEdges(host);
  });
}

/**
 * Removes content outline edges from the compiled result mesh.
 *
 * @param host Solid model host.
 */
export function clearResultContentEdges(host: SolidModelOpsHost): void {
  removeDecorativeEdges(host.resultMesh);
}

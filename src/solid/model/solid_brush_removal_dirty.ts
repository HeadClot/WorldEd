import type { SolidBrushCollection } from './solid_brush_collection.js';
import type { SolidModelOpsHost } from './solid_model_ops.js';
import type { SolidModelRebuildPipeline } from './solid_model_rebuild_pipeline.js';
import { detachAndMaybeDisposeBrushMesh } from './solid_model_ops.js';

/**
 * Unregisters a brush, marks partial CSG seeds from former touch peers, and
 * optionally rebuilds. Isolated compiled brushes use an empty seed set;
 * uncompiled removals force a full rebuild.
 *
 * @param host Solid model host.
 * @param pipeline Rebuild pipeline for cache invalidation.
 * @param brushes Brush collection to remove from.
 * @param brushId Brush instance id.
 * @param disposeResources Whether to free preview GPU resources.
 * @param rebuildAfter Whether to rebuild immediately after unregistration.
 * @returns True when the brush was removed.
 */
export function brushRemovalExecute(
  host: SolidModelOpsHost,
  pipeline: SolidModelRebuildPipeline,
  brushes: SolidBrushCollection,
  brushId: string,
  disposeResources: boolean,
  rebuildAfter: boolean,
): boolean {
  const touchPeers = pipeline.getCachedTouchPeerIds(brushId);
  const brushCompiledPreviously = pipeline.compileOrderLastContainsBrush(brushId);
  const brush = brushes.removeBrushFromList(brushId);
  if (!brush) {
    return false;
  }
  detachAndMaybeDisposeBrushMesh(brush, disposeResources);
  pipeline.invalidateBrush(brushId);
  brushRemovalDirtySeedsMark(host, touchPeers, brushCompiledPreviously);
  if (rebuildAfter) {
    host.rebuild(true);
  }
  return true;
}

/**
 * Marks partial CSG seeds after a brush leaves the evaluation list. Isolated
 * compiled brushes use an empty seed set; uncompiled removals force full.
 *
 * @param host Solid model host.
 * @param touchPeers Cached spatial peers of the removed brush.
 * @param brushCompiledPreviously Whether the brush appeared in the last compile
 *   order.
 */
export function brushRemovalDirtySeedsMark(
  host: SolidModelOpsHost,
  touchPeers: readonly string[],
  brushCompiledPreviously: boolean,
): void {
  if (!brushCompiledPreviously) {
    host.markDirty();
    return;
  }
  host.markBrushesDirty(touchPeers);
}

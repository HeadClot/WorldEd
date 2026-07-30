import * as THREE from 'three';
import { resolveTransformTargets } from '../../selection/object/resolve_transform_targets.js';

/**
 * Host callbacks for a full world-mutation visual refresh. Every path that
 * changes hierarchy or object poses should run through
 * {@link refreshSceneVisualsAfterMutation} so multi-viewport clones, selection
 * outlines, brush hull fills, CAD rulers, and the gizmo cannot drift apart.
 */
export interface SceneMutationVisualHost {
  /** Reclones world objects into 2D views and reapplies selection outlines. */
  syncPrimitivesToViewports: () => void;
  /** Rebuilds the outliner tree from the live hierarchy. */
  refreshOutliner: () => void;
  /** Refreshes face-selection highlight targets after mesh graph changes. */
  updateFaceSelectionMeshes: () => void;
  /**
   * Forces world matrices current after history/pose writes. Undo restores
   * local transforms without refreshing ancestor {@code matrixWorld}; overlays
   * that measure nested meshes (solid roots) need this before ruler/gizmo
   * rebuild.
   */
  ensureWorldMatricesCurrent: () => void;
  /** Clears any in-progress CAD drag ghost/delta state. */
  endCadRulerDrag: () => void;
  /** Rebuilds selection size rulers from the current selection. */
  refreshCadRulersFromSelection: () => void;
  /** Shows or hides the transform gizmo for the current selection. */
  updateGizmoVisibility: () => void;
  /** Repositions and reorients the gizmo and bounds handles. */
  updateGizmoPivot: () => void;
  /** Optional properties inspector re-read after external transforms. */
  refreshPropertiesPanel?: () => void;
}

/**
 * Host callbacks for transform-commit refresh (properties inspector and gizmo
 * pointer-up). Guarantees clone poses, selection visuals, CAD rulers, and gizmo
 * match the world after any authoritative transform write.
 */
export interface SceneTransformCommitVisualHost {
  /** Copies local transforms of world subtrees onto matching 2D clones. */
  syncCloneTransformsForWorldObjects: (worldObjects: readonly THREE.Object3D[]) => void;
  /** Keeps outline children and wireframe overlays glued during/after move. */
  syncSelectionVisualsDuringTransform: () => void;
  /** Full reclone path when a light transform copy is not enough. */
  syncPrimitivesToViewports: () => void;
  /**
   * Forces world matrices current before CAD rulers and gizmo measure selection
   * poses (same contract as {@link SceneMutationVisualHost}).
   */
  ensureWorldMatricesCurrent: () => void;
  /** Clears CAD drag state before selection rulers are rebuilt. */
  endCadRulerDrag: () => void;
  /** Rebuilds CAD size dimensions for the current selection. */
  refreshCadRulersFromSelection: () => void;
  /** Updates gizmo visibility from selection and tool mode. */
  updateGizmoVisibility: () => void;
  /** Updates gizmo pivot, orientation, and bounds. */
  updateGizmoPivot: () => void;
  /**
   * Optional solid CSG finalize for brush/result edits. Return true when only
   * solid-model meshes were handled so a full world reclone can be skipped.
   *
   * @param meshes Transformed meshes (may include non-solid meshes).
   */
  finalizeSolidTransforms?: (meshes: THREE.Mesh[]) => boolean;
  /** Optional properties panel re-read (gizmo/undo paths). */
  refreshPropertiesPanel?: () => void;
}

/**
 * Full visual refresh after hierarchy mutations or history changes. Always
 * reclones viewports, restores selection/hull fills, refreshes CAD rulers, and
 * updates the gizmo so undo/redo and structural edits share one contract.
 *
 * @param host Layout-owned visual subsystems.
 */
export function refreshSceneVisualsAfterMutation(host: SceneMutationVisualHost): void {
  host.syncPrimitivesToViewports();
  host.refreshOutliner();
  host.updateFaceSelectionMeshes();
  refreshOverlayPoseVisuals(host);
  host.refreshPropertiesPanel?.();
}

/**
 * Visual refresh after object transforms are written (inspector fields or gizmo
 * commit). Always updates clones, selection overlays, CAD rulers, and gizmo —
 * the same guarantees as undo/redo without requiring a full hierarchy rebuild.
 *
 * @param host Transform-commit visual subsystems.
 * @param transformedObjects World objects whose local transforms just changed.
 */
export function refreshSceneVisualsAfterTransformCommit(
  host: SceneTransformCommitVisualHost,
  transformedObjects: readonly THREE.Object3D[],
): void {
  const meshes = collectMeshObjects(transformedObjects);
  const solidOnlyHandled = host.finalizeSolidTransforms?.(meshes) === true;
  if (solidOnlyHandled) {
    applyLightTransformCloneSync(host, meshes, transformedObjects);
  } else {
    host.syncPrimitivesToViewports();
  }
  refreshOverlayPoseVisuals(host);
  host.refreshPropertiesPanel?.();
}

/**
 * Syncs CAD rulers and gizmo pose after world object poses change. Shared by
 * full mutation and transform-commit paths so neither can forget overlays.
 *
 * @param host Subsystems that depend on object world poses.
 */
function refreshOverlayPoseVisuals(
  host: Pick<
    SceneMutationVisualHost,
    | 'ensureWorldMatricesCurrent'
    | 'endCadRulerDrag'
    | 'refreshCadRulersFromSelection'
    | 'updateGizmoVisibility'
    | 'updateGizmoPivot'
  >,
): void {
  host.ensureWorldMatricesCurrent();
  host.endCadRulerDrag();
  host.refreshCadRulersFromSelection();
  host.updateGizmoVisibility();
  host.updateGizmoPivot();
}

/**
 * Light path: copy transforms for solid-only commits without recloning the
 * entire world (large-map gizmo pointer-up).
 *
 * @param host Transform-commit host.
 * @param meshes Transformed meshes.
 * @param transformedObjects All transformed roots (may include non-mesh
 *   groups).
 */
function applyLightTransformCloneSync(
  host: SceneTransformCommitVisualHost,
  meshes: THREE.Mesh[],
  transformedObjects: readonly THREE.Object3D[],
): void {
  const syncTargets = collectTransformSyncTargets(meshes, transformedObjects);
  host.syncCloneTransformsForWorldObjects(syncTargets);
  host.syncSelectionVisualsDuringTransform();
}

/**
 * Builds the set of world objects whose clones must receive transform copies.
 *
 * @param meshes Transformed meshes.
 * @param transformedObjects All transformed objects from the edit.
 * @returns Unique roots to mirror into 2D viewports.
 */
function collectTransformSyncTargets(
  meshes: THREE.Mesh[],
  transformedObjects: readonly THREE.Object3D[],
): THREE.Object3D[] {
  const targets = resolveTransformTargets(meshes);
  const seen = new Set<THREE.Object3D>(targets);
  for (const object of transformedObjects) {
    if (seen.has(object)) continue;
    seen.add(object);
    targets.push(object);
  }
  return targets;
}

/**
 * Collects mesh instances from a mixed object list (including groups with mesh
 * children only when the object itself is a mesh).
 *
 * @param objects Transformed objects.
 * @returns Mesh subset.
 */
function collectMeshObjects(objects: readonly THREE.Object3D[]): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  for (const object of objects) {
    if (object instanceof THREE.Mesh) {
      meshes.push(object);
    }
  }
  return meshes;
}

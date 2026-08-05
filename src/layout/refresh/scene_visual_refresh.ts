import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { collectMeshesUnder } from '@/utils/utils_hierarchy.js';

/**
 * Host callbacks for a full world-mutation visual refresh.
 *
 * Use {@link refreshSceneVisualsAfterMutation} after hierarchy graph changes
 * (delete, reparent, load). It refreshes selectable lists and overlays but does
 * <strong>not</strong> recompile solid CSG from brush mesh poses — that would
 * thrash CSG on every structural edit.
 *
 * Use {@link refreshSceneVisualsAfterTransformCommit} after any tool writes
 * Object3D local transforms (align, inspector, gizmo commit, MCP pose edits).
 * That path finalizes solid CSG once so result meshes and brush wireframes stay
 * in lockstep without per-tool patches.
 */
export interface SceneMutationVisualHost {
  /** Refreshes selectable mesh lists and selection outlines across viewports. */
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
 * pointer-up). Guarantees selection visuals, CAD rulers, and gizmo match the
 * world after any authoritative transform write.
 */
export interface SceneTransformCommitVisualHost {
  /** Keeps outline children and wireframe overlays glued during/after move. */
  syncSelectionVisualsDuringTransform: () => void;
  /** Full selectable-list refresh when solid-only handling is not enough. */
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
   * solid-model meshes were handled so a full viewport selectable refresh can
   * be skipped.
   *
   * @param meshes Transformed meshes (may include non-solid meshes).
   */
  finalizeSolidTransforms?: (meshes: THREE.Mesh[]) => boolean;
  /** Optional properties panel re-read (gizmo/undo paths). */
  refreshPropertiesPanel?: () => void;
}

/**
 * Full visual refresh after hierarchy mutations. Refreshes selectable lists and
 * overlays. Does not recompile solid CSG from brush poses (see file contract).
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
 * Mandatory refresh after any tool writes object local transforms. Finalizes
 * solid CSG once via
 * {@link SceneTransformCommitVisualHost.finalizeSolidTransforms}, then syncs
 * selection visuals and overlays. Call this after align, inspector pose fields,
 * gizmo pointer-up, or MCP pose writes.
 *
 * @param host Transform-commit visual subsystems.
 * @param transformedObjects World objects whose local transforms just changed.
 */
export function refreshSceneVisualsAfterTransformCommit(
  host: SceneTransformCommitVisualHost,
  transformedObjects: readonly THREE.Object3D[],
): void {
  const meshes = collectMeshesForSolidFinalize(transformedObjects);
  const solidOnlyHandled = host.finalizeSolidTransforms?.(meshes) === true;
  if (solidOnlyHandled) {
    host.syncSelectionVisualsDuringTransform();
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
 * Collects meshes that solid CSG finalize must see after a pose write. Direct
 * meshes pass through. Solid model roots contribute only their result mesh so
 * root moves keep the bake path. Intermediate groups expand to nested brushes
 * so wireframes and result geometry stay locked when a group moves.
 *
 * @param objects Transformed objects (meshes and/or groups).
 * @returns Meshes for
 *   {@link SceneTransformCommitVisualHost.finalizeSolidTransforms}.
 */
function collectMeshesForSolidFinalize(objects: readonly THREE.Object3D[]): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  const seen = new Set<THREE.Mesh>();
  for (const object of objects) {
    appendSolidFinalizeMeshesFromObject(object, meshes, seen);
  }
  return meshes;
}

/**
 * Appends solid-finalize meshes contributed by one transformed object.
 *
 * @param object Transformed mesh, solid root, or intermediate group.
 * @param meshes Accumulator list.
 * @param seen Deduplication set.
 */
function appendSolidFinalizeMeshesFromObject(
  object: THREE.Object3D,
  meshes: THREE.Mesh[],
  seen: Set<THREE.Mesh>,
): void {
  if (object instanceof THREE.Mesh) {
    appendUniqueMesh(object, meshes, seen);
    return;
  }
  if (SolidModel.isSolidModelObject(object)) {
    appendSolidRootResultMesh(object, meshes, seen);
    return;
  }
  appendNestedMeshesUnderGroup(object, meshes, seen);
}

/**
 * Adds the solid result mesh when a solid model root was transformed as a unit.
 *
 * @param solidRoot Solid model root group.
 * @param meshes Accumulator list.
 * @param seen Deduplication set.
 */
function appendSolidRootResultMesh(solidRoot: THREE.Object3D, meshes: THREE.Mesh[], seen: Set<THREE.Mesh>): void {
  const model = SolidModel.fromObject(solidRoot);
  const result = model?.getResultMesh();
  if (!result) {
    return;
  }
  appendUniqueMesh(result, meshes, seen);
}

/**
 * Expands an intermediate group into nested meshes for solid brush recompile.
 *
 * @param group Transformed group (ordinary or solid CSG).
 * @param meshes Accumulator list.
 * @param seen Deduplication set.
 */
function appendNestedMeshesUnderGroup(group: THREE.Object3D, meshes: THREE.Mesh[], seen: Set<THREE.Mesh>): void {
  for (const mesh of collectMeshesUnder(group)) {
    appendUniqueMesh(mesh, meshes, seen);
  }
}

/**
 * Appends a mesh when it has not been collected yet.
 *
 * @param mesh Candidate mesh.
 * @param meshes Accumulator list.
 * @param seen Deduplication set.
 */
function appendUniqueMesh(mesh: THREE.Mesh, meshes: THREE.Mesh[], seen: Set<THREE.Mesh>): void {
  if (seen.has(mesh)) {
    return;
  }
  seen.add(mesh);
  meshes.push(mesh);
}

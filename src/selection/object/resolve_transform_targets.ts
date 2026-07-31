import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';
import { collapseToHierarchyRoots } from '@/utils/hierarchy_selection.js';
import { collectMeshesUnder } from '@/utils/utils_hierarchy.js';

/**
 * Maps selected meshes (and optional hierarchy roots) to objects that should
 * receive transform edits. Solid-model result meshes resolve to the solid model
 * root. Outliner hierarchy groups (including solid CSG groups) transform as a
 * unit so nested content keeps local poses under the moved group.
 *
 * @param meshes Viewport / selection meshes.
 * @param hierarchyObjects Optional outliner/inspector roots for the selection.
 * @returns Transform targets (meshes, solid roots, or groups).
 */
export function resolveTransformTargets(
  meshes: readonly THREE.Mesh[],
  hierarchyObjects?: readonly THREE.Object3D[],
): THREE.Object3D[] {
  if (hierarchyObjects && hierarchyObjects.length > 0) {
    return resolveTargetsFromHierarchy(meshes, hierarchyObjects);
  }
  return resolveTargetsFromMeshesOnly(meshes);
}

/**
 * Maps selected meshes to inspector-bound objects. Solid results bind as the
 * solid model root so the inspector edits the solid as a unit.
 *
 * @param meshes Selected meshes.
 * @returns Objects for the properties panel.
 */
export function resolveInspectorObjects(meshes: readonly THREE.Mesh[]): THREE.Object3D[] {
  return resolveTargetsFromMeshesOnly(meshes);
}

/**
 * Resolves transform targets from mesh selection alone (no hierarchy override).
 *
 * @param meshes Selected meshes.
 * @returns Deduplicated transform targets.
 */
function resolveTargetsFromMeshesOnly(meshes: readonly THREE.Mesh[]): THREE.Object3D[] {
  const targets: THREE.Object3D[] = [];
  const seen = new Set<THREE.Object3D>();
  for (const mesh of meshes) {
    appendMeshTarget(mesh, targets, seen);
  }
  return targets;
}

/**
 * Prefers hierarchy groups as unitary transform targets, then falls back to
 * uncovered selected meshes.
 *
 * @param meshes Selected content meshes.
 * @param hierarchyObjects Inspector / outliner selection roots.
 * @returns Transform targets for the gizmo and pose commands.
 */
function resolveTargetsFromHierarchy(
  meshes: readonly THREE.Mesh[],
  hierarchyObjects: readonly THREE.Object3D[],
): THREE.Object3D[] {
  const targets: THREE.Object3D[] = [];
  const seen = new Set<THREE.Object3D>();
  const coveredMeshes = new Set<THREE.Mesh>();
  const roots = collapseToHierarchyRoots([...hierarchyObjects]);
  for (const root of roots) {
    appendHierarchyRootTarget(root, targets, seen, coveredMeshes);
  }
  for (const mesh of meshes) {
    if (coveredMeshes.has(mesh)) {
      continue;
    }
    appendMeshTarget(mesh, targets, seen);
  }
  return targets;
}

/**
 * Adds a hierarchy root as a unitary group target or as a mesh target.
 *
 * @param root Outermost hierarchy selection node.
 * @param targets Accumulator for transform targets.
 * @param seen Already-added targets.
 * @param coveredMeshes Meshes owned by unitary group targets.
 */
function appendHierarchyRootTarget(
  root: THREE.Object3D,
  targets: THREE.Object3D[],
  seen: Set<THREE.Object3D>,
  coveredMeshes: Set<THREE.Mesh>,
): void {
  if (isUnitaryGroupTarget(root)) {
    appendUniqueTarget(root, targets, seen);
    markMeshesUnderCovered(root, coveredMeshes);
    return;
  }
  if (!(root instanceof THREE.Mesh)) {
    return;
  }
  appendMeshTarget(root, targets, seen);
  coveredMeshes.add(root);
}

/**
 * Resolves one mesh to its transform target and appends it when new.
 *
 * @param mesh Selected mesh.
 * @param targets Accumulator for transform targets.
 * @param seen Already-added targets.
 */
function appendMeshTarget(mesh: THREE.Mesh, targets: THREE.Object3D[], seen: Set<THREE.Object3D>): void {
  appendUniqueTarget(resolveOneTransformTarget(mesh), targets, seen);
}

/**
 * Appends a target when it has not been added yet.
 *
 * @param target Candidate transform target.
 * @param targets Accumulator list.
 * @param seen Deduplication set.
 */
function appendUniqueTarget(target: THREE.Object3D, targets: THREE.Object3D[], seen: Set<THREE.Object3D>): void {
  if (seen.has(target)) {
    return;
  }
  seen.add(target);
  targets.push(target);
}

/**
 * Marks every mesh under a hierarchy node as covered by a unitary target.
 *
 * @param root Group or solid root being transformed as a unit.
 * @param coveredMeshes Mesh coverage set.
 */
function markMeshesUnderCovered(root: THREE.Object3D, coveredMeshes: Set<THREE.Mesh>): void {
  for (const mesh of collectMeshesUnder(root)) {
    coveredMeshes.add(mesh);
  }
}

/**
 * Returns whether an object should move as a single transform unit (groups and
 * solid model roots), rather than pushing pose into each child mesh.
 *
 * @param object Hierarchy selection node.
 * @returns True for group-like unitary targets.
 */
function isUnitaryGroupTarget(object: THREE.Object3D): boolean {
  return object instanceof THREE.Group;
}

/**
 * Resolves one mesh to its transform target.
 *
 * @param mesh Selected mesh.
 * @returns Solid model root when mesh is a solid result; otherwise the mesh.
 */
function resolveOneTransformTarget(mesh: THREE.Mesh): THREE.Object3D {
  if (!SolidModel.isResultMesh(mesh)) {
    return mesh;
  }
  const model = SolidModel.fromObject(mesh);
  return model?.root ?? mesh;
}

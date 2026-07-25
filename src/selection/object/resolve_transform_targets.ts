import * as THREE from 'three';
import { SolidModel } from '../../solid/model/solid_model.js';

/**
 * Maps selected meshes to the objects that should receive transform edits.
 * Solid-model result meshes resolve to the solid model root group so the whole
 * solid (brushes + result) moves together.
 *
 * @param meshes Viewport / selection meshes.
 * @returns Transform targets (meshes or solid model roots).
 */
export function resolveTransformTargets(meshes: readonly THREE.Mesh[]): THREE.Object3D[] {
  const targets: THREE.Object3D[] = [];
  const seen = new Set<THREE.Object3D>();
  for (const mesh of meshes) {
    const target = resolveOneTransformTarget(mesh);
    if (seen.has(target)) continue;
    seen.add(target);
    targets.push(target);
  }
  return targets;
}

/**
 * Resolves one mesh to its transform target.
 *
 * @param mesh Selected mesh.
 * @returns Solid model root when mesh is a solid result; otherwise the mesh.
 */
function resolveOneTransformTarget(mesh: THREE.Mesh): THREE.Object3D {
  if (!SolidModel.isResultMesh(mesh)) return mesh;
  const model = SolidModel.fromObject(mesh);
  return model?.root ?? mesh;
}

/**
 * Maps selected meshes to inspector-bound objects. Solid results bind as the
 * solid model root so the inspector edits the solid as a unit.
 *
 * @param meshes Selected meshes.
 * @returns Objects for the properties panel.
 */
export function resolveInspectorObjects(meshes: readonly THREE.Mesh[]): THREE.Object3D[] {
  return resolveTransformTargets(meshes);
}

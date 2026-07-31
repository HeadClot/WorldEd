import * as THREE from 'three';
import { SolidModel } from '@/solid/model/solid_model.js';

/**
 * Returns true when an object has local identity pose (no residual bake).
 *
 * @param object Object to inspect.
 * @returns True when position is zero, scale is unit, rotation is identity.
 */
export function solidObjectIsLocalIdentityPose(object: THREE.Object3D): boolean {
  if (object.position.lengthSq() > 1e-16) {
    return false;
  }
  if (Math.abs(object.scale.x - 1) > 1e-8) {
    return false;
  }
  if (Math.abs(object.scale.y - 1) > 1e-8) {
    return false;
  }
  if (Math.abs(object.scale.z - 1) > 1e-8) {
    return false;
  }
  const identity = new THREE.Quaternion();
  return Math.abs(object.quaternion.dot(identity)) > 1 - 1e-8;
}

/**
 * Resets the result mesh to local identity under the solid model root.
 *
 * @param result Result mesh.
 */
export function solidResultResetLocalTransform(result: THREE.Mesh): void {
  result.position.set(0, 0, 0);
  result.rotation.set(0, 0, 0);
  result.quaternion.identity();
  result.scale.set(1, 1, 1);
}

/**
 * Captures the solid root matrix once per drag for absolute result→root bakes.
 *
 * @param model Solid model being baked.
 * @param solidRootBakeBaselines Baseline map keyed by solid model.
 * @returns Pre-drag root local matrix.
 */
export function solidRootCaptureBakeBaseline(
  model: SolidModel,
  solidRootBakeBaselines: WeakMap<SolidModel, THREE.Matrix4>,
): THREE.Matrix4 {
  const existing = solidRootBakeBaselines.get(model);
  if (existing) {
    return existing;
  }
  model.root.updateMatrix();
  const baseline = model.root.matrix.clone();
  solidRootBakeBaselines.set(model, baseline);
  return baseline;
}

/**
 * Drops bake baselines after a transform commit finishes.
 *
 * @param models Models that participated in the commit.
 * @param solidRootBakeBaselines Baseline map keyed by solid model.
 */
export function solidRootClearBakeBaselines(
  models: Iterable<SolidModel>,
  solidRootBakeBaselines: WeakMap<SolidModel, THREE.Matrix4>,
): void {
  for (const model of models) {
    solidRootBakeBaselines.delete(model);
  }
}

/**
 * Bakes a lone result-mesh transform into the solid model root using the
 * pre-drag root matrix so repeated live samples do not compound.
 *
 * @param model Solid model whose result was moved alone.
 * @param solidRootBakeBaselines Baseline map keyed by solid model.
 */
export function solidRootBakeResultTransform(
  model: SolidModel,
  solidRootBakeBaselines: WeakMap<SolidModel, THREE.Matrix4>,
): void {
  const root = model.root;
  const result = model.getResultMesh();
  if (solidObjectIsLocalIdentityPose(result)) {
    return;
  }
  const baseline = solidRootCaptureBakeBaseline(model, solidRootBakeBaselines);
  const resultMatrix = new THREE.Matrix4().compose(
    result.position.clone(),
    result.quaternion.clone(),
    result.scale.clone(),
  );
  const combined = baseline.clone().multiply(resultMatrix);
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  combined.decompose(position, quaternion, scale);
  root.position.copy(position);
  root.quaternion.copy(quaternion);
  root.scale.copy(scale);
  root.rotation.setFromQuaternion(quaternion);
  solidResultResetLocalTransform(result);
}

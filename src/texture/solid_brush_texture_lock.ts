import * as THREE from 'three';
import { SolidBrush } from '../solid/brush/solid_brush.js';
import { SolidBrushInstance } from '../solid/model/solid_brush_instance.js';
import { FaceTextureMapping, cloneFaceTextureMapping } from './face_texture_mapping.js';
import { projectWorldPositionToUv, resolveProjectionBasis } from './planar_uv_projector.js';

const scratchPrevPoint = new THREE.Vector3();
const scratchNextPoint = new THREE.Vector3();
const scratchPrevNormal = new THREE.Vector3();
const scratchNextNormal = new THREE.Vector3();
const scratchPrevLocal = new THREE.Matrix4();
const scratchNextLocal = new THREE.Matrix4();
const scratchPrevWorld = new THREE.Matrix4();
const scratchNextWorld = new THREE.Matrix4();
const scratchNormalMatrix = new THREE.Matrix3();
const scratchQuat = new THREE.Quaternion();
const scratchQuatPrev = new THREE.Quaternion();
const scratchQuatNext = new THREE.Quaternion();
const scratchAxis = new THREE.Vector3();

/**
 * When texture lock is on, adjusts solid brush face mappings so world-projected
 * UVs stick to the brush across a transform (Hammer / classic CSG texture lock).
 * Call after the instance transform has been updated to the new pose, passing the
 * previous local transform components.
 * @param instance Brush whose face mappings should stick.
 * @param previousPosition Local position before the transform.
 * @param previousRotation Local rotation before the transform.
 * @param previousScale Local scale before the transform.
 * @param parentWorldMatrix World matrix of the brush parent (solid root).
 */
export function lockSolidBrushTexturesToTransform(
  instance: SolidBrushInstance,
  previousPosition: THREE.Vector3,
  previousRotation: THREE.Euler,
  previousScale: THREE.Vector3,
  parentWorldMatrix: THREE.Matrix4,
): void {
  composeLocalMatrix(previousPosition, previousRotation, previousScale, scratchPrevLocal);
  composeLocalMatrix(instance.position, instance.rotation, instance.scale, scratchNextLocal);
  scratchPrevWorld.multiplyMatrices(parentWorldMatrix, scratchPrevLocal);
  scratchNextWorld.multiplyMatrices(parentWorldMatrix, scratchNextLocal);
  const faceCount = instance.brush.faces.length;
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    const mapping = instance.getSurfaceMapping(faceIndex);
    const locked = lockFaceMappingForBrushTransform(
      mapping,
      instance.brush,
      faceIndex,
      scratchPrevWorld,
      scratchNextWorld,
    );
    instance.setFaceMapping(faceIndex, locked);
  }
}

/**
 * Snapshot of brush pose and face mappings at the start of a live drag.
 * Absolute lock from this baseline avoids incremental offset drift.
 */
export interface SolidBrushTextureLockBaseline {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
  /** Per-face mappings at drag start (index matches brush faces). */
  faceMappings: FaceTextureMapping[];
}

/**
 * Captures pose and face mappings for absolute texture lock during a drag.
 * @param instance Brush at the pre-drag pose.
 * @returns Baseline snapshot.
 */
export function captureSolidBrushTextureLockBaseline(
  instance: SolidBrushInstance,
): SolidBrushTextureLockBaseline {
  const faceCount = instance.brush.faces.length;
  const faceMappings: FaceTextureMapping[] = [];
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    faceMappings.push(instance.getSurfaceMapping(faceIndex));
  }
  return {
    position: instance.position.clone(),
    rotation: instance.rotation.clone(),
    scale: instance.scale.clone(),
    faceMappings,
  };
}

/**
 * Restores baseline mappings and locks them from the baseline pose to the
 * instance's current pose (absolute, not incremental).
 * @param instance Brush already at the new pose.
 * @param baseline Snapshot from drag start.
 * @param parentWorldMatrix World matrix of the solid root.
 */
export function lockSolidBrushTexturesFromBaseline(
  instance: SolidBrushInstance,
  baseline: SolidBrushTextureLockBaseline,
  parentWorldMatrix: THREE.Matrix4,
): void {
  composeLocalMatrix(baseline.position, baseline.rotation, baseline.scale, scratchPrevLocal);
  composeLocalMatrix(instance.position, instance.rotation, instance.scale, scratchNextLocal);
  scratchPrevWorld.multiplyMatrices(parentWorldMatrix, scratchPrevLocal);
  scratchNextWorld.multiplyMatrices(parentWorldMatrix, scratchNextLocal);
  const faceCount = instance.brush.faces.length;
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
    const source = baseline.faceMappings[faceIndex] ?? instance.getSurfaceMapping(faceIndex);
    const locked = lockFaceMappingForBrushTransform(
      source,
      instance.brush,
      faceIndex,
      scratchPrevWorld,
      scratchNextWorld,
    );
    instance.setFaceMapping(faceIndex, locked);
  }
}

/**
 * Locks one face mapping so a sample point keeps its UV after a world transform.
 * @param mapping Mapping before the transform.
 * @param brush Local brush geometry.
 * @param faceIndex Face index on the brush.
 * @param previousWorldMatrix Brush local-to-world before the transform.
 * @param nextWorldMatrix Brush local-to-world after the transform.
 * @returns Mapping with offsets (and custom axes) adjusted for lock.
 */
export function lockFaceMappingForBrushTransform(
  mapping: FaceTextureMapping,
  brush: SolidBrush,
  faceIndex: number,
  previousWorldMatrix: THREE.Matrix4,
  nextWorldMatrix: THREE.Matrix4,
): FaceTextureMapping {
  const result = cloneFaceTextureMapping(mapping);
  const localPoint = faceLocalCentroid(brush, faceIndex);
  const localNormal = brush.planes[faceIndex]?.normal ?? new THREE.Vector3(0, 1, 0);
  scratchPrevPoint.copy(localPoint).applyMatrix4(previousWorldMatrix);
  scratchNextPoint.copy(localPoint).applyMatrix4(nextWorldMatrix);
  transformDirection(localNormal, previousWorldMatrix, scratchPrevNormal);
  transformDirection(localNormal, nextWorldMatrix, scratchNextNormal);
  rotateCustomAxesIfPresent(result, previousWorldMatrix, nextWorldMatrix);
  const prevBasis = resolveProjectionBasis(scratchPrevNormal, mapping);
  const prevUv = projectWorldPositionToUv(scratchPrevPoint, prevBasis, mapping);
  const nextBasis = resolveProjectionBasis(scratchNextNormal, result);
  const scaleU = result.scaleU === 0 ? 1 : result.scaleU;
  const scaleV = result.scaleV === 0 ? 1 : result.scaleV;
  result.offsetU = scratchNextPoint.dot(nextBasis.uAxis) - prevUv.u * scaleU;
  result.offsetV = scratchNextPoint.dot(nextBasis.vAxis) - prevUv.v * scaleV;
  return result;
}

/**
 * Builds a local TRS matrix into the target matrix.
 * @param position Local position.
 * @param rotation Local Euler rotation.
 * @param scale Local scale.
 * @param target Matrix to write.
 */
function composeLocalMatrix(
  position: THREE.Vector3,
  rotation: THREE.Euler,
  scale: THREE.Vector3,
  target: THREE.Matrix4,
): void {
  scratchQuat.setFromEuler(rotation);
  target.compose(position, scratchQuat, scale);
}

/**
 * Transforms a local direction by a matrix's normal matrix into the target.
 * @param localDirection Local direction.
 * @param matrix World matrix.
 * @param target Output unit world direction.
 */
function transformDirection(
  localDirection: THREE.Vector3,
  matrix: THREE.Matrix4,
  target: THREE.Vector3,
): void {
  scratchNormalMatrix.getNormalMatrix(matrix);
  target.copy(localDirection).applyMatrix3(scratchNormalMatrix).normalize();
}

/**
 * Rotates custom U/V axes by the same rotation delta as the brush world pose.
 * @param mapping Mapping that may carry custom axes (modified in place).
 * @param previousWorldMatrix Pose before transform.
 * @param nextWorldMatrix Pose after transform.
 */
function rotateCustomAxesIfPresent(
  mapping: FaceTextureMapping,
  previousWorldMatrix: THREE.Matrix4,
  nextWorldMatrix: THREE.Matrix4,
): void {
  if (!mapping.customUAxis || !mapping.customVAxis) return;
  previousWorldMatrix.decompose(scratchPrevPoint, scratchQuatPrev, scratchNextPoint);
  nextWorldMatrix.decompose(scratchPrevPoint, scratchQuatNext, scratchNextPoint);
  scratchQuat.copy(scratchQuatPrev).invert();
  scratchQuat.premultiply(scratchQuatNext);
  rotateAxisRecord(mapping.customUAxis, scratchQuat);
  rotateAxisRecord(mapping.customVAxis, scratchQuat);
}

/**
 * Applies a quaternion to a stored axis record.
 * @param axis Axis components.
 * @param rotation World rotation delta.
 */
function rotateAxisRecord(
  axis: { x: number; y: number; z: number },
  rotation: THREE.Quaternion,
): void {
  scratchAxis.set(axis.x, axis.y, axis.z).applyQuaternion(rotation).normalize();
  axis.x = scratchAxis.x;
  axis.y = scratchAxis.y;
  axis.z = scratchAxis.z;
}

/**
 * Computes the centroid of a brush face in local brush space.
 * @param brush Solid brush geometry.
 * @param faceIndex Face index.
 * @returns Face centroid.
 */
function faceLocalCentroid(brush: SolidBrush, faceIndex: number): THREE.Vector3 {
  const face = brush.faces[faceIndex];
  if (!face) return new THREE.Vector3();
  const vertices = brush.getFaceVertices(face);
  const centroid = new THREE.Vector3();
  if (vertices.length === 0) return centroid;
  for (const vertex of vertices) {
    centroid.add(vertex);
  }
  return centroid.multiplyScalar(1 / vertices.length);
}

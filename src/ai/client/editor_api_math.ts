import * as THREE from 'three';
import type { McpBounds, McpVec3 } from '@/ai/shared/mcp_protocol_types.js';
import type { SolidBrushInstance } from '@/solid/model/solid_brush_instance.js';
import type { SolidModel } from '@/solid/model/solid_model.js';

const scratchQuaternion = new THREE.Quaternion();
const scratchMatrix = new THREE.Matrix4();
const scratchBox = new THREE.Box3();

/**
 * Converts a Three.js vector into a plain MCP DTO.
 *
 * @param vector Source vector.
 * @returns Plain {x,y,z} object.
 */
export function vec3ToDto(vector: THREE.Vector3): McpVec3 {
  return { x: vector.x, y: vector.y, z: vector.z };
}

/**
 * Converts Euler rotation (radians) into a plain MCP DTO.
 *
 * @param euler Source Euler angles.
 * @returns Plain {x,y,z} rotation in radians.
 */
export function eulerToDto(euler: THREE.Euler): McpVec3 {
  return { x: euler.x, y: euler.y, z: euler.z };
}

/**
 * Builds a Three.js vector from an MCP DTO.
 *
 * @param dto Plain vector or undefined.
 * @param fallback Default when dto is missing.
 * @returns Cloned vector.
 */
export function dtoToVec3(dto: McpVec3 | undefined, fallback: THREE.Vector3): THREE.Vector3 {
  if (!dto) return fallback.clone();
  return new THREE.Vector3(dto.x, dto.y, dto.z);
}

/**
 * Converts a box into an MCP bounds DTO.
 *
 * @param box Source box.
 * @returns Bounds DTO or null when empty.
 */
export function boxToDto(box: THREE.Box3): McpBounds | null {
  if (box.isEmpty()) return null;
  return { min: vec3ToDto(box.min), max: vec3ToDto(box.max) };
}

/**
 * Builds a box from an MCP bounds DTO.
 *
 * @param bounds Bounds DTO.
 * @returns Three.js box.
 */
export function dtoToBox(bounds: McpBounds): THREE.Box3 {
  return new THREE.Box3(
    new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.min.z),
    new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.max.z),
  );
}

/**
 * Composes a local TRS matrix for a brush instance.
 *
 * @param brush Brush instance with position/rotation/scale.
 * @returns Independent matrix.
 */
export function brushLocalMatrix(brush: SolidBrushInstance): THREE.Matrix4 {
  scratchQuaternion.setFromEuler(brush.rotation);
  return scratchMatrix.compose(brush.position, scratchQuaternion, brush.scale).clone();
}

/**
 * Computes world-space AABB for a brush under its solid model.
 *
 * @param model Owning solid model.
 * @param brush Brush instance.
 * @returns World bounds box.
 */
export function computeBrushWorldBounds(model: SolidModel, brush: SolidBrushInstance): THREE.Box3 {
  brush.pullTransformFromMesh();
  model.root.updateMatrixWorld(true);
  const localBounds = brush.brush.computeLocalBounds();
  if (localBounds.isEmpty()) return new THREE.Box3();
  const localMatrix = brushLocalMatrix(brush);
  const worldMatrix = new THREE.Matrix4().multiplyMatrices(model.root.matrixWorld, localMatrix);
  scratchBox.copy(localBounds).applyMatrix4(worldMatrix);
  return scratchBox.clone();
}

/**
 * Computes combined world bounds for all brushes in a solid model.
 *
 * @param model Solid model.
 * @returns Combined world box or empty box.
 */
export function computeModelWorldBounds(model: SolidModel): THREE.Box3 {
  const combined = new THREE.Box3();
  for (const brush of model.getBrushes()) {
    const brushBounds = computeBrushWorldBounds(model, brush);
    if (!brushBounds.isEmpty()) combined.union(brushBounds);
  }
  return combined;
}

/**
 * Returns the center of a bounds DTO.
 *
 * @param bounds Bounds to sample.
 * @returns Center point.
 */
export function boundsCenter(bounds: McpBounds): THREE.Vector3 {
  return new THREE.Vector3(
    (bounds.min.x + bounds.max.x) * 0.5,
    (bounds.min.y + bounds.max.y) * 0.5,
    (bounds.min.z + bounds.max.z) * 0.5,
  );
}

/**
 * Squared distance between two points (avoids sqrt when comparing).
 *
 * @param a First point.
 * @param b Second point.
 * @returns Squared Euclidean distance.
 */
export function distanceSquared(a: THREE.Vector3, b: THREE.Vector3): number {
  return a.distanceToSquared(b);
}

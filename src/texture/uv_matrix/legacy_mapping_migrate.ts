import * as THREE from 'three';
import {
  FaceTextureMapping,
  FaceTextureMappingWithTrs,
  cloneFaceTextureMapping,
  createDefaultFaceTextureMapping,
  createFaceTextureMappingFromTrs,
  deserializeFaceTextureMapping,
  withTrsAccessors,
} from '../uv/face_texture_mapping.js';
import { SurfaceUvMatrix } from './surface_uv_matrix.js';
import { FaceSurfaceDescription, cloneFaceSurface, createDefaultFaceSurface } from './face_surface_description.js';

/**
 * Converts a FaceTextureMapping into a face surface description (same matrix).
 *
 * @param mapping Source mapping.
 * @param _faceNormal Unused (matrix already complete).
 * @returns Face surface description.
 */
export function faceTextureMappingToSurface(
  mapping: FaceTextureMapping,
  faceNormal: THREE.Vector3,
): FaceSurfaceDescription {
  const normalized =
    mapping.uv instanceof SurfaceUvMatrix ? mapping : deserializeFaceTextureMapping(mapping as never, faceNormal);
  return {
    textureId: normalized.textureId,
    uv: normalized.uv.clone(),
  };
}

/**
 * Converts a face surface into a FaceTextureMapping (same matrix).
 *
 * @param surface Surface description.
 * @param _faceNormal Unused.
 * @returns Face texture mapping.
 */
export function surfaceToFaceTextureMapping(
  surface: FaceSurfaceDescription,
  _faceNormal: THREE.Vector3,
): FaceTextureMappingWithTrs {
  void _faceNormal;
  return withTrsAccessors({
    textureId: surface.textureId,
    uv: surface.uv.clone(),
    align: 'face',
  });
}

/**
 * Ensures a value is a FaceSurfaceDescription.
 *
 * @param value Surface description, mapping, or undefined.
 * @param faceNormal Face normal for legacy migration.
 * @returns Normalized surface description.
 */
export function coerceFaceSurface(
  value: FaceSurfaceDescription | FaceTextureMapping | undefined,
  faceNormal: THREE.Vector3,
): FaceSurfaceDescription {
  if (!value) return createDefaultFaceSurface();
  if (isFaceSurfaceDescription(value)) return cloneFaceSurface(value);
  if (isFaceTextureMapping(value)) {
    return faceTextureMappingToSurface(value, faceNormal);
  }
  return faceTextureMappingToSurface(deserializeFaceTextureMapping(value as never, faceNormal), faceNormal);
}

/**
 * Type guard for FaceSurfaceDescription.
 *
 * @param value Unknown value.
 * @returns True when the value has a SurfaceUvMatrix and textureId.
 */
export function isFaceSurfaceDescription(value: unknown): value is FaceSurfaceDescription {
  if (!value || typeof value !== 'object') return false;
  const record = value as { uv?: unknown; textureId?: unknown };
  return record.uv instanceof SurfaceUvMatrix && typeof record.textureId === 'string';
}

/**
 * Type guard for FaceTextureMapping with matrix.
 *
 * @param value Unknown value.
 * @returns True when the value is a face texture mapping.
 */
export function isFaceTextureMapping(value: unknown): value is FaceTextureMapping {
  return isFaceSurfaceDescription(value);
}

/**
 * Builds a default face mapping oriented to a face normal (1 m tiles).
 *
 * @param faceNormal Face normal.
 * @param textureId Texture id.
 * @returns Mapping with face-oriented UV matrix.
 */
export function createOrientedDefaultMapping(faceNormal: THREE.Vector3, textureId?: string): FaceTextureMapping {
  return createFaceTextureMappingFromTrs(
    textureId ?? createDefaultFaceTextureMapping().textureId,
    faceNormal,
    { scaleU: 1, scaleV: 1, offsetU: 0, offsetV: 0, rotationDeg: 0 },
    'face',
  );
}

/**
 * Clones a face texture mapping.
 *
 * @param mapping Source mapping.
 * @returns Clone.
 */
export function cloneLegacyFaceTextureMapping(mapping: FaceTextureMapping): FaceTextureMapping {
  return cloneFaceTextureMapping(mapping);
}

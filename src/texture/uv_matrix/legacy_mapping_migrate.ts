import * as THREE from 'three';
import {
  FaceTextureMapping,
  FaceTextureMappingWithTrs,
  deserializeFaceTextureMapping,
  withTrsAccessors,
} from '@/texture/uv/face_texture_mapping.js';
import { SurfaceUvMatrix } from './surface_uv_matrix.js';
import { FaceSurfaceDescription } from './face_surface_description.js';

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

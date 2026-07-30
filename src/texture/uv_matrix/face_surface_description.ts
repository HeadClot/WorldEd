import * as THREE from 'three';
import { DEFAULT_CHECKER_TEXTURE_ID } from '@/texture/library/texture_id.js';
import { SurfaceUvMatrix, type SurfaceUvMatrixSerialized } from './surface_uv_matrix.js';

/**
 * Authored texture identity plus UV matrix for one surface (solid face or
 * content coplanar region).
 */
export interface FaceSurfaceDescription {
  /** Durable texture identity. */
  textureId: string;
  /** UV projection matrix for this surface. */
  uv: SurfaceUvMatrix;
}

/** JSON form of a face surface description. */
export interface FaceSurfaceDescriptionSerialized {
  textureId: string;
  uv: SurfaceUvMatrixSerialized;
}

/**
 * Creates a default surface description (identity UV, optional texture id).
 *
 * @param textureId Optional texture identity.
 * @returns New default description.
 */
export function createDefaultFaceSurface(textureId: string = DEFAULT_CHECKER_TEXTURE_ID): FaceSurfaceDescription {
  return {
    textureId: textureId || DEFAULT_CHECKER_TEXTURE_ID,
    uv: SurfaceUvMatrix.identity(),
  };
}

/**
 * Creates a surface description with a TRS-built UV matrix for a face normal.
 *
 * @param faceNormal Face normal in the matrix space.
 * @param textureId Texture identity.
 * @param metersPerTileU World meters per texture tile on U (default 1).
 * @param metersPerTileV World meters per texture tile on V (default 1).
 * @returns New description.
 */
export function createFaceSurfaceFromTileSize(
  faceNormal: THREE.Vector3,
  textureId: string = DEFAULT_CHECKER_TEXTURE_ID,
  metersPerTileU: number = 1,
  metersPerTileV: number = 1,
): FaceSurfaceDescription {
  const scaleU = 1 / (metersPerTileU === 0 ? 1 : metersPerTileU);
  const scaleV = 1 / (metersPerTileV === 0 ? 1 : metersPerTileV);
  return {
    textureId: textureId || DEFAULT_CHECKER_TEXTURE_ID,
    uv: SurfaceUvMatrix.fromTrs(new THREE.Vector2(0, 0), faceNormal, 0, scaleU, scaleV),
  };
}

/**
 * Deep-clones a face surface description.
 *
 * @param surface Source surface.
 * @returns Independent copy.
 */
export function cloneFaceSurface(surface: FaceSurfaceDescription): FaceSurfaceDescription {
  return {
    textureId: surface.textureId || DEFAULT_CHECKER_TEXTURE_ID,
    uv: surface.uv.clone(),
  };
}

/**
 * Serializes a face surface for persistence.
 *
 * @param surface Source surface.
 * @returns Plain JSON object.
 */
export function serializeFaceSurface(surface: FaceSurfaceDescription): FaceSurfaceDescriptionSerialized {
  return {
    textureId: surface.textureId || DEFAULT_CHECKER_TEXTURE_ID,
    uv: surface.uv.serialize(),
  };
}

/**
 * Restores a face surface from persistence.
 *
 * @param data Serialized surface.
 * @returns Restored description.
 */
export function deserializeFaceSurface(data: FaceSurfaceDescriptionSerialized): FaceSurfaceDescription {
  return {
    textureId: data.textureId || DEFAULT_CHECKER_TEXTURE_ID,
    uv: SurfaceUvMatrix.fromSerialized(data.uv),
  };
}

/**
 * Returns whether two surfaces match (texture + UV within epsilon).
 *
 * @param a First surface.
 * @param b Second surface.
 * @param epsilon UV component tolerance.
 * @returns True when equal.
 */
export function faceSurfacesEqual(
  a: FaceSurfaceDescription,
  b: FaceSurfaceDescription,
  epsilon: number = 1e-6,
): boolean {
  if ((a.textureId || DEFAULT_CHECKER_TEXTURE_ID) !== (b.textureId || DEFAULT_CHECKER_TEXTURE_ID)) {
    return false;
  }
  return a.uv.equals(b.uv, epsilon);
}

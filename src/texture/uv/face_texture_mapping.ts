import * as THREE from 'three';
import { DEFAULT_CHECKER_TEXTURE_ID } from '../library/texture_id.js';
import { SurfaceUvMatrix, type SurfaceUvMatrixSerialized } from '../uv_matrix/surface_uv_matrix.js';

/**
 * World-axis alignment presets for building a default UV matrix. Stored as a UI
 * hint only; bake uses the UV matrix exclusively.
 */
export type FaceTextureAlign = 'auto' | 'floor' | 'ceiling' | 'wall' | 'face';

/**
 * Authored surface texture + UV matrix for one coplanar face region. UVs are
 * projected as u = U·p + Uw, v = V·p + Vw (SurfaceUvMatrix). Solids use
 * brush-local positions; content meshes use world positions at bake time. TRS
 * fields are optional on the type; withTrsAccessors provides live getters.
 */
export interface FaceTextureMapping {
  /** Durable texture identity. */
  textureId: string;
  /** 2×4 UV projection matrix. */
  uv: SurfaceUvMatrix;
  /** Optional UI align preset used when rebuilding the matrix from TRS. */
  align?: FaceTextureAlign;
  /** World meters per texture tile on U (TRS proxy accessor). */
  scaleU?: number;
  /** World meters per texture tile on V (TRS proxy accessor). */
  scaleV?: number;
  /** UV phase shift along U in meters (TRS proxy accessor). */
  offsetU?: number;
  /** UV phase shift along V in meters (TRS proxy accessor). */
  offsetV?: number;
  /** UV rotation around the face normal in degrees (TRS proxy accessor). */
  rotationDeg?: number;
}

/** TRS fields shown in the UV editor (meters-per-tile scale convention). */
export interface FaceTextureMappingTrs {
  /** World meters covered by one texture tile on U. */
  scaleU: number;
  /** World meters covered by one texture tile on V. */
  scaleV: number;
  /** UV phase shift along U (meters). */
  offsetU: number;
  /** UV phase shift along V (meters). */
  offsetV: number;
  /** Rotation of U/V around the face normal (degrees). */
  rotationDeg: number;
}

/**
 * Face mapping with TRS field accessors (via withTrsAccessors proxy).
 * scaleU/V/offsetU/V/rotationDeg read and write meters-per-tile TRS.
 */
export type FaceTextureMappingWithTrs = FaceTextureMapping & FaceTextureMappingTrs;

/** Stored mapping for a coplanar set of triangles on a mesh. */
export interface FaceTextureMapEntry {
  /** Triangle indices that share this mapping. */
  triangleIndices: number[];
  /** UV matrix + texture for this region. */
  mapping: FaceTextureMapping;
}

/** UserData key for face texture map tables on content meshes. */
export const FACE_TEXTURE_MAPS_USERDATA_KEY = 'faceTextureMaps';

/** Plain JSON form of a face texture mapping. */
export interface FaceTextureMappingSerialized {
  textureId: string;
  uv: SurfaceUvMatrixSerialized;
  align?: FaceTextureAlign;
  /** Legacy planar fields (load-only). */
  scaleU?: number;
  scaleV?: number;
  offsetU?: number;
  offsetV?: number;
  rotationDeg?: number;
  customUAxis?: { x: number; y: number; z: number };
  customVAxis?: { x: number; y: number; z: number };
}

/** Default normal used by TRS property accessors when no face normal is known. */
const DEFAULT_TRS_NORMAL = new THREE.Vector3(0, 1, 0);

/**
 * Creates a default face mapping (identity UV matrix, checker texture).
 *
 * @param textureId Optional texture id.
 * @returns New default mapping with TRS accessors.
 */
export function createDefaultFaceTextureMapping(
  textureId: string = DEFAULT_CHECKER_TEXTURE_ID,
): FaceTextureMappingWithTrs {
  return withTrsAccessors({
    textureId: textureId || DEFAULT_CHECKER_TEXTURE_ID,
    uv: SurfaceUvMatrix.identity(),
    align: 'auto',
  });
}

/**
 * Builds a face mapping from UV editor TRS fields and a face normal. scaleU/V
 * are meters per tile (Hammer-style); converted to matrix scale. Empty
 * textureId is preserved so applyMappingToTargets can keep each region's
 * assigned texture (UV editor TRS-only edits).
 *
 * @param textureId Texture identity, or empty to preserve existing on apply.
 * @param faceNormal Face normal in the matrix space.
 * @param trs Editor TRS fields.
 * @param align Optional align hint.
 * @returns New mapping with UV matrix and TRS accessors.
 */
export function createFaceTextureMappingFromTrs(
  textureId: string,
  faceNormal: THREE.Vector3,
  trs: FaceTextureMappingTrs,
  align: FaceTextureAlign = 'face',
): FaceTextureMappingWithTrs {
  const metersU = trs.scaleU === 0 ? 1 : trs.scaleU;
  const metersV = trs.scaleV === 0 ? 1 : trs.scaleV;
  const matrixScaleU = 1 / metersU;
  const matrixScaleV = 1 / metersV;
  const translation = new THREE.Vector2(-trs.offsetU * matrixScaleU, -trs.offsetV * matrixScaleV);
  return withTrsAccessors({
    textureId: normalizeOptionalTextureId(textureId),
    uv: SurfaceUvMatrix.fromTrs(translation, faceNormal, trs.rotationDeg, matrixScaleU, matrixScaleV),
    align,
  });
}

/**
 * Wraps a mapping so scaleU/offsetU/etc. read/write meters-per-tile TRS against
 * a default +Y normal (tests and UI). Bake always uses the UV matrix.
 *
 * @param mapping Source mapping.
 * @returns Proxied mapping with TRS field accessors.
 */
export function withTrsAccessors(mapping: FaceTextureMapping): FaceTextureMappingWithTrs {
  if ((mapping as { __trsProxy?: boolean }).__trsProxy) {
    return mapping as unknown as FaceTextureMappingWithTrs;
  }
  const target: FaceTextureMapping & { __trsProxy: boolean } = {
    textureId: normalizeOptionalTextureId(mapping.textureId),
    uv: mapping.uv.clone(),
    __trsProxy: true,
  };
  if (mapping.align !== undefined) target.align = mapping.align;
  return new Proxy(target, {
    get(obj, prop) {
      if (
        prop === 'scaleU' ||
        prop === 'scaleV' ||
        prop === 'offsetU' ||
        prop === 'offsetV' ||
        prop === 'rotationDeg'
      ) {
        return getFaceTextureMappingTrs(obj, DEFAULT_TRS_NORMAL)[prop];
      }
      return Reflect.get(obj, prop);
    },
    set(obj, prop, value) {
      if (
        prop === 'scaleU' ||
        prop === 'scaleV' ||
        prop === 'offsetU' ||
        prop === 'offsetV' ||
        prop === 'rotationDeg'
      ) {
        const trs = getFaceTextureMappingTrs(obj, DEFAULT_TRS_NORMAL);
        trs[prop as keyof FaceTextureMappingTrs] = value as number;
        const metersU = trs.scaleU === 0 ? 1 : trs.scaleU;
        const metersV = trs.scaleV === 0 ? 1 : trs.scaleV;
        const matrixScaleU = 1 / metersU;
        const matrixScaleV = 1 / metersV;
        obj.uv = SurfaceUvMatrix.fromTrs(
          new THREE.Vector2(-trs.offsetU * matrixScaleU, -trs.offsetV * matrixScaleV),
          DEFAULT_TRS_NORMAL,
          trs.rotationDeg,
          matrixScaleU,
          matrixScaleV,
        );
        return true;
      }
      return Reflect.set(obj, prop, value);
    },
  }) as unknown as FaceTextureMappingWithTrs;
}

/**
 * Decomposes a mapping into UV editor TRS fields (meters-per-tile scale).
 *
 * @param mapping Source mapping.
 * @param faceNormal Face normal for orientation.
 * @returns TRS fields for the UI.
 */
export function getFaceTextureMappingTrs(
  mapping: FaceTextureMapping,
  faceNormal: THREE.Vector3,
): FaceTextureMappingTrs {
  const uLen = Math.hypot(mapping.uv.u.x, mapping.uv.u.y, mapping.uv.u.z) || 1;
  const vLen = Math.hypot(mapping.uv.v.x, mapping.uv.v.y, mapping.uv.v.z) || 1;
  const metersU = 1 / uLen;
  const metersV = 1 / vLen;
  const trs = mapping.uv.decompose(faceNormal);
  return {
    scaleU: metersU,
    scaleV: metersV,
    offsetU: -mapping.uv.u.w * metersU,
    offsetV: -mapping.uv.v.w * metersV,
    rotationDeg: trs.rotationDeg,
  };
}

/**
 * Deep-clones a face texture mapping.
 *
 * @param mapping Source mapping.
 * @returns Independent copy.
 */
export function cloneFaceTextureMapping(mapping: FaceTextureMapping): FaceTextureMappingWithTrs {
  const cloned: FaceTextureMapping = {
    textureId: normalizeOptionalTextureId(mapping.textureId),
    uv: mapping.uv.clone(),
  };
  if (mapping.align !== undefined) cloned.align = mapping.align;
  return withTrsAccessors(cloned);
}

/**
 * Normalizes a texture id for mapping objects. Undefined/null becomes the
 * default checker; empty string is preserved as a "keep existing texture"
 * sentinel for UV-editor TRS apply.
 *
 * @param textureId Raw texture id or missing value.
 * @returns Normalized texture id (may be empty).
 */
function normalizeOptionalTextureId(textureId: string | undefined | null): string {
  if (textureId === undefined || textureId === null) return DEFAULT_CHECKER_TEXTURE_ID;
  return textureId;
}

/**
 * Clones a face texture map entry including triangle index list.
 *
 * @param entry Source entry.
 * @returns Independent copy.
 */
export function cloneFaceTextureMapEntry(entry: FaceTextureMapEntry): FaceTextureMapEntry {
  return {
    triangleIndices: entry.triangleIndices.slice(),
    mapping: cloneFaceTextureMapping(entry.mapping),
  };
}

/**
 * Serializes a mapping for scene persistence.
 *
 * @param mapping Source mapping.
 * @returns Plain JSON object.
 */
export function serializeFaceTextureMapping(mapping: FaceTextureMapping): FaceTextureMappingSerialized {
  const serialized: FaceTextureMappingSerialized = {
    textureId: mapping.textureId || DEFAULT_CHECKER_TEXTURE_ID,
    uv: mapping.uv.serialize(),
  };
  if (mapping.align !== undefined) serialized.align = mapping.align;
  return serialized;
}

/**
 * Restores a mapping from JSON, including legacy planar scale/offset form.
 *
 * @param data Serialized mapping.
 * @param faceNormal Face normal used when migrating legacy planar fields.
 * @returns Restored mapping.
 */
export function deserializeFaceTextureMapping(
  data: FaceTextureMappingSerialized | FaceTextureMapping | undefined,
  faceNormal: THREE.Vector3 = new THREE.Vector3(0, 1, 0),
): FaceTextureMappingWithTrs {
  if (!data) return createDefaultFaceTextureMapping();
  if (isMatrixMapping(data)) {
    return cloneFaceTextureMapping(data);
  }
  const record = data as FaceTextureMappingSerialized;
  if (record.uv && Array.isArray(record.uv.u) && Array.isArray(record.uv.v)) {
    const restored: FaceTextureMapping = {
      textureId: record.textureId || DEFAULT_CHECKER_TEXTURE_ID,
      uv: SurfaceUvMatrix.fromSerialized(record.uv),
    };
    if (record.align !== undefined) restored.align = record.align;
    return withTrsAccessors(restored);
  }
  return migrateLegacyPlanarMapping(record, faceNormal);
}

/**
 * Returns whether two mappings match (texture + UV within epsilon).
 *
 * @param a First mapping.
 * @param b Second mapping.
 * @param epsilon UV component tolerance.
 * @returns True when equal.
 */
export function faceTextureMappingsEqual(
  a: FaceTextureMapping,
  b: FaceTextureMapping,
  epsilon: number = 1e-6,
): boolean {
  if ((a.textureId || DEFAULT_CHECKER_TEXTURE_ID) !== (b.textureId || DEFAULT_CHECKER_TEXTURE_ID)) {
    return false;
  }
  return a.uv.equals(b.uv, epsilon);
}

/**
 * Type guard for live FaceTextureMapping with SurfaceUvMatrix.
 *
 * @param value Unknown value.
 * @returns True when value has a SurfaceUvMatrix uv field.
 */
function isMatrixMapping(value: unknown): value is FaceTextureMapping {
  if (!value || typeof value !== 'object') return false;
  const record = value as { uv?: unknown; textureId?: unknown };
  return record.uv instanceof SurfaceUvMatrix && typeof record.textureId === 'string';
}

/**
 * Converts legacy planar fields into a UV matrix mapping.
 *
 * @param data Legacy serialized mapping.
 * @param faceNormal Face normal for basis.
 * @returns Matrix mapping.
 */
function migrateLegacyPlanarMapping(
  data: FaceTextureMappingSerialized,
  faceNormal: THREE.Vector3,
): FaceTextureMappingWithTrs {
  const scaleU = data.scaleU === 0 || data.scaleU === undefined ? 1 : data.scaleU;
  const scaleV = data.scaleV === 0 || data.scaleV === undefined ? 1 : data.scaleV;
  const offsetU = data.offsetU ?? 0;
  const offsetV = data.offsetV ?? 0;
  const rotationDeg = data.rotationDeg ?? 0;
  if (data.customUAxis && data.customVAxis) {
    const uLen = Math.hypot(data.customUAxis.x, data.customUAxis.y, data.customUAxis.z) || 1;
    const vLen = Math.hypot(data.customVAxis.x, data.customVAxis.y, data.customVAxis.z) || 1;
    const uDir = new THREE.Vector3(data.customUAxis.x / uLen, data.customUAxis.y / uLen, data.customUAxis.z / uLen);
    const vDir = new THREE.Vector3(data.customVAxis.x / vLen, data.customVAxis.y / vLen, data.customVAxis.z / vLen);
    const u = new THREE.Vector4(uDir.x / scaleU, uDir.y / scaleU, uDir.z / scaleU, -offsetU / scaleU);
    const v = new THREE.Vector4(vDir.x / scaleV, vDir.y / scaleV, vDir.z / scaleV, -offsetV / scaleV);
    return withTrsAccessors({
      textureId: data.textureId || DEFAULT_CHECKER_TEXTURE_ID,
      uv: new SurfaceUvMatrix(u, v),
      align: data.align ?? 'face',
    });
  }
  return createFaceTextureMappingFromTrs(
    data.textureId || DEFAULT_CHECKER_TEXTURE_ID,
    faceNormal,
    { scaleU, scaleV, offsetU, offsetV, rotationDeg },
    data.align ?? 'face',
  );
}

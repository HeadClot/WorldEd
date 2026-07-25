import * as THREE from 'three';
import { FaceSelection } from '../../selection/face/face_selection_manager.js';
import { groupSelectionsIntoFaceRegions } from '../../selection/face/face_region_grouper.js';
import {
  FaceTextureAlign,
  FaceTextureMapping,
  cloneFaceTextureMapping,
  createDefaultFaceTextureMapping,
  createFaceTextureMappingFromTrs,
  getFaceTextureMappingTrs,
} from './face_texture_mapping.js';
import {
  upsertFaceTextureMap,
  getFaceTextureMaps,
  getFaceTextureMapsLive,
  setFaceTextureMaps,
} from './face_texture_storage.js';
import { isResultMesh, SOLID_TRIANGLE_SOURCES_USERDATA_KEY } from '../../solid/model/solid_model_keys.js';
import {
  bakeFaceUVs,
  bakeAllFacesDefaultUVs,
  computeRegionWorldNormal,
  countTriangles,
  rebakeStoredFaceTextureMaps,
  resolveProjectionNormal,
} from './planar_uv_projector.js';
import { SurfaceUvMatrix } from '../uv_matrix/surface_uv_matrix.js';
import { applyCylinderSideUnwrapOffsets } from './cylinder_side_unwrap.js';
import { captureGeometrySourceIfNeeded } from './geometry_source.js';
import { rebuildSurfaceMaterials } from '../material/surface_material_builder.js';
import { getTexturePaintState } from '../paint/texture_paint_state.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '../library/texture_id.js';

/** Describes one mesh region that will receive a texture mapping update. */
export interface TextureApplyTarget {
  mesh: THREE.Mesh;
  triangleIndices: number[];
  previousMapping: FaceTextureMapping | null;
}

/**
 * Builds apply targets from face selections (coplanar regions).
 *
 * @param selections Current face selection entries.
 * @returns Targets ready for mapping updates.
 */
export function buildTargetsFromFaceSelection(selections: FaceSelection[]): TextureApplyTarget[] {
  const regions = groupSelectionsIntoFaceRegions(selections);
  return regions.map((region) => ({
    mesh: region.mesh,
    triangleIndices: region.faceIndices.slice(),
    previousMapping: findExistingMapping(region.mesh, region.faceIndices),
  }));
}

/**
 * Builds apply targets covering every triangle on each mesh.
 *
 * @param meshes Selected content meshes.
 * @returns One target per coplanar region across all meshes.
 */
export function buildTargetsFromMeshes(meshes: THREE.Mesh[]): TextureApplyTarget[] {
  const targets: TextureApplyTarget[] = [];
  meshes.forEach((mesh) => {
    const triangleCount = countTriangles(mesh.geometry);
    const indices: number[] = [];
    for (let i = 0; i < triangleCount; i++) indices.push(i);
    const selections: FaceSelection[] = indices.map((faceIndex) => ({
      mesh,
      faceIndex,
    }));
    targets.push(...buildTargetsFromFaceSelection(selections));
  });
  return targets;
}

/**
 * Finds a stored mapping for a triangle region. Prefers solid brush-surface
 * identity when present (O(entries) without cloning). Ordinary meshes use exact
 * set / cover / overlap matching.
 *
 * @param mesh Mesh to search.
 * @param triangleIndices Region indices.
 * @returns Existing mapping or null.
 */
function findExistingMapping(mesh: THREE.Mesh, triangleIndices: number[]): FaceTextureMapping | null {
  if (triangleIndices.length === 0) return null;
  const solidMapping = findSolidSurfaceMapping(mesh, triangleIndices[0]);
  if (solidMapping) return solidMapping;
  return findOrdinaryMeshMapping(mesh, triangleIndices);
}

/**
 * Resolves a solid-result face mapping via triangle source identity without
 * cloning the entire face-map table.
 *
 * @param mesh Solid result mesh.
 * @param seedFaceIndex Any triangle on the brush surface.
 * @returns Cloned mapping or null when not a solid result / not found.
 */
function findSolidSurfaceMapping(mesh: THREE.Mesh, seedFaceIndex: number): FaceTextureMapping | null {
  const sources = mesh.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY];
  if (!Array.isArray(sources) || sources.length === 0) return null;
  const seed = sources[seedFaceIndex] as { brushId?: string; surfaceIndex?: number } | undefined;
  if (!seed?.brushId || typeof seed.surfaceIndex !== 'number') return null;
  const entries = getFaceTextureMapsLive(mesh);
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const sampleIndex = entry.triangleIndices[0];
    if (sampleIndex === undefined) continue;
    const sample = sources[sampleIndex] as { brushId?: string; surfaceIndex?: number } | undefined;
    if (!sample) continue;
    if (sample.brushId === seed.brushId && sample.surfaceIndex === seed.surfaceIndex) {
      return cloneFaceTextureMapping(entry.mapping);
    }
  }
  return null;
}

/**
 * Finds a stored mapping for ordinary (non-solid) mesh regions.
 *
 * @param mesh Mesh to search.
 * @param triangleIndices Region indices.
 * @returns Existing mapping or null.
 */
function findOrdinaryMeshMapping(mesh: THREE.Mesh, triangleIndices: number[]): FaceTextureMapping | null {
  const sorted = triangleIndices.slice().sort((a, b) => a - b);
  const key = sorted.join(',');
  const indexSet = new Set(sorted);
  const entries = getFaceTextureMapsLive(mesh);
  for (let i = 0; i < entries.length; i++) {
    const entryKey = entries[i].triangleIndices
      .slice()
      .sort((a, b) => a - b)
      .join(',');
    if (entryKey === key) return cloneFaceTextureMapping(entries[i].mapping);
  }
  for (let i = 0; i < entries.length; i++) {
    if (regionFullyCoveredByEntry(sorted, entries[i].triangleIndices)) {
      return cloneFaceTextureMapping(entries[i].mapping);
    }
  }
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].triangleIndices.some((index) => indexSet.has(index))) {
      return cloneFaceTextureMapping(entries[i].mapping);
    }
  }
  return null;
}

/**
 * Returns whether every target triangle appears in the entry.
 *
 * @param sortedTarget Sorted target triangle indices.
 * @param entryIndices Entry triangle indices.
 * @returns True when the entry covers the whole target region.
 */
function regionFullyCoveredByEntry(sortedTarget: number[], entryIndices: number[]): boolean {
  const entrySet = new Set(entryIndices);
  return sortedTarget.every((index) => entrySet.has(index));
}

/**
 * Resolves the effective mapping for a target (live storage, then snapshot,
 * then default).
 *
 * @param target Apply target.
 * @returns Mapping to edit.
 */
export function resolveTargetMapping(target: TextureApplyTarget): FaceTextureMapping {
  const live = findExistingMapping(target.mesh, target.triangleIndices);
  if (live) return live;
  if (target.previousMapping) {
    return cloneFaceTextureMapping(target.previousMapping);
  }
  return createDefaultFaceTextureMapping();
}

/**
 * Applies UV editor fields to each target while preserving each region's
 * textureId. Rebuilds the UV matrix from TRS using each region's face normal so
 * rotation/scale never use a wrong plane (e.g. Y-up for a Z face).
 *
 * @param targets Regions to update.
 * @param mapping Mapping parameters (TRS source; matrix is rebuilt per face).
 */
export function applyMappingToTargets(targets: TextureApplyTarget[], mapping: FaceTextureMapping): void {
  const meshes = new Set<THREE.Mesh>();
  targets.forEach((target) => {
    const fullMapping = buildFaceOrientedMapping(target, mapping);
    upsertFaceTextureMap(target.mesh, target.triangleIndices, fullMapping);
    bakeFaceUVs(target.mesh, target.triangleIndices, fullMapping);
    meshes.add(target.mesh);
  });
  meshes.forEach((mesh) => rebuildMaterialsPreservingSolidOrder(mesh));
}

/**
 * Builds a face-oriented UV matrix mapping from editor TRS fields.
 *
 * @param target Region receiving the mapping.
 * @param mapping Incoming mapping (TRS extracted from its matrix).
 * @returns Mapping with UV matrix on the face plane.
 */
function buildFaceOrientedMapping(target: TextureApplyTarget, mapping: FaceTextureMapping): FaceTextureMapping {
  const textureId = resolveTextureIdForMerge(target, mapping);
  const faceNormal = computeRegionWorldNormal(target.mesh, target.triangleIndices);
  const align = mapping.align ?? 'face';
  const projectionNormal = resolveProjectionNormal(faceNormal, align);
  const extractNormal = resolveTrsExtractNormal(mapping, projectionNormal);
  const trs = getFaceTextureMappingTrs(mapping, extractNormal);
  return createFaceTextureMappingFromTrs(textureId, projectionNormal, trs, align);
}

/**
 * Picks a normal for reading TRS from an existing matrix (prefers the matrix
 * plane; falls back to the face projection normal).
 *
 * @param mapping Incoming mapping.
 * @param fallbackNormal Face projection normal.
 * @returns Unit normal for TRS decompose.
 */
function resolveTrsExtractNormal(mapping: FaceTextureMapping, fallbackNormal: THREE.Vector3): THREE.Vector3 {
  if (mapping.uv instanceof SurfaceUvMatrix) {
    const planeNormal = mapping.uv.planeNormal();
    if (planeNormal.lengthSq() > 1e-12) return planeNormal;
  }
  return fallbackNormal.clone().normalize();
}

/**
 * Resolves texture id when merging editor fields onto a target.
 *
 * @param target Region being updated.
 * @param mapping Incoming mapping.
 * @returns Texture identity string.
 */
function resolveTextureIdForMerge(target: TextureApplyTarget, mapping: FaceTextureMapping): string {
  if (mapping.textureId) return mapping.textureId;
  const existing = resolveTargetMapping(target).textureId;
  return existing || DEFAULT_CHECKER_TEXTURE_ID;
}

/**
 * Assigns a texture id without rebaking UVs. Projection params and the baked UV
 * buffer stay untouched so cylinder unwrap and per-face offsets survive paint
 * operations.
 *
 * @param targets Regions to update.
 * @param textureId Texture identity to apply.
 */
export function applyTextureIdToTargets(targets: TextureApplyTarget[], textureId: string): void {
  const resolvedId = textureId || DEFAULT_CHECKER_TEXTURE_ID;
  const meshes = new Set<THREE.Mesh>();
  targets.forEach((target) => {
    patchTextureIdOnRegion(target.mesh, target.triangleIndices, resolvedId);
    meshes.add(target.mesh);
  });
  meshes.forEach((mesh) => rebuildMaterialsPreservingSolidOrder(mesh));
}

/**
 * Sets only the align preset on targets, keeping scale/offset/rotation/texture.
 *
 * @param targets Regions to update.
 * @param align Align preset.
 */
export function applyAlignToTargets(targets: TextureApplyTarget[], align: FaceTextureAlign): void {
  const meshes = new Set<THREE.Mesh>();
  targets.forEach((target) => {
    const existing = resolveTargetMapping(target);
    const faceNormal = computeRegionWorldNormal(target.mesh, target.triangleIndices);
    const projectionNormal = resolveProjectionNormal(faceNormal, align);
    const trs = getFaceTextureMappingTrs(existing, faceNormal);
    const mapping = createFaceTextureMappingFromTrs(existing.textureId, projectionNormal, trs, align);
    upsertFaceTextureMap(target.mesh, target.triangleIndices, mapping);
    bakeFaceUVs(target.mesh, target.triangleIndices, mapping);
    meshes.add(target.mesh);
  });
  meshes.forEach((mesh) => rebuildMaterialsPreservingSolidOrder(mesh));
}

/**
 * Resets UV projection to smart defaults while keeping texture ids. Restores
 * face-plane auto projection (scale 1, rotation 0). When every triangle of a
 * cylinder is included, re-applies circumferential U unwrap so the shell
 * matches create-time layout.
 *
 * @param targets Regions to reset.
 */
export function resetUvParamsOnTargets(targets: TextureApplyTarget[]): void {
  const meshes = new Set<THREE.Mesh>();
  targets.forEach((target) => {
    const existing = resolveTargetMapping(target);
    const mapping = createDefaultFaceTextureMapping(existing.textureId);
    upsertFaceTextureMap(target.mesh, target.triangleIndices, mapping);
    meshes.add(target.mesh);
  });
  meshes.forEach((mesh) => {
    const meshTargets = targets.filter((target) => target.mesh === mesh);
    if (targetsCoverEntireMesh(mesh, meshTargets)) {
      restoreGeometryAwareUvDefaults(mesh);
      rebakeStoredFaceTextureMaps(mesh);
    } else {
      meshTargets.forEach((target) => {
        const mapping = resolveTargetMapping(target);
        bakeFaceUVs(mesh, target.triangleIndices, mapping);
      });
    }
    rebuildMaterialsPreservingSolidOrder(mesh);
  });
}

/**
 * Rebuilds surface materials without reordering solid result triangles. Solid
 * CSG result meshes keep brush-range layout for partial remesh/patch; permuting
 * by texture would scramble neighbor brushes and make them vanish.
 *
 * @param mesh Mesh receiving material layout.
 */
function rebuildMaterialsPreservingSolidOrder(mesh: THREE.Mesh): void {
  rebuildSurfaceMaterials(mesh, undefined, undefined, {
    preserveTriangleOrder: isResultMesh(mesh),
  });
}

/**
 * Returns whether the targets include every triangle on the mesh.
 *
 * @param mesh Mesh to test.
 * @param meshTargets Targets belonging to that mesh.
 * @returns True when the whole surface is covered.
 */
function targetsCoverEntireMesh(mesh: THREE.Mesh, meshTargets: TextureApplyTarget[]): boolean {
  const covered = new Set<number>();
  meshTargets.forEach((target) => {
    target.triangleIndices.forEach((index) => covered.add(index));
  });
  return covered.size === countTriangles(mesh.geometry);
}

/**
 * Patches textureId on stored entries that overlap a region (no UV rewrite).
 *
 * @param mesh Mesh owning face maps.
 * @param triangleIndices Region triangles.
 * @param textureId New texture identity.
 */
function patchTextureIdOnRegion(mesh: THREE.Mesh, triangleIndices: number[], textureId: string): void {
  const indexSet = new Set(triangleIndices);
  const entries = getFaceTextureMaps(mesh);
  let hitCount = 0;
  entries.forEach((entry) => {
    const overlaps = entry.triangleIndices.some((index) => indexSet.has(index));
    if (!overlaps) return;
    entry.mapping.textureId = textureId;
    hitCount += 1;
  });
  if (hitCount === 0) {
    entries.push({
      triangleIndices: triangleIndices.slice().sort((a, b) => a - b),
      mapping: createDefaultFaceTextureMapping(textureId),
    });
  }
  setFaceTextureMaps(mesh, entries);
}

/**
 * Re-applies geometry-specific UV layout (cylinder unwrap) after a reset.
 *
 * @param mesh Mesh whose face maps were reset to defaults.
 */
function restoreGeometryAwareUvDefaults(mesh: THREE.Mesh): void {
  const entries = getFaceTextureMaps(mesh);
  if (entries.length === 0) return;
  applyCylinderSideUnwrapOffsets(mesh, entries);
  setFaceTextureMaps(mesh, entries);
}

/**
 * @deprecated Use resetUvParamsOnTargets — name kept for older call sites.
 * @param targets Regions to reset.
 */
export function resetTargetsToDefault(targets: TextureApplyTarget[]): void {
  resetUvParamsOnTargets(targets);
}

/**
 * Initializes default UVs, face maps, and surface materials on a content mesh.
 * Uses the last painted texture id when available.
 *
 * @param mesh Mesh to prepare.
 * @param textureId Optional texture id override.
 * @param align Optional projection align override (e.g. floor for terrain).
 */
export function initializeMeshTextureUVs(mesh: THREE.Mesh, textureId?: string, align?: FaceTextureAlign): void {
  captureGeometrySourceIfNeeded(mesh);
  const paintId = textureId ?? getTexturePaintState().getLastTextureId();
  const triangleCount = countTriangles(mesh.geometry);
  const allIndices: number[] = [];
  for (let i = 0; i < triangleCount; i++) allIndices.push(i);
  const targets = buildTargetsFromFaceSelection(allIndices.map((faceIndex) => ({ mesh, faceIndex })));
  if (targets.length === 0) {
    bakeAllFacesDefaultUVs(mesh, createDefaultFaceTextureMapping(paintId));
    rebuildSurfaceMaterials(mesh);
    return;
  }
  const entries = targets.map((target) => {
    const faceNormal = computeRegionWorldNormal(mesh, target.triangleIndices);
    const projectionNormal = resolveProjectionNormal(faceNormal, align ?? 'auto');
    return {
      triangleIndices: target.triangleIndices.slice(),
      mapping: createFaceTextureMappingFromTrs(
        paintId,
        projectionNormal,
        { scaleU: 1, scaleV: 1, offsetU: 0, offsetV: 0, rotationDeg: 0 },
        align ?? 'auto',
      ),
    };
  });
  applyCylinderSideUnwrapOffsets(mesh, entries);
  setFaceTextureMaps(mesh, entries);
  rebakeStoredFaceTextureMaps(mesh);
  rebuildSurfaceMaterials(mesh);
}

/**
 * Reads a common mapping across targets when texture id and TRS match.
 * Face-oriented UV matrices differ per normal, so compare decomposed TRS.
 *
 * @param targets Selection targets.
 * @returns Shared mapping (first target), or null when mixed / empty.
 */
export function getCommonMapping(targets: TextureApplyTarget[]): FaceTextureMapping | null {
  if (targets.length === 0) return null;
  const first = resolveTargetMapping(targets[0]);
  const firstNormal = computeRegionWorldNormal(targets[0].mesh, targets[0].triangleIndices);
  const firstTrs = getFaceTextureMappingTrs(first, firstNormal);
  const firstTextureId = first.textureId || DEFAULT_CHECKER_TEXTURE_ID;
  for (let i = 1; i < targets.length; i++) {
    const next = resolveTargetMapping(targets[i]);
    if ((next.textureId || DEFAULT_CHECKER_TEXTURE_ID) !== firstTextureId) return null;
    const nextNormal = computeRegionWorldNormal(targets[i].mesh, targets[i].triangleIndices);
    const nextTrs = getFaceTextureMappingTrs(next, nextNormal);
    if (!faceTextureTrsEqual(firstTrs, nextTrs)) return null;
  }
  return first;
}

/**
 * Compares two TRS field sets within a small epsilon.
 *
 * @param a First TRS.
 * @param b Second TRS.
 * @returns True when equal.
 */
function faceTextureTrsEqual(
  a: ReturnType<typeof getFaceTextureMappingTrs>,
  b: ReturnType<typeof getFaceTextureMappingTrs>,
): boolean {
  return (
    Math.abs(a.scaleU - b.scaleU) < 1e-4 &&
    Math.abs(a.scaleV - b.scaleV) < 1e-4 &&
    Math.abs(a.offsetU - b.offsetU) < 1e-4 &&
    Math.abs(a.offsetV - b.offsetV) < 1e-4 &&
    Math.abs(a.rotationDeg - b.rotationDeg) < 1e-3
  );
}

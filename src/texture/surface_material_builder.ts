import * as THREE from 'three';
import { FaceTextureMapping, createDefaultFaceTextureMapping } from './face_texture_mapping.js';
import { getFaceTextureMaps, setFaceTextureMaps } from './face_texture_storage.js';
import { countTriangles } from './planar_uv_projector.js';
import { TextureMapCache, getTextureMapCache } from './texture_map_cache.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from './texture_id.js';
import { CONTENT_METALNESS, CONTENT_ROUGHNESS } from '../materials/content_material_factory.js';
import { invalidateFacePickAcceleration } from '../selection/mesh_pick_acceleration.js';

/**
 * UserData key for per-triangle brush surface sources on solid result meshes.
 * Kept as a string to avoid a solid_model import cycle.
 */
const TRIANGLE_SOURCES_USERDATA_KEY = 'solidTriangleSources';

/** Options for rebuildSurfaceMaterials. */
export interface RebuildSurfaceMaterialsOptions {
  /**
   * When true, never permutes triangle buffers. Groups follow current order
   * (may produce more draw calls). Required for solid result partial mesh
   * patches.
   */
  preserveTriangleOrder?: boolean;
}

/**
 * Rebuilds mesh materials and geometry groups from stored face texture maps. By
 * default triangles are sorted by material so each texture is one draw call.
 *
 * @param mesh Content mesh to update.
 * @param cache Optional texture map cache (defaults to shared).
 * @param colorHex Optional tint; defaults to current material color.
 * @param options Optional layout controls.
 */
export function rebuildSurfaceMaterials(
  mesh: THREE.Mesh,
  cache: TextureMapCache = getTextureMapCache(),
  colorHex?: number,
  options: RebuildSurfaceMaterialsOptions = {},
): void {
  const color = colorHex ?? extractMeshColor(mesh);
  const triangleCount = countTriangles(mesh.geometry);
  if (triangleCount === 0) return;
  const perTriangle = buildPerTriangleTextureIds(mesh, triangleCount);
  const materialSlots = collectUniqueTextureIds(perTriangle);
  const materials = materialSlots.map((textureId) => createSurfaceMaterial(color, cache.resolve(textureId)));
  applyMaterialLayout(mesh, perTriangle, materialSlots, options.preserveTriangleOrder === true);
  disposeOwnedMaterials(mesh);
  mesh.material = materials.length === 1 ? materials[0] : materials;
}

/** Region input for solid-result material rebuild (avoids map clone thrash). */
export interface SolidResultTextureRegion {
  /** Triangle indices in the result mesh. */
  triangleIndices: number[];
  /** Texture id for those triangles. */
  textureId: string;
}

/**
 * Rebuilds solid result materials from surface regions without cloning map
 * tables. Uses a compact slot array and run-length groups (critical for large
 * VMF meshes).
 *
 * @param mesh Solid result mesh.
 * @param regions Surface regions with texture ids.
 * @param cache Optional texture map cache.
 * @param colorHex Optional tint.
 */
export function rebuildSolidResultMaterials(
  mesh: THREE.Mesh,
  regions: readonly SolidResultTextureRegion[],
  cache: TextureMapCache = getTextureMapCache(),
  colorHex?: number,
): void {
  const color = colorHex ?? extractMeshColor(mesh);
  const triangleCount = countTriangles(mesh.geometry);
  if (triangleCount === 0) return;
  const materialSlots = collectRegionTextureIds(regions);
  const slotIndex = new Map<string, number>();
  materialSlots.forEach((id, index) => slotIndex.set(id, index));
  const slotPerTriangle = new Uint16Array(triangleCount);
  for (const region of regions) {
    const slot = slotIndex.get(region.textureId || DEFAULT_CHECKER_TEXTURE_ID) ?? 0;
    for (const triangleIndex of region.triangleIndices) {
      if (triangleIndex >= 0 && triangleIndex < triangleCount) {
        slotPerTriangle[triangleIndex] = slot;
      }
    }
  }
  mesh.geometry.clearGroups();
  if (materialSlots.length > 1) {
    applySlotRunGroups(mesh.geometry, slotPerTriangle, materialSlots.length);
  }
  const materials = materialSlots.map((textureId) => createSurfaceMaterial(color, cache.resolve(textureId)));
  disposeOwnedMaterials(mesh);
  mesh.material = materials.length === 1 ? materials[0] : materials;
}

/**
 * Collects unique texture ids from solid regions in first-seen order.
 *
 * @param regions Solid texture regions.
 * @returns Unique texture id list.
 */
function collectRegionTextureIds(regions: readonly SolidResultTextureRegion[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const region of regions) {
    const id = region.textureId || DEFAULT_CHECKER_TEXTURE_ID;
    if (seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }
  return ordered.length > 0 ? ordered : [DEFAULT_CHECKER_TEXTURE_ID];
}

/**
 * Writes merged geometry groups from per-triangle material slot indices.
 *
 * @param geometry Target geometry.
 * @param slotPerTriangle Material slot per triangle.
 * @param slotCount Number of material slots.
 */
function applySlotRunGroups(geometry: THREE.BufferGeometry, slotPerTriangle: Uint16Array, slotCount: number): void {
  void slotCount;
  let runStart = 0;
  while (runStart < slotPerTriangle.length) {
    const materialIndex = slotPerTriangle[runStart];
    let runEnd = runStart + 1;
    while (runEnd < slotPerTriangle.length && slotPerTriangle[runEnd] === materialIndex) {
      runEnd += 1;
    }
    geometry.addGroup(runStart * 3, (runEnd - runStart) * 3, materialIndex);
    runStart = runEnd;
  }
}

/**
 * Sorts triangles by material and writes compact geometry groups.
 *
 * @param mesh Content mesh.
 * @param perTriangle Texture id per original triangle index.
 * @param materialSlots Ordered unique texture ids.
 * @param preserveTriangleOrder When true, skip reordering and group in place.
 */
function applyMaterialLayout(
  mesh: THREE.Mesh,
  perTriangle: string[],
  materialSlots: string[],
  preserveTriangleOrder: boolean,
): void {
  mesh.geometry.clearGroups();
  if (materialSlots.length <= 1) {
    return;
  }
  if (preserveTriangleOrder) {
    applyMergedGeometryGroups(mesh.geometry, perTriangle, materialSlots);
    return;
  }
  const order = buildMaterialSortedOrder(perTriangle, materialSlots);
  if (!isIdentityOrder(order)) {
    reorderGeometryTriangles(mesh.geometry, order);
    remapFaceTextureMaps(mesh, order);
    remapTriangleSources(mesh, order);
  }
  const sortedIds = order.map((oldIndex) => perTriangle[oldIndex]);
  applyMergedGeometryGroups(mesh.geometry, sortedIds, materialSlots);
}

/**
 * Builds a per-triangle texture id table from stored maps.
 *
 * @param mesh Mesh with optional faceTextureMaps.
 * @param triangleCount Number of triangles.
 * @returns Texture id per triangle index.
 */
function buildPerTriangleTextureIds(mesh: THREE.Mesh, triangleCount: number): string[] {
  const ids = new Array<string>(triangleCount).fill(DEFAULT_CHECKER_TEXTURE_ID);
  const entries = getFaceTextureMaps(mesh);
  if (entries.length === 0) {
    return ids;
  }
  entries.forEach((entry) => {
    const textureId = entry.mapping.textureId || DEFAULT_CHECKER_TEXTURE_ID;
    entry.triangleIndices.forEach((triangleIndex) => {
      if (triangleIndex >= 0 && triangleIndex < triangleCount) {
        ids[triangleIndex] = textureId;
      }
    });
  });
  return ids;
}

/**
 * Collects unique texture ids in first-seen order.
 *
 * @param perTriangle Per-triangle texture ids.
 * @returns Unique id list.
 */
function collectUniqueTextureIds(perTriangle: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  perTriangle.forEach((id) => {
    if (seen.has(id)) return;
    seen.add(id);
    ordered.push(id);
  });
  return ordered.length > 0 ? ordered : [DEFAULT_CHECKER_TEXTURE_ID];
}

/**
 * Builds a stable triangle order grouped by material slot.
 *
 * @param perTriangle Texture id per triangle.
 * @param materialSlots Ordered unique texture ids.
 * @returns New-order list of original triangle indices.
 */
function buildMaterialSortedOrder(perTriangle: string[], materialSlots: string[]): number[] {
  const slotIndex = new Map<string, number>();
  materialSlots.forEach((id, index) => slotIndex.set(id, index));
  const buckets: number[][] = materialSlots.map(() => []);
  for (let triangleIndex = 0; triangleIndex < perTriangle.length; triangleIndex++) {
    const slot = slotIndex.get(perTriangle[triangleIndex]) ?? 0;
    buckets[slot].push(triangleIndex);
  }
  const order: number[] = [];
  buckets.forEach((bucket) => {
    bucket.forEach((triangleIndex) => order.push(triangleIndex));
  });
  return order;
}

/**
 * Returns whether an order is already 0..n-1.
 *
 * @param order Triangle permutation.
 * @returns True when no reordering is required.
 */
function isIdentityOrder(order: number[]): boolean {
  for (let index = 0; index < order.length; index++) {
    if (order[index] !== index) return false;
  }
  return true;
}

/**
 * Reorders triangle vertex data so material slots become contiguous.
 *
 * @param geometry Mesh geometry (indexed or non-indexed).
 * @param order New-order list of original triangle indices.
 */
function reorderGeometryTriangles(geometry: THREE.BufferGeometry, order: number[]): void {
  const index = geometry.getIndex();
  if (index) {
    reorderIndexedTriangles(geometry, order);
  } else {
    reorderNonIndexedTriangles(geometry, order);
  }
  // Triangle order changed: face-pick BVH AABBs must be rebuilt or picks hit the
  // wrong surfaces after multi-texture material sorting.
  invalidateFacePickAcceleration(geometry);
}

/**
 * Reorders an indexed geometry's index buffer by triangle order.
 *
 * @param geometry Indexed geometry.
 * @param order New-order list of original triangle indices.
 */
function reorderIndexedTriangles(geometry: THREE.BufferGeometry, order: number[]): void {
  const index = geometry.getIndex();
  if (!index) return;
  const source = Array.from(index.array as ArrayLike<number>);
  const next = new Array<number>(source.length);
  for (let newTriangle = 0; newTriangle < order.length; newTriangle++) {
    const oldTriangle = order[newTriangle];
    const dst = newTriangle * 3;
    const src = oldTriangle * 3;
    next[dst] = source[src];
    next[dst + 1] = source[src + 1];
    next[dst + 2] = source[src + 2];
  }
  geometry.setIndex(next);
}

/**
 * Reorders non-indexed attribute buffers by triangle order.
 *
 * @param geometry Non-indexed geometry.
 * @param order New-order list of original triangle indices.
 */
function reorderNonIndexedTriangles(geometry: THREE.BufferGeometry, order: number[]): void {
  const names = Object.keys(geometry.attributes);
  names.forEach((name) => {
    const attribute = geometry.getAttribute(name);
    if (!attribute || attribute.isInterleavedBufferAttribute) return;
    geometry.setAttribute(name, reorderAttributeByTriangles(attribute, order));
  });
}

/**
 * Builds a reordered copy of a buffer attribute for triangle permutation.
 *
 * @param attribute Source attribute.
 * @param order New-order list of original triangle indices.
 * @returns New buffer attribute with reordered vertex triples.
 */
function reorderAttributeByTriangles(
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  order: number[],
): THREE.BufferAttribute {
  const itemSize = attribute.itemSize;
  const source = attribute.array as ArrayLike<number>;
  const next = new Float32Array(source.length);
  for (let newTriangle = 0; newTriangle < order.length; newTriangle++) {
    copyTriangleAttribute(source, next, order[newTriangle], newTriangle, itemSize);
  }
  const rebuilt = new THREE.BufferAttribute(next, itemSize);
  rebuilt.normalized = attribute.normalized;
  return rebuilt;
}

/**
 * Copies one triangle's attribute components from old to new index.
 *
 * @param source Source attribute array.
 * @param destination Destination attribute array.
 * @param oldTriangle Original triangle index.
 * @param newTriangle Destination triangle index.
 * @param itemSize Components per vertex.
 */
function copyTriangleAttribute(
  source: ArrayLike<number>,
  destination: Float32Array,
  oldTriangle: number,
  newTriangle: number,
  itemSize: number,
): void {
  const dstVertex = newTriangle * 3;
  const srcVertex = oldTriangle * 3;
  for (let corner = 0; corner < 3; corner++) {
    const dst = (dstVertex + corner) * itemSize;
    const src = (srcVertex + corner) * itemSize;
    for (let component = 0; component < itemSize; component++) {
      destination[dst + component] = source[src + component];
    }
  }
}

/**
 * Remaps stored face texture map triangle indices after geometry reorder.
 *
 * @param mesh Mesh owning face texture maps.
 * @param order New-order list of original triangle indices.
 */
function remapFaceTextureMaps(mesh: THREE.Mesh, order: number[]): void {
  const oldToNew = buildOldToNewMap(order);
  const entries = getFaceTextureMaps(mesh);
  if (entries.length === 0) return;
  const remapped = entries.map((entry) => ({
    triangleIndices: entry.triangleIndices
      .map((oldIndex) => oldToNew[oldIndex])
      .filter((index) => index !== undefined)
      .sort((a, b) => a - b),
    mapping: entry.mapping,
  }));
  setFaceTextureMaps(mesh, remapped);
}

/**
 * Remaps solid-model triangle source table after geometry reorder.
 *
 * @param mesh Mesh that may store solidTriangleSources.
 * @param order New-order list of original triangle indices.
 */
function remapTriangleSources(mesh: THREE.Mesh, order: number[]): void {
  const sources = mesh.userData[TRIANGLE_SOURCES_USERDATA_KEY];
  if (!Array.isArray(sources) || sources.length === 0) return;
  mesh.userData[TRIANGLE_SOURCES_USERDATA_KEY] = order.map((oldIndex) => sources[oldIndex]);
}

/**
 * Builds old-triangle-index → new-triangle-index lookup.
 *
 * @param order New-order list of original triangle indices.
 * @returns Lookup table.
 */
function buildOldToNewMap(order: number[]): number[] {
  const oldToNew = new Array<number>(order.length);
  for (let newIndex = 0; newIndex < order.length; newIndex++) {
    oldToNew[order[newIndex]] = newIndex;
  }
  return oldToNew;
}

/**
 * Writes one contiguous geometry group per material slot.
 *
 * @param geometry Mesh geometry.
 * @param sortedPerTriangle Texture ids after material sorting.
 * @param materialSlots Ordered unique texture ids.
 */
function applyMergedGeometryGroups(
  geometry: THREE.BufferGeometry,
  sortedPerTriangle: string[],
  materialSlots: string[],
): void {
  geometry.clearGroups();
  const slotIndex = new Map<string, number>();
  materialSlots.forEach((id, index) => slotIndex.set(id, index));
  let runStartTriangle = 0;
  while (runStartTriangle < sortedPerTriangle.length) {
    const materialIndex = slotIndex.get(sortedPerTriangle[runStartTriangle]) ?? 0;
    let runEndTriangle = runStartTriangle + 1;
    while (
      runEndTriangle < sortedPerTriangle.length &&
      (slotIndex.get(sortedPerTriangle[runEndTriangle]) ?? 0) === materialIndex
    ) {
      runEndTriangle += 1;
    }
    geometry.addGroup(runStartTriangle * 3, (runEndTriangle - runStartTriangle) * 3, materialIndex);
    runStartTriangle = runEndTriangle;
  }
}

/**
 * Creates one surface material with the given map. Front-face culling keeps
 * large solid maps cheap to fill.
 *
 * @param color Hex tint.
 * @param map Diffuse map texture.
 * @returns MeshStandardMaterial.
 */
function createSurfaceMaterial(color: number, map: THREE.Texture): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    map,
    metalness: CONTENT_METALNESS,
    roughness: CONTENT_ROUGHNESS,
    flatShading: true,
    side: THREE.FrontSide,
  });
}

/**
 * Reads the first material color from a mesh.
 *
 * @param mesh Mesh to inspect.
 * @returns Hex color.
 */
function extractMeshColor(mesh: THREE.Mesh): number {
  const material = mesh.material;
  const first = Array.isArray(material) ? material[0] : material;
  if (first && 'color' in first) {
    const color = (first as THREE.MeshStandardMaterial).color;
    if (color) return color.getHex();
  }
  return 0xffffff;
}

/**
 * Disposes previous mesh materials without disposing shared texture maps. Maps
 * are detached first so TextureMapCache / checker stay alive for peers.
 *
 * @param mesh Mesh whose materials will be replaced.
 */
function disposeOwnedMaterials(mesh: THREE.Mesh): void {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  materials.forEach((material) => {
    if (!material) return;
    detachSharedMaps(material);
    material.dispose();
  });
}

/**
 * Clears map slots so Material.dispose cannot free shared textures.
 *
 * @param material Material about to be disposed.
 */
function detachSharedMaps(material: THREE.Material): void {
  const standard = material as THREE.MeshStandardMaterial;
  if ('map' in standard) standard.map = null;
  if ('lightMap' in standard) standard.lightMap = null;
  if ('aoMap' in standard) standard.aoMap = null;
  if ('emissiveMap' in standard) standard.emissiveMap = null;
  if ('bumpMap' in standard) standard.bumpMap = null;
  if ('normalMap' in standard) standard.normalMap = null;
  if ('displacementMap' in standard) standard.displacementMap = null;
  if ('roughnessMap' in standard) standard.roughnessMap = null;
  if ('metalnessMap' in standard) standard.metalnessMap = null;
  if ('alphaMap' in standard) standard.alphaMap = null;
  if ('envMap' in standard) standard.envMap = null;
}

/**
 * Returns a default mapping using the paint state's last texture when provided.
 *
 * @param textureId Optional texture id override.
 * @returns New FaceTextureMapping.
 */
export function createMappingWithTextureId(textureId: string): FaceTextureMapping {
  const mapping = createDefaultFaceTextureMapping();
  mapping.textureId = textureId;
  return mapping;
}

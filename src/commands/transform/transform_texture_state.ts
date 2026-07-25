import * as THREE from 'three';
import { FaceTextureMapEntry, cloneFaceTextureMapEntry } from '../../texture/uv/face_texture_mapping.js';
import { getFaceTextureMaps, setFaceTextureMaps } from '../../texture/uv/face_texture_storage.js';
import { SolidModel } from '../../solid/model/solid_model.js';
import { SolidBrushVisual } from '../../solid/model/solid_brush_visual.js';
import { isContentMeshEligibleForTextureLockRebake } from '../../texture/lock/texture_lock_settings.js';
import type { FaceSurfaceDescriptionSerialized } from '../../texture/uv_matrix/face_surface_description.js';

/** Solid brush face surface state captured for transform undo/redo. */
export interface SolidBrushTransformTextureSnapshot {
  kind: 'solid';
  mesh: THREE.Mesh;
  brushId: string;
  defaultSurface: FaceSurfaceDescriptionSerialized;
  faceSurfaces: (FaceSurfaceDescriptionSerialized | undefined)[];
  /** Legacy planar mappings (optional; restored when surfaces absent). */
  defaultMapping?: unknown;
  faceMappings?: unknown[];
}

/** Content-mesh UV state captured for transform undo/redo. */
export interface ContentMeshTransformTextureSnapshot {
  kind: 'content';
  mesh: THREE.Mesh;
  maps: FaceTextureMapEntry[];
  uvArray: Float32Array | null;
}

/** Texture state for one mesh involved in a transform. */
export type TransformTextureSnapshot = SolidBrushTransformTextureSnapshot | ContentMeshTransformTextureSnapshot;

/**
 * Captures solid-brush mappings and content-mesh UVs for the given meshes so
 * position/stretch lock side-effects can be undone with the pose.
 *
 * @param meshes Meshes that are part of the transform.
 * @returns Snapshots for solid brushes and content meshes only.
 */
export function captureTransformTextureState(meshes: readonly THREE.Mesh[]): TransformTextureSnapshot[] {
  const snapshots: TransformTextureSnapshot[] = [];
  for (const mesh of meshes) {
    const solid = captureSolidBrushTexture(mesh);
    if (solid) {
      snapshots.push(solid);
      continue;
    }
    const content = captureContentMeshTexture(mesh);
    if (content) snapshots.push(content);
  }
  return snapshots;
}

/**
 * Restores previously captured texture state onto solid brushes and content
 * meshes. Does not remesh solids; the caller/history refresh does that.
 *
 * @param snapshots Snapshots from captureTransformTextureState.
 */
export function restoreTransformTextureState(snapshots: readonly TransformTextureSnapshot[]): void {
  for (const snapshot of snapshots) {
    if (snapshot.kind === 'solid') {
      restoreSolidBrushTexture(snapshot);
      continue;
    }
    restoreContentMeshTexture(snapshot);
  }
}

/**
 * Captures UV mappings for a solid brush preview mesh.
 *
 * @param mesh Candidate mesh.
 * @returns Snapshot or null when not a solid brush.
 */
function captureSolidBrushTexture(mesh: THREE.Mesh): SolidBrushTransformTextureSnapshot | null {
  if (!SolidBrushVisual.isBrushObject(mesh)) return null;
  const model = SolidModel.fromObject(mesh);
  if (!model) return null;
  const brush = model.findBrushByMesh(mesh);
  if (!brush) return null;
  return {
    kind: 'solid',
    mesh,
    brushId: brush.id,
    defaultSurface: brush.serializeDefaultSurface(),
    faceSurfaces: brush.serializeFaceSurfaces(),
  };
}

/**
 * Captures face maps and UV attributes for an ordinary content mesh.
 *
 * @param mesh Candidate mesh.
 * @returns Snapshot or null when not a content mesh.
 */
function captureContentMeshTexture(mesh: THREE.Mesh): ContentMeshTransformTextureSnapshot | null {
  if (!isContentMeshEligibleForTextureLockRebake(mesh)) return null;
  if (!mesh.geometry) return null;
  const maps = getFaceTextureMaps(mesh).map((entry) => cloneFaceTextureMapEntry(entry));
  const uv = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute | null;
  const uvArray = uv ? new Float32Array(uv.array as ArrayLike<number>) : null;
  return { kind: 'content', mesh, maps, uvArray };
}

/**
 * Restores solid brush face mappings from a snapshot.
 *
 * @param snapshot Solid brush texture snapshot.
 */
function restoreSolidBrushTexture(snapshot: SolidBrushTransformTextureSnapshot): void {
  const model = SolidModel.fromObject(snapshot.mesh);
  if (!model) return;
  const brush = model.findBrush(snapshot.brushId) ?? model.findBrushByMesh(snapshot.mesh);
  if (!brush) return;
  if (snapshot.defaultSurface || snapshot.faceSurfaces) {
    brush.restoreFaceSurfaces(snapshot.defaultSurface, snapshot.faceSurfaces);
  }
}

/**
 * Restores content-mesh maps and UV attributes from a snapshot.
 *
 * @param snapshot Content mesh texture snapshot.
 */
function restoreContentMeshTexture(snapshot: ContentMeshTransformTextureSnapshot): void {
  setFaceTextureMaps(snapshot.mesh, snapshot.maps);
  if (!snapshot.uvArray) return;
  const uv = snapshot.mesh.geometry.getAttribute('uv') as THREE.BufferAttribute | null;
  if (uv && uv.array.length === snapshot.uvArray.length) {
    (uv.array as Float32Array).set(snapshot.uvArray);
    uv.needsUpdate = true;
    return;
  }
  snapshot.mesh.geometry.setAttribute('uv', new THREE.BufferAttribute(snapshot.uvArray.slice(), 2));
}

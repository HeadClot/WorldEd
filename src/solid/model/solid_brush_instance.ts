import * as THREE from 'three';
import { SolidBrush } from '../brush/solid_brush.js';
import { SolidOperation } from '../types/solid_operation.js';
import { SolidPlane } from '../brush/solid_plane.js';
import { SolidBrushVisual } from './solid_brush_visual.js';
import { DEFAULT_CHECKER_TEXTURE_ID } from '../../texture/library/texture_id.js';
import { FaceTextureMapping } from '../../texture/uv/face_texture_mapping.js';
import {
  FaceSurfaceDescription,
  FaceSurfaceDescriptionSerialized,
  cloneFaceSurface,
  createDefaultFaceSurface,
  deserializeFaceSurface,
  serializeFaceSurface,
} from '../../texture/uv_matrix/face_surface_description.js';
import {
  faceTextureMappingToSurface,
  surfaceToFaceTextureMapping,
} from '../../texture/uv_matrix/legacy_mapping_migrate.js';
import { SurfaceUvMatrix } from '../../texture/uv_matrix/surface_uv_matrix.js';

/**
 * A brush placed inside a solid model with local transform and CSG operation.
 * Surface texture and UV matrix are authored per brush face in brush-local
 * space and baked into the compiled result mesh on rebuild.
 */
export class SolidBrushInstance {
  readonly id: string;
  name: string;
  operation: SolidOperation;
  brush: SolidBrush;
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
  visible: boolean;
  mesh: THREE.Mesh | null;
  /** Default surface for faces without a per-face override. */
  private defaultSurface: FaceSurfaceDescription;
  /** Sparse per-face surface overrides (index matches brush.faces). */
  private faceSurfaces: (FaceSurfaceDescription | undefined)[];

  /**
   * Creates a solid brush instance.
   *
   * @param id Stable unique identifier.
   * @param name Display name.
   * @param brush Local convex brush geometry.
   * @param operation CSG operation for this brush.
   */
  constructor(id: string, name: string, brush: SolidBrush, operation: SolidOperation = SolidOperation.Additive) {
    this.id = id;
    this.name = name;
    this.brush = brush;
    this.operation = operation;
    this.position = new THREE.Vector3();
    this.rotation = new THREE.Euler(0, 0, 0, 'XYZ');
    this.scale = new THREE.Vector3(1, 1, 1);
    this.visible = true;
    this.mesh = null;
    this.defaultSurface = createDefaultFaceSurface(DEFAULT_CHECKER_TEXTURE_ID);
    this.faceSurfaces = [];
  }

  /**
   * Default surface texture identity for faces without overrides.
   *
   * @returns Texture id string.
   */
  get surfaceTextureId(): string {
    return this.defaultSurface.textureId;
  }

  /**
   * Sets the default surface texture identity (does not clear face overrides).
   *
   * @param textureId Texture identity.
   */
  set surfaceTextureId(textureId: string) {
    this.defaultSurface.textureId = textureId || DEFAULT_CHECKER_TEXTURE_ID;
  }

  /**
   * Returns the authored face surface (texture + UV matrix) for a brush face.
   *
   * @param surfaceIndex Brush face index.
   * @returns Cloned face surface description.
   */
  getFaceSurface(surfaceIndex: number): FaceSurfaceDescription {
    const override = this.faceSurfaces[surfaceIndex];
    if (override) return cloneFaceSurface(override);
    return this.buildDefaultFaceSurface(surfaceIndex);
  }

  /**
   * Sets the full face surface for one brush face.
   *
   * @param surfaceIndex Brush face index.
   * @param surface Surface to store (cloned).
   */
  setFaceSurface(surfaceIndex: number, surface: FaceSurfaceDescription): void {
    if (surfaceIndex < 0) return;
    this.faceSurfaces[surfaceIndex] = cloneFaceSurface(surface);
  }

  /**
   * Returns the full UV/texture mapping for a brush face (texture + UV matrix).
   *
   * @param surfaceIndex Brush face index.
   * @returns Cloned face texture mapping.
   */
  getSurfaceMapping(surfaceIndex: number): FaceTextureMapping {
    const surface = this.getFaceSurface(surfaceIndex);
    return surfaceToFaceTextureMapping(surface, this.faceNormalLocal(surfaceIndex));
  }

  /**
   * Returns the texture id for a brush face (per-face override or default).
   *
   * @param surfaceIndex Brush face index.
   * @returns Texture identity string.
   */
  getSurfaceTextureId(surfaceIndex: number): string {
    return this.getFaceSurface(surfaceIndex).textureId;
  }

  /**
   * Sets one brush face texture, preserving existing UV matrix.
   *
   * @param surfaceIndex Brush face index.
   * @param textureId Texture identity.
   */
  setFaceTextureId(surfaceIndex: number, textureId: string): void {
    if (surfaceIndex < 0) return;
    const surface = this.getFaceSurface(surfaceIndex);
    surface.textureId = textureId || DEFAULT_CHECKER_TEXTURE_ID;
    this.faceSurfaces[surfaceIndex] = surface;
  }

  /**
   * Sets the full UV/texture mapping for one brush face (stores UV matrix).
   *
   * @param surfaceIndex Brush face index.
   * @param mapping Mapping to store (cloned).
   */
  setFaceMapping(surfaceIndex: number, mapping: FaceTextureMapping): void {
    if (surfaceIndex < 0) return;
    this.faceSurfaces[surfaceIndex] = faceTextureMappingToSurface(mapping, this.faceNormalLocal(surfaceIndex));
  }

  /**
   * Sets the default texture for all faces and clears per-face overrides. UV
   * matrices reset to identity with the new texture id.
   *
   * @param textureId Texture identity.
   */
  setAllFacesTextureId(textureId: string): void {
    this.defaultSurface = createDefaultFaceSurface(textureId || DEFAULT_CHECKER_TEXTURE_ID);
    this.faceSurfaces = [];
  }

  /**
   * Sets the default surface texture without clearing per-face overrides.
   *
   * @param textureId Texture identity.
   */
  setSurfaceTextureIdOnly(textureId: string): void {
    this.defaultSurface.textureId = textureId || DEFAULT_CHECKER_TEXTURE_ID;
  }

  /**
   * Serializes per-face texture overrides for legacy persistence.
   *
   * @returns Sparse face texture id list.
   */
  serializeFaceTextureIds(): (string | undefined)[] {
    return this.faceSurfaces.map((surface) => surface?.textureId);
  }

  /**
   * Restores per-face texture overrides from persistence (texture id only).
   *
   * @param ids Sparse face texture id list.
   */
  restoreFaceTextureIds(ids: (string | undefined)[] | undefined): void {
    if (!ids) {
      this.faceSurfaces = [];
      return;
    }
    this.faceSurfaces = ids.map((textureId) => {
      if (typeof textureId !== 'string' || textureId.length === 0) {
        return undefined;
      }
      return createDefaultFaceSurface(textureId);
    });
  }

  /**
   * Serializes full per-face surfaces for scene persistence.
   *
   * @returns Sparse list of serialized face surfaces.
   */
  serializeFaceSurfaces(): (FaceSurfaceDescriptionSerialized | undefined)[] {
    return this.faceSurfaces.map((surface) => (surface ? serializeFaceSurface(surface) : undefined));
  }

  /**
   * Serializes the default surface for scene persistence.
   *
   * @returns Serialized default surface.
   */
  serializeDefaultSurface(): FaceSurfaceDescriptionSerialized {
    return serializeFaceSurface(this.defaultSurface);
  }

  /**
   * Serializes full per-face UV mappings for legacy scene persistence.
   *
   * @returns Sparse list of face mappings.
   */
  serializeFaceMappings(): (FaceTextureMapping | undefined)[] {
    return this.faceSurfaces.map((surface, index) => {
      if (!surface) return undefined;
      return surfaceToFaceTextureMapping(surface, this.faceNormalLocal(index));
    });
  }

  /**
   * Serializes the default surface mapping for legacy scene persistence.
   *
   * @returns Cloned default mapping with UV matrix.
   */
  serializeDefaultMapping(): FaceTextureMapping {
    return surfaceToFaceTextureMapping(this.defaultSurface, new THREE.Vector3(0, 1, 0));
  }

  /**
   * Restores default and per-face UV surfaces from matrix serialization.
   *
   * @param defaultSurface Optional default surface.
   * @param faceSurfaces Optional sparse per-face surfaces.
   */
  restoreFaceSurfaces(
    defaultSurface: FaceSurfaceDescriptionSerialized | FaceSurfaceDescription | undefined,
    faceSurfaces: (FaceSurfaceDescriptionSerialized | FaceSurfaceDescription | undefined)[] | undefined,
  ): void {
    this.defaultSurface = this.coerceSurface(defaultSurface, new THREE.Vector3(0, 1, 0));
    this.faceSurfaces = faceSurfaces
      ? faceSurfaces.map((surface, index) =>
          surface ? this.coerceSurface(surface, this.faceNormalLocal(index)) : undefined,
        )
      : [];
  }

  /**
   * Restores default and per-face UV mappings from legacy planar form.
   *
   * @param defaultMapping Optional default mapping.
   * @param faceMappings Optional sparse per-face mappings.
   */
  restoreFaceMappings(
    defaultMapping: FaceTextureMapping | undefined,
    faceMappings: (FaceTextureMapping | undefined)[] | undefined,
  ): void {
    this.defaultSurface = defaultMapping
      ? faceTextureMappingToSurface(defaultMapping, new THREE.Vector3(0, 1, 0))
      : createDefaultFaceSurface(DEFAULT_CHECKER_TEXTURE_ID);
    if (!this.defaultSurface.textureId) {
      this.defaultSurface.textureId = DEFAULT_CHECKER_TEXTURE_ID;
    }
    this.faceSurfaces = faceMappings
      ? faceMappings.map((mapping, index) =>
          mapping ? faceTextureMappingToSurface(mapping, this.faceNormalLocal(index)) : undefined,
        )
      : [];
  }

  /**
   * Restores prior face texture id list and default texture without full maps.
   *
   * @param defaultTextureId Default surface texture id.
   * @param faceTextureIds Sparse per-face texture ids.
   */
  restoreTextureIdsOnly(defaultTextureId: string, faceTextureIds: (string | undefined)[]): void {
    this.defaultSurface.textureId = defaultTextureId || DEFAULT_CHECKER_TEXTURE_ID;
    this.faceSurfaces = faceTextureIds.map((textureId, index) => {
      if (typeof textureId !== 'string' || textureId.length === 0) {
        return undefined;
      }
      const existing = this.faceSurfaces[index];
      if (existing) {
        const copy = cloneFaceSurface(existing);
        copy.textureId = textureId;
        return copy;
      }
      return createDefaultFaceSurface(textureId);
    });
  }

  /**
   * Attaches a scene preview mesh and stamps brush identity metadata.
   *
   * @param mesh Preview mesh owned by the solid model hierarchy.
   */
  attachMesh(mesh: THREE.Mesh): void {
    this.mesh = mesh;
    mesh.name = this.name;
    SolidBrushVisual.stampBrushHelperMetadata(mesh);
    SolidBrushVisual.setBrushId(mesh, this.id);
    this.pushTransformToMesh();
    SolidBrushVisual.applyOperationStyle(mesh, this.operation);
  }

  /** Copies transform and name from the scene mesh into this instance. */
  pullTransformFromMesh(): void {
    if (!this.mesh) return;
    this.position.copy(this.mesh.position);
    this.rotation.copy(this.mesh.rotation);
    this.scale.copy(this.mesh.scale);
    this.name = this.mesh.name;
    this.visible = this.mesh.visible;
  }

  /** Pushes this instance's transform and name onto the scene mesh. */
  pushTransformToMesh(): void {
    if (!this.mesh) return;
    this.mesh.position.copy(this.position);
    this.mesh.rotation.copy(this.rotation);
    this.mesh.scale.copy(this.scale);
    this.mesh.name = this.name;
    this.mesh.visible = this.visible;
  }

  /**
   * Builds the local-to-model matrix for this instance.
   *
   * @returns Transform matrix.
   */
  getLocalMatrix(): THREE.Matrix4 {
    this.pullTransformFromMesh();
    return new THREE.Matrix4().compose(this.position, new THREE.Quaternion().setFromEuler(this.rotation), this.scale);
  }

  /**
   * Returns a brush with vertices and planes transformed into model space.
   *
   * @returns Transformed brush clone.
   */
  getModelSpaceBrush(): SolidBrush {
    const modelBrush = this.brush.clone();
    modelBrush.transformVertices(this.getLocalMatrix());
    return modelBrush;
  }

  /**
   * Returns model-space planes for this brush.
   *
   * @returns Transformed outward planes.
   */
  getModelSpacePlanes(): SolidPlane[] {
    return this.getModelSpaceBrush().planes;
  }

  /**
   * Axis-aligned bounds of this brush in model space.
   *
   * @returns Bounding box.
   */
  getModelSpaceBounds(): THREE.Box3 {
    return this.getModelSpaceBrush().computeLocalBounds();
  }

  /**
   * Deep-clones this instance with a new id and name (no mesh attachment).
   *
   * @param newId New unique id.
   * @param newName New display name.
   * @returns Cloned instance.
   */
  cloneWithId(newId: string, newName: string): SolidBrushInstance {
    this.pullTransformFromMesh();
    const copy = new SolidBrushInstance(newId, newName, this.brush.clone(), this.operation);
    copy.position.copy(this.position);
    copy.rotation.copy(this.rotation);
    copy.scale.copy(this.scale);
    copy.visible = this.visible;
    copy.restoreFaceSurfaces(this.serializeDefaultSurface(), this.serializeFaceSurfaces());
    return copy;
  }

  /**
   * Returns the brush-local face normal for a surface index.
   *
   * @param surfaceIndex Face index.
   * @returns Unit normal.
   */
  faceNormalLocal(surfaceIndex: number): THREE.Vector3 {
    return this.brush.planes[surfaceIndex]?.normal.clone().normalize() ?? new THREE.Vector3(0, 1, 0);
  }

  /**
   * Returns the brush-local plane offset for a surface index.
   *
   * @param surfaceIndex Face index.
   * @returns Plane offset d.
   */
  facePlaneOffsetLocal(surfaceIndex: number): number {
    return this.brush.planes[surfaceIndex]?.offset ?? 0;
  }

  /**
   * Coerces serialized or live surface data into a FaceSurfaceDescription.
   *
   * @param value Surface, serialized surface, or undefined.
   * @param faceNormal Face normal for legacy migration.
   * @returns Normalized surface.
   */
  /**
   * Builds a default surface for a face: shared texture id with a UV matrix
   * oriented to that face's plane (identity TRS on the face normal).
   *
   * @param surfaceIndex Face index.
   * @returns Default face surface.
   */
  private buildDefaultFaceSurface(surfaceIndex: number): FaceSurfaceDescription {
    const normal = this.faceNormalLocal(surfaceIndex);
    const trs = this.defaultSurface.uv.decompose(new THREE.Vector3(0, 1, 0));
    return {
      textureId: this.defaultSurface.textureId || DEFAULT_CHECKER_TEXTURE_ID,
      uv: SurfaceUvMatrix.fromTrs(trs.translation, normal, trs.rotationDeg, trs.scaleU, trs.scaleV),
    };
  }

  /**
   * Coerces serialized or live surface data into a FaceSurfaceDescription.
   *
   * @param value Surface, serialized surface, or undefined.
   * @param _faceNormal Unused (kept for call-site symmetry).
   * @returns Normalized surface.
   */
  private coerceSurface(
    value: FaceSurfaceDescriptionSerialized | FaceSurfaceDescription | undefined,
    _faceNormal: THREE.Vector3,
  ): FaceSurfaceDescription {
    void _faceNormal;
    if (!value) return createDefaultFaceSurface();
    if (value instanceof Object && 'uv' in value) {
      const record = value as FaceSurfaceDescription | FaceSurfaceDescriptionSerialized;
      if (record.uv instanceof SurfaceUvMatrix) {
        return cloneFaceSurface(record as FaceSurfaceDescription);
      }
      if (record.uv && typeof record.uv === 'object' && 'u' in record.uv) {
        return deserializeFaceSurface(record as FaceSurfaceDescriptionSerialized);
      }
    }
    return createDefaultFaceSurface();
  }
}

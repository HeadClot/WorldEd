import { MeshFaceCornerUvStore } from './mesh_face_corner_uv.js';
import { MeshFaceSurfaceStore } from './mesh_face_surface.js';

/** Face and face-corner attributes owned by a mesh document. */
export class MeshAttributeStore {
  private cornerUvs: MeshFaceCornerUvStore;
  private faceSurfaces: MeshFaceSurfaceStore;

  /**
   * Creates attribute stores for the given topology sizes.
   *
   * @param halfEdgeCount Half-edge / corner count.
   * @param faceCount Face count.
   */
  constructor(halfEdgeCount: number = 0, faceCount: number = 0) {
    this.cornerUvs = new MeshFaceCornerUvStore(halfEdgeCount);
    this.faceSurfaces = new MeshFaceSurfaceStore(faceCount);
  }

  /**
   * Returns the face-corner UV store.
   *
   * @returns Corner UV store.
   */
  getCornerUvs(): MeshFaceCornerUvStore {
    return this.cornerUvs;
  }

  /**
   * Returns the sparse planar face surface store.
   *
   * @returns Face surface store.
   */
  getFaceSurfaces(): MeshFaceSurfaceStore {
    return this.faceSurfaces;
  }

  /**
   * Ensures both tables match topology sizes.
   *
   * @param halfEdgeCount Half-edge count.
   * @param faceCount Face count.
   */
  ensureTopologySizes(halfEdgeCount: number, faceCount: number): void {
    this.cornerUvs.ensureCornerCount(halfEdgeCount);
    this.faceSurfaces.ensureFaceCount(faceCount);
  }

  /**
   * Replaces the corner UV store.
   *
   * @param cornerUvs New corner UV store.
   */
  setCornerUvs(cornerUvs: MeshFaceCornerUvStore): void {
    this.cornerUvs = cornerUvs;
  }

  /**
   * Replaces the face surface store.
   *
   * @param faceSurfaces New face surface store.
   */
  setFaceSurfaces(faceSurfaces: MeshFaceSurfaceStore): void {
    this.faceSurfaces = faceSurfaces;
  }

  /**
   * Deep-clones corner UVs and face surfaces.
   *
   * @returns Independent attribute store.
   */
  clone(): MeshAttributeStore {
    const copy = new MeshAttributeStore();
    copy.setCornerUvs(this.cornerUvs.clone());
    copy.setFaceSurfaces(this.faceSurfaces.clone());
    return copy;
  }
}

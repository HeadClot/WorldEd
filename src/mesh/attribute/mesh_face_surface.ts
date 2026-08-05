import { SurfaceUvMatrix } from '@/texture/uv_matrix/surface_uv_matrix.js';

/**
 * Optional planar surface description for one mesh face (mesh-local UV matrix).
 * Absent on organic faces that use only corner UVs.
 */
export interface MeshFaceSurface {
  /** Texture identity. */
  textureId: string;
  /** Mesh-local planar UV projection matrix. */
  uv: SurfaceUvMatrix;
}

/** Sparse per-face planar surface table. Missing entries mean corner UVs only. */
export class MeshFaceSurfaceStore {
  private surfaces: (MeshFaceSurface | undefined)[];

  /**
   * Creates a surface store for a face count.
   *
   * @param faceCount Number of faces.
   */
  constructor(faceCount: number = 0) {
    this.surfaces = new Array(Math.max(0, faceCount));
  }

  /**
   * Ensures capacity for at least the given face count.
   *
   * @param faceCount Required face count.
   */
  ensureFaceCount(faceCount: number): void {
    while (this.surfaces.length < faceCount) {
      this.surfaces.push(undefined);
    }
  }

  /**
   * Returns the planar surface for a face, if any.
   *
   * @param faceIndex Face index.
   * @returns Surface or undefined.
   */
  get(faceIndex: number): MeshFaceSurface | undefined {
    return this.surfaces[faceIndex];
  }

  /**
   * Sets or clears the planar surface for a face.
   *
   * @param faceIndex Face index.
   * @param surface Surface to store, or undefined to clear.
   */
  set(faceIndex: number, surface: MeshFaceSurface | undefined): void {
    this.ensureFaceCount(faceIndex + 1);
    this.surfaces[faceIndex] = surface;
  }

  /**
   * Returns the number of slots in the sparse table.
   *
   * @returns Slot count.
   */
  getSlotCount(): number {
    return this.surfaces.length;
  }

  /**
   * Deep-clones surfaces including UV matrices.
   *
   * @returns Independent copy.
   */
  clone(): MeshFaceSurfaceStore {
    const copy = new MeshFaceSurfaceStore(this.surfaces.length);
    for (let index = 0; index < this.surfaces.length; index++) {
      const surface = this.surfaces[index];
      if (!surface) {
        continue;
      }
      copy.set(index, {
        textureId: surface.textureId,
        uv: surface.uv.clone(),
      });
    }
    return copy;
  }
}

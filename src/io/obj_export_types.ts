/**
 * Wavefront OBJ export package: geometry text, material library text, and any
 * diffuse map image files referenced by map_Kd.
 */

/** One image file written next to the .obj / .mtl pair. */
export interface ObjExportTextureFile {
  /** Relative file name referenced from the MTL (no directories). */
  fileName: string;
  /** Encoded image bytes (typically PNG). */
  blob: Blob;
}

/** Complete Wavefront export result ready for multi-file save. */
export interface ObjExportPackage {
  /** Suggested primary .obj file name. */
  objFileName: string;
  /** Wavefront OBJ source text including mtllib and usemtl lines. */
  objText: string;
  /** Suggested companion .mtl file name. */
  mtlFileName: string;
  /** Wavefront MTL source text. */
  mtlText: string;
  /** Diffuse maps referenced by the MTL. */
  textures: ObjExportTextureFile[];
}

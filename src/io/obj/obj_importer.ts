import * as THREE from 'three';
import { ObjParser } from './obj_parser.js';
import { ObjMeshBuilder } from './obj_mesh_builder.js';

/** Result of importing a Wavefront OBJ document. */
export interface ObjImportResult {
  /** Content meshes built from named objects. */
  meshes: THREE.Mesh[];
  /** Number of mesh objects successfully built. */
  importedObjectCount: number;
  /** Number of face polygons consumed across all objects. */
  importedFaceCount: number;
  /**
   * Source file name (may include path). Used when multi-mesh imports are
   * wrapped in a group named after the file stem.
   */
  sourceFileName: string;
}

/**
 * Imports Wavefront OBJ geometry as regular content meshes through the mesh
 * document pipeline.
 */
export class ObjImporter {
  private readonly parser = new ObjParser();
  private readonly meshBuilder = new ObjMeshBuilder();

  /**
   * Parses OBJ text and builds content meshes.
   *
   * @param source OBJ file contents.
   * @param sourceFileName Optional source path/name for multi-mesh grouping.
   * @returns Import result with meshes and counts.
   */
  importFromText(source: string, sourceFileName: string = ''): ObjImportResult {
    const parsed = this.parser.parse(source);
    const meshes = this.meshBuilder.buildMeshes(parsed);
    let faceCount = 0;
    for (const object of parsed.objects) {
      faceCount += object.faces.length;
    }
    return {
      meshes,
      importedObjectCount: meshes.length,
      importedFaceCount: faceCount,
      sourceFileName,
    };
  }
}

/**
 * Builds the base group name for a multi-mesh OBJ import from a file path.
 *
 * @param filename Source file name, possibly with path and extension.
 * @returns File stem, or {@code Imported OBJ} when empty.
 */
export function buildObjImportGroupBaseName(filename: string): string {
  const base = filename
    .replace(/^.*[\\/]/, '')
    .replace(/\.obj$/i, '')
    .trim();
  return base.length > 0 ? base : 'Imported OBJ';
}

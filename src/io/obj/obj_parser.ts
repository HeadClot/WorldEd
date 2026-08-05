import type {
  ObjParseResult,
  ObjParsedCorner,
  ObjParsedFace,
  ObjParsedObject,
  ObjParsedPosition,
  ObjParsedTexCoord,
} from './obj_parse_types.js';

/**
 * Parses Wavefront OBJ text into positions, texcoords, and named objects with
 * face loops. Supports relative indices and polygon faces of three or more
 * corners. Ignores free-form curves, smoothing groups, and material files.
 */
export class ObjParser {
  /**
   * Parses a complete OBJ document string.
   *
   * @param source OBJ file text.
   * @returns Parsed geometry data.
   */
  parse(source: string): ObjParseResult {
    const positions: ObjParsedPosition[] = [];
    const texCoords: ObjParsedTexCoord[] = [];
    const objects: ObjParsedObject[] = [];
    let current = this.createObject('Object');
    let materialName = 'default';
    for (const rawLine of source.split(/\r?\n/)) {
      const line = stripComment(rawLine).trim();
      if (line.length === 0) {
        continue;
      }
      const result = this.consumeLine(line, positions, texCoords, current, materialName, objects);
      current = result.current;
      materialName = result.materialName;
    }
    this.flushObject(current, objects);
    return { positions, texCoords, objects };
  }

  /**
   * Dispatches one non-empty OBJ line.
   *
   * @param line Line without comments.
   * @param positions Position list.
   * @param texCoords Texcoord list.
   * @param current Current object being filled.
   * @param materialName Active usemtl name.
   * @param objects Completed objects.
   * @returns Updated current object and material name.
   */
  private consumeLine(
    line: string,
    positions: ObjParsedPosition[],
    texCoords: ObjParsedTexCoord[],
    current: ObjParsedObject,
    materialName: string,
    objects: ObjParsedObject[],
  ): { current: ObjParsedObject; materialName: string } {
    if (line.startsWith('v ')) {
      this.appendPosition(line, positions);
      return { current, materialName };
    }
    if (line.startsWith('vt ')) {
      this.appendTexCoord(line, texCoords);
      return { current, materialName };
    }
    if (line.startsWith('vn ')) {
      return { current, materialName };
    }
    if (line.startsWith('f ')) {
      this.appendFace(line, positions.length, texCoords.length, materialName, current);
      return { current, materialName };
    }
    if (line.startsWith('o ') || line.startsWith('g ')) {
      return { current: this.beginNamedObject(line, current, objects), materialName };
    }
    if (line.startsWith('usemtl ')) {
      return { current, materialName: line.slice(7).trim() || 'default' };
    }
    return { current, materialName };
  }

  /**
   * Appends a vertex position from a `v` line.
   *
   * @param line Source line.
   * @param positions Output list.
   */
  private appendPosition(line: string, positions: ObjParsedPosition[]): void {
    const parts = line.split(/\s+/);
    const x = Number(parts[1]);
    const y = Number(parts[2]);
    const z = Number(parts[3]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return;
    }
    positions.push({ x, y, z });
  }

  /**
   * Appends a texture coordinate from a `vt` line.
   *
   * @param line Source line.
   * @param texCoords Output list.
   */
  private appendTexCoord(line: string, texCoords: ObjParsedTexCoord[]): void {
    const parts = line.split(/\s+/);
    const u = Number(parts[1]);
    const v = Number(parts[2] ?? 0);
    if (!Number.isFinite(u) || !Number.isFinite(v)) {
      return;
    }
    texCoords.push({ u, v });
  }

  /**
   * Appends a face from an `f` line when it has at least three corners.
   *
   * @param line Source line.
   * @param positionCount Positions parsed so far.
   * @param texCoordCount Texcoords parsed so far.
   * @param materialName Active material.
   * @param current Object receiving the face.
   */
  private appendFace(
    line: string,
    positionCount: number,
    texCoordCount: number,
    materialName: string,
    current: ObjParsedObject,
  ): void {
    const tokens = line.split(/\s+/).slice(1);
    const corners: ObjParsedCorner[] = [];
    for (const token of tokens) {
      if (token.length === 0) {
        continue;
      }
      const corner = parseCornerToken(token, positionCount, texCoordCount);
      if (!corner) {
        return;
      }
      corners.push(corner);
    }
    if (corners.length < 3) {
      return;
    }
    const face: ObjParsedFace = { corners, materialName };
    current.faces.push(face);
  }

  /**
   * Starts a new named object after flushing the previous one when it has
   * faces.
   *
   * @param line `o` or `g` line.
   * @param current Current object.
   * @param objects Completed objects.
   * @returns New current object.
   */
  private beginNamedObject(line: string, current: ObjParsedObject, objects: ObjParsedObject[]): ObjParsedObject {
    this.flushObject(current, objects);
    const name = line.slice(2).trim() || 'Object';
    return this.createObject(name);
  }

  /**
   * Pushes a non-empty object into the completed list.
   *
   * @param current Object to flush.
   * @param objects Output list.
   */
  private flushObject(current: ObjParsedObject, objects: ObjParsedObject[]): void {
    if (current.faces.length === 0) {
      return;
    }
    objects.push(current);
  }

  /**
   * Creates an empty named object container.
   *
   * @param name Object name.
   * @returns Empty object.
   */
  private createObject(name: string): ObjParsedObject {
    return { name, faces: [] };
  }
}

/**
 * Removes an inline comment starting with `#`.
 *
 * @param line Source line.
 * @returns Line without comment.
 */
function stripComment(line: string): string {
  const hash = line.indexOf('#');
  if (hash < 0) {
    return line;
  }
  return line.slice(0, hash);
}

/**
 * Parses one face-corner token into resolved 0-based indices.
 *
 * @param token Face corner token (`v`, `v/vt`, `v//vn`, or `v/vt/vn`).
 * @param positionCount Positions available for relative indices.
 * @param texCoordCount Texcoords available for relative indices.
 * @returns Corner, or null when the position index is invalid.
 */
function parseCornerToken(token: string, positionCount: number, texCoordCount: number): ObjParsedCorner | null {
  const parts = token.split('/');
  const positionIndex = resolveObjIndex(Number(parts[0]), positionCount);
  if (positionIndex < 0) {
    return null;
  }
  const texRaw = parts.length > 1 && parts[1] !== '' ? Number(parts[1]) : NaN;
  const texCoordIndex = Number.isFinite(texRaw) ? resolveObjIndex(texRaw, texCoordCount) : -1;
  const normalRaw = parts.length > 2 && parts[2] !== '' ? Number(parts[2]) : NaN;
  const normalIndex = Number.isFinite(normalRaw) ? resolveObjIndex(normalRaw, 1) : -1;
  return { positionIndex, texCoordIndex, normalIndex };
}

/**
 * Converts a 1-based or relative OBJ index into a 0-based index.
 *
 * @param index Raw index from the file.
 * @param count Elements available when the index was written.
 * @returns Zero-based index, or -1 when out of range.
 */
function resolveObjIndex(index: number, count: number): number {
  if (!Number.isFinite(index) || index === 0) {
    return -1;
  }
  const resolved = index < 0 ? count + index : index - 1;
  if (resolved < 0 || resolved >= count) {
    return -1;
  }
  return resolved;
}

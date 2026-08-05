/** Intermediate structures produced by the Wavefront OBJ text parser. */

/** One vertex position from a `v` line. */
export interface ObjParsedPosition {
  x: number;
  y: number;
  z: number;
}

/** One texture coordinate from a `vt` line. */
export interface ObjParsedTexCoord {
  u: number;
  v: number;
}

/** One face-corner index triple (0-based after resolve; -1 when absent). */
export interface ObjParsedCorner {
  positionIndex: number;
  texCoordIndex: number;
  normalIndex: number;
}

/** One polygon face as an ordered corner loop. */
export interface ObjParsedFace {
  corners: ObjParsedCorner[];
  materialName: string;
}

/** One named object (or group) collected from `o` / `g` sections. */
export interface ObjParsedObject {
  name: string;
  faces: ObjParsedFace[];
}

/** Full parse result for an OBJ document. */
export interface ObjParseResult {
  positions: ObjParsedPosition[];
  texCoords: ObjParsedTexCoord[];
  objects: ObjParsedObject[];
}

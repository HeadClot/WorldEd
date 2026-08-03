/**
 * Numeric tolerances for solid CSG classification and vertex welding. Fat-plane
 * values match Chisel CSGConstants; vertex welding matches HashedVertices.
 */
export const SOLID_FAT_PLANE_EPSILON = 0.0006;
export const SOLID_EDGE_EPSILON = 0.0006;
/** Chisel kVertexEqualEpsilon: base 0.005 scaled by 2.5 → 0.0125. */
export const SOLID_VERTEX_EQUAL_EPSILON = 0.005 * 2.5;
export const SOLID_SQR_VERTEX_EQUAL_EPSILON = SOLID_VERTEX_EQUAL_EPSILON * SOLID_VERTEX_EQUAL_EPSILON;
/** Chisel HashedVertices.kCellSize: kVertexEqualEpsilon * 2.5. */
export const SOLID_VERTEX_HASH_CELL_SIZE = SOLID_VERTEX_EQUAL_EPSILON * 2.5;
export const SOLID_NORMAL_ALIGN_EPSILON = 0.9999;
export const SOLID_PLANE_D_ALIGN_EPSILON = 0.0006;
export const SOLID_BOUNDS_EPSILON = 0.0006;
/**
 * Tight straddle threshold for detecting whether a peer plane cuts a face. Must
 * stay much smaller than SOLID_FAT_PLANE_EPSILON so cut collection is not
 * blocked by the fat membership band used when clipping.
 */
export const SOLID_PLANE_CUT_EPSILON = 1e-5;

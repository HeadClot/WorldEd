/**
 * Packs signed 3D grid cell coordinates into a bigint Map key. Avoids string
 * allocation while staying exact for editor-scale grid indices (bigint has no
 * float mantissa collision risk unlike number packing past 2^53).
 */

/** Bias applied so negative cell indices pack into non-negative ranges. */
const CELL_COORD_BIAS = 1 << 20;

/**
 * Packs a cell coordinate triple into one Map key.
 *
 * @param cellX Grid cell X.
 * @param cellY Grid cell Y.
 * @param cellZ Grid cell Z.
 * @returns Exact bigint key suitable for Map storage.
 */
export function packSpatialCellKey(cellX: number, cellY: number, cellZ: number): bigint {
  const x = BigInt(cellX + CELL_COORD_BIAS);
  const y = BigInt(cellY + CELL_COORD_BIAS);
  const z = BigInt(cellZ + CELL_COORD_BIAS);
  return (x << 42n) | (y << 21n) | z;
}

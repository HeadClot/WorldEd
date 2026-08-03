import type { SolidAlgorithmCategoryRoutingRow } from './solid_algorithm_category_routing_row.js';

/**
 * One Chisel RoutingLookup segment: rows for a single hierarchy brush node
 * inside a RoutingTable.
 */
export class SolidAlgorithmRoutingLookup {
  readonly startIndex: number;
  readonly endIndex: number;

  /**
   * Creates a routing lookup segment.
   *
   * @param startIndex Inclusive first routing-row index.
   * @param endIndex Exclusive end routing-row index.
   */
  constructor(startIndex: number, endIndex: number) {
    this.startIndex = startIndex;
    this.endIndex = endIndex;
  }

  /**
   * Looks up the routing row for an input state inside this segment. Chisel
   * TryGetRoute returns false on miss; callers keep the current category.
   *
   * @param routingRows Full table row array.
   * @param inputIndex Current interior category / row index.
   * @returns Routing row when present, otherwise null (miss).
   */
  tryGetRoute(
    routingRows: readonly SolidAlgorithmCategoryRoutingRow[],
    inputIndex: number,
  ): SolidAlgorithmCategoryRoutingRow | null {
    const tableIndex = this.startIndex + inputIndex;
    if (tableIndex < this.startIndex || tableIndex >= this.endIndex) {
      return null;
    }
    return routingRows[tableIndex] ?? null;
  }
}

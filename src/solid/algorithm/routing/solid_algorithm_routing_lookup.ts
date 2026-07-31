import type { SolidAlgorithmCategoryRoutingRow } from './solid_algorithm_category_routing_row.js';
import { SolidAlgorithmCategoryRoutingRow as CategoryRoutingRow } from './solid_algorithm_category_routing_row.js';

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
   * Looks up the routing row for an input state inside this segment.
   *
   * @param routingRows Full table row array.
   * @param inputIndex Current interior category / row index.
   * @returns Routing row when present, otherwise a constant identity-style row.
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

  /**
   * Builds a fallback row that repeats the input index (Chisel TryGetRoute miss
   * path).
   *
   * @param inputIndex Input state.
   * @returns Constant routing row filled with inputIndex.
   */
  static fallbackRow(inputIndex: number): SolidAlgorithmCategoryRoutingRow {
    const value = inputIndex & 0xff;
    return new CategoryRoutingRow([value, value, value, value, value, value]);
  }
}

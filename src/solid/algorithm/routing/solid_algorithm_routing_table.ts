import { SurfaceCategory } from '@/solid/types/surface_category.js';
import type { SolidAlgorithmCategoryRoutingRow } from './solid_algorithm_category_routing_row.js';
import { SolidAlgorithmRoutingLookup } from './solid_algorithm_routing_lookup.js';

/**
 * Chisel RoutingTable for one processed subject brush: pre-baked category stack
 * rows, per-node lookup segments, and node-id → lookup mapping.
 */
export class SolidAlgorithmRoutingTable {
  readonly routingRows: readonly SolidAlgorithmCategoryRoutingRow[];
  readonly routingLookups: readonly SolidAlgorithmRoutingLookup[];
  readonly preparedIndexPerLookup: readonly number[];
  readonly nodeIdToTableIndex: readonly number[];
  readonly nodeIdOffset: number;
  readonly invertedWorld: boolean;

  /**
   * Creates a routing table.
   *
   * @param routingRows Flat CategoryRoutingRow stack.
   * @param routingLookups Per-brush lookup segments.
   * @param preparedIndexPerLookup Prepared index (or infinite) per lookup.
   * @param nodeIdToTableIndex Map from (nodeId - offset) to lookup index.
   * @param nodeIdOffset Minimum node id used as map base.
   * @param invertedWorld Whether the hierarchy included inverted infinite
   *   solid.
   */
  constructor(
    routingRows: SolidAlgorithmCategoryRoutingRow[],
    routingLookups: SolidAlgorithmRoutingLookup[],
    preparedIndexPerLookup: number[],
    nodeIdToTableIndex: number[],
    nodeIdOffset: number,
    invertedWorld: boolean,
  ) {
    this.routingRows = routingRows;
    this.routingLookups = routingLookups;
    this.preparedIndexPerLookup = preparedIndexPerLookup;
    this.nodeIdToTableIndex = nodeIdToTableIndex;
    this.nodeIdOffset = nodeIdOffset;
    this.invertedWorld = invertedWorld;
  }

  /**
   * Creates an empty routing table (no visible geometry).
   *
   * @param invertedWorld Inverted-world flag.
   * @returns Empty table that always routes to Outside.
   */
  static empty(invertedWorld: boolean): SolidAlgorithmRoutingTable {
    return new SolidAlgorithmRoutingTable([], [], [], [], 0, invertedWorld);
  }

  /**
   * Routes a fragment by walking lookup segments and classifying against each
   * brush (Chisel PerformCSG interiorCategory walk). Starts at input 0 like
   * PerformCSG base polygons. A missing route keeps the current category
   * (Chisel continues the step without updating).
   *
   * @param classify Returns relative category for a prepared brush index.
   * @returns Final surface category.
   */
  route(classify: (preparedIndex: number) => SurfaceCategory): SurfaceCategory {
    if (this.routingLookups.length === 0) {
      return SurfaceCategory.Outside;
    }
    let interiorCategory = 0;
    for (let lookupIndex = 0; lookupIndex < this.routingLookups.length; lookupIndex++) {
      interiorCategory = this.routeOneLookup(lookupIndex, interiorCategory, classify);
    }
    return interiorCategory as SurfaceCategory;
  }

  /**
   * Applies one routing lookup step.
   *
   * @param lookupIndex Lookup segment index.
   * @param interiorCategory Current input state.
   * @param classify Relative category classifier.
   * @returns Next interior category / row index.
   */
  private routeOneLookup(
    lookupIndex: number,
    interiorCategory: number,
    classify: (preparedIndex: number) => SurfaceCategory,
  ): number {
    const lookup = this.routingLookups[lookupIndex]!;
    const row = lookup.tryGetRoute(this.routingRows, interiorCategory);
    if (!row) {
      return interiorCategory;
    }
    const preparedIndex = this.preparedIndexPerLookup[lookupIndex]!;
    const relative = classify(preparedIndex);
    return row.at(relative);
  }

  /**
   * Returns total routing row count (diagnostics / tests).
   *
   * @returns Number of CategoryRoutingRow entries.
   */
  totalRowCount(): number {
    return this.routingRows.length;
  }

  /**
   * Returns brush lookup steps with prepared indices (tests / diagnostics).
   *
   * @returns One entry per routing lookup segment.
   */
  get steps(): readonly { preparedIndex: number }[] {
    return this.preparedIndexPerLookup.map((preparedIndex) => ({ preparedIndex }));
  }
}

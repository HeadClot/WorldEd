import type { SolidAlgorithmCategoryRoutingRow } from './solid_algorithm_category_routing_row.js';

/**
 * One CategoryStackNode: input row index, compact node id, and routing row
 * produced by CreateRoutingTableJob.
 */
export class SolidAlgorithmCategoryStackNode {
  input: number;
  nodeIdValue: number;
  routingRow: SolidAlgorithmCategoryRoutingRow;

  /**
   * Creates a category stack node.
   *
   * @param input Input row index for this stack entry.
   * @param nodeIdValue Compact hierarchy node id for this step.
   * @param routingRow Destination routing row.
   */
  constructor(input: number, nodeIdValue: number, routingRow: SolidAlgorithmCategoryRoutingRow) {
    this.input = input;
    this.nodeIdValue = nodeIdValue;
    this.routingRow = routingRow;
  }

  /**
   * Clones this stack node.
   *
   * @returns Independent copy.
   */
  clone(): SolidAlgorithmCategoryStackNode {
    return new SolidAlgorithmCategoryStackNode(this.input, this.nodeIdValue, this.routingRow);
  }
}

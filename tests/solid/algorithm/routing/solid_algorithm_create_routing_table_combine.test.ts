import { describe, it, expect } from 'vitest';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SurfaceCategory } from '@/solid/types/surface_category.js';
import { SolidAlgorithmCategoryRoutingRow } from '@/solid/algorithm/routing/solid_algorithm_category_routing_row.js';
import { SolidAlgorithmCategoryStackNode } from '@/solid/algorithm/routing/solid_algorithm_category_stack_node.js';
import { SolidAlgorithmCreateRoutingTableCombine } from '@/solid/algorithm/routing/solid_algorithm_create_routing_table_combine.js';

/**
 * Runs Combine on a single left row and a single right row.
 *
 * @param leftRow Left stack routing row.
 * @param rightRow Right stack routing row.
 * @param operation Child operation.
 * @returns Live stack segment after combine.
 */
function combineSingleRows(
  leftRow: SolidAlgorithmCategoryRoutingRow,
  rightRow: SolidAlgorithmCategoryRoutingRow,
  operation: SolidOperation,
): SolidAlgorithmCategoryStackNode[] {
  const leftStack = [new SolidAlgorithmCategoryStackNode(0, 10, leftRow)];
  const leftStackEnd = { value: 1 };
  const rightStack = [new SolidAlgorithmCategoryStackNode(0, 20, rightRow)];
  SolidAlgorithmCreateRoutingTableCombine.combine(leftStack, 0, 0, leftStackEnd, rightStack, 0, 1, operation);
  return leftStack.slice(0, leftStackEnd.value);
}

/**
 * CreateRoutingTableJob.Combine post-optimization port (allEqual + all-zero
 * strip).
 */
describe('SolidAlgorithmCreateRoutingTableCombine optimizations', () => {
  it('collapses a constant final node so AllOutside peers do not keep six baked rows', () => {
    const live = combineSingleRows(
      SolidAlgorithmCategoryRoutingRow.Identity,
      SolidAlgorithmCategoryRoutingRow.AllOutside,
      SolidOperation.Additive,
    );
    expect(live.length).toBe(1);
    expect(live[0]!.nodeIdValue).toBe(10);
    expect(live[0]!.routingRow.equals(SolidAlgorithmCategoryRoutingRow.Identity)).toBe(true);
  });

  it('collapses AllInside right peers under additive to constant destinations', () => {
    const live = combineSingleRows(
      SolidAlgorithmCategoryRoutingRow.Identity,
      SolidAlgorithmCategoryRoutingRow.AllInside,
      SolidOperation.Additive,
    );
    expect(live.length).toBe(1);
    expect(live[0]!.routingRow.areAllTheSame()).toBe(true);
    expect(live[0]!.routingRow.at(0)).toBe(SurfaceCategory.Inside);
  });

  it('keeps multi-row final nodes when columns differ within a row', () => {
    const live = combineSingleRows(
      SolidAlgorithmCategoryRoutingRow.Identity,
      SolidAlgorithmCategoryRoutingRow.Identity,
      SolidOperation.Additive,
    );
    expect(live.length).toBeGreaterThan(1);
    const finalRows = live.filter((node) => node.nodeIdValue === 20);
    expect(finalRows.length).toBeGreaterThan(0);
    expect(finalRows.some((node) => !node.routingRow.areAllTheSame())).toBe(true);
  });

  it('strips a leading all-Inside single-node row after collapse', () => {
    const leftStack = [
      new SolidAlgorithmCategoryStackNode(0, 1, SolidAlgorithmCategoryRoutingRow.AllInside),
      new SolidAlgorithmCategoryStackNode(0, 2, SolidAlgorithmCategoryRoutingRow.Identity),
    ];
    const leftStackEnd = { value: 2 };
    const rightStack = [new SolidAlgorithmCategoryStackNode(0, 3, SolidAlgorithmCategoryRoutingRow.AllOutside)];
    SolidAlgorithmCreateRoutingTableCombine.combine(
      leftStack,
      0,
      0,
      leftStackEnd,
      rightStack,
      0,
      1,
      SolidOperation.Additive,
    );
    const live = leftStack.slice(0, leftStackEnd.value);
    expect(live.length).toBeGreaterThan(0);
    expect(live[0]!.routingRow.areAllValue(SurfaceCategory.Inside)).toBe(false);
    expect(live.some((node) => node.nodeIdValue === 1)).toBe(false);
  });
});

import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SurfaceCategory } from '@/solid/types/surface_category.js';
import { CategoryRouter } from '@/solid/algorithm/category/category_router.js';
import type { PreparedBrush } from '@/solid/algorithm/compile/solid_compile_types.js';
import type { SolidCsgTree, SolidCsgTreeNode } from '@/solid/algorithm/compile/solid_csg_tree.js';
import {
  SOLID_ALGORITHM_ROUTING_CATEGORY_COUNT,
  SolidAlgorithmRoutingTable,
  type SolidAlgorithmRoutingStep,
} from './solid_algorithm_routing_table.js';

/**
 * Builds optimized Sander-style routing tables for **flat** solid CSG.
 *
 * For each subject brush the table only includes that brush and the brushes it
 * touches (or every brush when sequential ∩ requires full walks). Boolean
 * operations are baked into lookup rows; next-step category states are
 * collapsed so long operation chains stay small — the Sander routing-table
 * optimization.
 *
 * Hierarchical trees must not be linearized here. Children of a group combine
 * from empty and the group applies once to its parent (branch/leaf model).
 * Applying each leaf's operation in DFS order would let a nested ∩ clip brushes
 * outside that group. Callers route hierarchical CSG through
 * SolidCsgTreeEvaluator instead.
 */
export class SolidAlgorithmRoutingTableBuilder {
  /**
   * Builds a routing table for one subject brush on a flat CSG list.
   *
   * @param prepared All prepared brushes.
   * @param subjectIndex Subject prepared index.
   * @param peerIndices Overlapping peer prepared indices (excluding subject).
   * @param tree CSG tree (must be flat; non-flat yields an empty table).
   * @param invertedWorld Whether CSG starts solid.
   * @param forceFull When true, includes every prepared brush in list order.
   * @returns Optimized routing table, or an empty table when the tree is not
   *   flat.
   */
  static buildForSubject(
    prepared: readonly PreparedBrush[],
    subjectIndex: number,
    peerIndices: readonly number[],
    tree: SolidCsgTree,
    invertedWorld: boolean,
    forceFull: boolean,
  ): SolidAlgorithmRoutingTable {
    if (!tree.isFlat) {
      return new SolidAlgorithmRoutingTable([], invertedWorld);
    }
    const ordered = forceFull
      ? this.allPreparedIndices(prepared.length)
      : this.orderedRelevantIndices(prepared, subjectIndex, peerIndices, tree);
    return this.buildLinearTable(ordered, prepared, invertedWorld);
  }

  /**
   * Builds a linear routing table for an ordered brush list with row merging.
   *
   * @param orderedIndices Prepared indices in evaluation order.
   * @param prepared Prepared brushes.
   * @param invertedWorld Whether CSG starts solid.
   * @returns Optimized linear routing table.
   */
  static buildLinearTable(
    orderedIndices: readonly number[],
    prepared: readonly PreparedBrush[],
    invertedWorld: boolean,
  ): SolidAlgorithmRoutingTable {
    if (orderedIndices.length === 0) {
      return new SolidAlgorithmRoutingTable([], invertedWorld);
    }
    const initial = invertedWorld ? SurfaceCategory.Inside : SurfaceCategory.Outside;
    let inputCategories: SurfaceCategory[] = [initial];
    const steps: SolidAlgorithmRoutingStep[] = [];
    for (let stepIndex = 0; stepIndex < orderedIndices.length; stepIndex++) {
      const preparedIndex = orderedIndices[stepIndex]!;
      const entry = prepared[preparedIndex];
      if (!entry) continue;
      const isLast = stepIndex === orderedIndices.length - 1;
      const stepResult = this.buildOptimizedStep(inputCategories, entry.operation, isLast);
      steps.push({ preparedIndex, rows: stepResult.rows });
      if (!isLast) {
        inputCategories = stepResult.nextInputCategories;
      }
    }
    return new SolidAlgorithmRoutingTable(steps, invertedWorld);
  }

  /**
   * Returns 0..count-1 prepared indices.
   *
   * @param count Prepared brush count.
   * @returns Sequential indices.
   */
  private static allPreparedIndices(count: number): number[] {
    const indices: number[] = [];
    for (let index = 0; index < count; index++) indices.push(index);
    return indices;
  }

  /**
   * Collects subject + peers in solid evaluation order. Flat trees use prepared
   * list order; the DFS leaf helper remains only for defensive completeness
   * (buildForSubject returns early for non-flat trees).
   *
   * @param prepared Prepared brushes.
   * @param subjectIndex Subject index.
   * @param peerIndices Peer indices.
   * @param tree CSG tree.
   * @returns Ordered prepared indices.
   */
  private static orderedRelevantIndices(
    prepared: readonly PreparedBrush[],
    subjectIndex: number,
    peerIndices: readonly number[],
    tree: SolidCsgTree,
  ): number[] {
    const relevant = new Set<number>(peerIndices);
    relevant.add(subjectIndex);
    if (tree.isFlat) {
      return this.filterFlatOrder(prepared.length, relevant);
    }
    return this.filterTreeLeafOrder(tree.roots, relevant);
  }

  /**
   * Filters flat prepared order to the relevant set.
   *
   * @param preparedCount Total prepared count.
   * @param relevant Relevant indices.
   * @returns Ordered indices.
   */
  private static filterFlatOrder(preparedCount: number, relevant: ReadonlySet<number>): number[] {
    const ordered: number[] = [];
    for (let index = 0; index < preparedCount; index++) {
      if (relevant.has(index)) ordered.push(index);
    }
    return ordered;
  }

  /**
   * DFS leaf order of relevant brushes under tree roots.
   *
   * @param nodes Tree nodes.
   * @param relevant Relevant indices.
   * @returns Ordered leaf indices.
   */
  private static filterTreeLeafOrder(nodes: readonly SolidCsgTreeNode[], relevant: ReadonlySet<number>): number[] {
    const ordered: number[] = [];
    for (const node of nodes) {
      this.appendRelevantLeaves(node, relevant, ordered);
    }
    return ordered;
  }

  /**
   * Appends relevant leaves under a node in DFS order.
   *
   * @param node Tree node.
   * @param relevant Relevant indices.
   * @param ordered Output list.
   */
  private static appendRelevantLeaves(node: SolidCsgTreeNode, relevant: ReadonlySet<number>, ordered: number[]): void {
    if (node.kind === 'brush') {
      if (relevant.has(node.preparedIndex)) ordered.push(node.preparedIndex);
      return;
    }
    for (const child of node.children) {
      this.appendRelevantLeaves(child, relevant, ordered);
    }
  }

  /**
   * Builds one table step from current input-state categories, merging
   * duplicate rows and renumbering outputs for the next step.
   *
   * @param inputCategories Category for each input row index.
   * @param operation CSG operation of this brush.
   * @param isLast When true, leave outputs as SurfaceCategory values.
   * @returns Rows and next-step input categories.
   */
  private static buildOptimizedStep(
    inputCategories: readonly SurfaceCategory[],
    operation: SolidOperation,
    isLast: boolean,
  ): { rows: Uint8Array[]; nextInputCategories: SurfaceCategory[] } {
    const categoryRows: number[][] = inputCategories.map((left) => {
      const row: number[] = [];
      for (let col = 0; col < SOLID_ALGORITHM_ROUTING_CATEGORY_COUNT; col++) {
        row.push(CategoryRouter.route(left, col as SurfaceCategory, operation));
      }
      return row;
    });
    if (isLast) {
      return {
        rows: categoryRows.map((row) => Uint8Array.from(row)),
        nextInputCategories: [],
      };
    }
    return this.renumberOutputsToNextStates(categoryRows);
  }

  /**
   * Converts category-valued rows into next-state indices, registering each
   * distinct output category as a compact state for the following step.
   *
   * @param categoryRows Rows whose cells are SurfaceCategory values.
   * @returns Indexed rows (same row count as inputs) and the category meaning
   *   of each next-state index.
   */
  private static renumberOutputsToNextStates(categoryRows: number[][]): {
    rows: Uint8Array[];
    nextInputCategories: SurfaceCategory[];
  } {
    const categoryToState = new Map<number, number>();
    const nextInputCategories: SurfaceCategory[] = [];
    const registerCategory = (category: number): number => {
      let state = categoryToState.get(category);
      if (state !== undefined) return state;
      state = nextInputCategories.length;
      categoryToState.set(category, state);
      nextInputCategories.push(category as SurfaceCategory);
      return state;
    };
    const indexedRows = categoryRows.map((row) => {
      const out = new Uint8Array(SOLID_ALGORITHM_ROUTING_CATEGORY_COUNT);
      for (let col = 0; col < SOLID_ALGORITHM_ROUTING_CATEGORY_COUNT; col++) {
        out[col] = registerCategory(row[col]!);
      }
      return out;
    });
    const merged = this.mergeDuplicateRows(indexedRows);
    return { rows: merged.rows, nextInputCategories };
  }

  /**
   * Placeholder for optional identical-row compaction. Previous-step outputs
   * index into this step by input state, so rows must stay aligned 1:1 with
   * inputCategories; compacting without rewriting the previous step would break
   * lookups. Distinct next-state categories are already collapsed in
   * renumberOutputsToNextStates.
   *
   * @param rows Input rows (next-state indices), one per input state.
   * @returns The same rows unchanged (length preserved for input-state
   *   indexing).
   */
  private static mergeDuplicateRows(rows: Uint8Array[]): { rows: Uint8Array[] } {
    const keyToIndex = new Map<string, number>();
    const compact: Uint8Array[] = [];
    const remap: number[] = [];
    for (const row of rows) {
      const key = Array.from(row).join(',');
      let index = keyToIndex.get(key);
      if (index === undefined) {
        index = compact.length;
        keyToIndex.set(key, index);
        compact.push(row);
      }
      remap.push(index);
    }
    if (compact.length === rows.length) {
      return { rows };
    }
    void remap;
    return { rows };
  }
}

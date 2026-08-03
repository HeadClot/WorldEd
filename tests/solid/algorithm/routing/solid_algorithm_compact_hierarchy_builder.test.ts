import { describe, it, expect } from 'vitest';
import { SolidOperation } from '@/solid/types/solid_operation.js';
import { SolidCsgTree } from '@/solid/algorithm/compile/solid_csg_tree.js';
import type { SolidCsgTreeNode } from '@/solid/algorithm/compile/solid_csg_tree.js';
import { SolidAlgorithmCompactHierarchyBuilder } from '@/solid/algorithm/routing/solid_algorithm_compact_hierarchy_builder.js';

/**
 * Builds a flat CSG tree from ordered brush operations.
 *
 * @param operations Per-brush operations in evaluation order.
 * @returns Flat CSG tree.
 */
function flatTreeFromOperations(operations: SolidOperation[]): SolidCsgTree {
  const roots: SolidCsgTreeNode[] = operations.map((operation, preparedIndex) => ({
    kind: 'brush' as const,
    preparedIndex,
    operation,
    children: [],
  }));
  return new SolidCsgTree(roots);
}

/** CompactTreeBuilder leading non-Additive prune. */
describe('SolidAlgorithmCompactHierarchyBuilder', () => {
  it('skips leading subtractive and intersecting root children', () => {
    const tree = flatTreeFromOperations([
      SolidOperation.Subtractive,
      SolidOperation.Intersecting,
      SolidOperation.Additive,
      SolidOperation.Subtractive,
    ]);
    const hierarchy = SolidAlgorithmCompactHierarchyBuilder.build(tree, false);
    const root = hierarchy[0]!;
    expect(root.kind).toBe('branch');
    expect(root.childCount).toBe(2);
    const firstChild = hierarchy[root.childOffset]!;
    const secondChild = hierarchy[root.childOffset + 1]!;
    expect(firstChild.kind).toBe('brush');
    expect(firstChild.preparedIndex).toBe(2);
    expect(firstChild.operation).toBe(SolidOperation.Additive);
    expect(secondChild.preparedIndex).toBe(3);
    expect(secondChild.operation).toBe(SolidOperation.Subtractive);
  });

  it('emits no children when a branch has only leading non-additives', () => {
    const tree = flatTreeFromOperations([SolidOperation.Subtractive, SolidOperation.Intersecting]);
    const hierarchy = SolidAlgorithmCompactHierarchyBuilder.build(tree, false);
    const root = hierarchy[0]!;
    expect(root.childCount).toBe(0);
  });

  it('keeps inverted infinite additive first then all following children', () => {
    const tree = flatTreeFromOperations([SolidOperation.Subtractive, SolidOperation.Additive]);
    const hierarchy = SolidAlgorithmCompactHierarchyBuilder.build(tree, true);
    const root = hierarchy[0]!;
    expect(root.childCount).toBe(3);
    expect(hierarchy[root.childOffset]!.operation).toBe(SolidOperation.Additive);
    expect(hierarchy[root.childOffset + 1]!.preparedIndex).toBe(0);
    expect(hierarchy[root.childOffset + 1]!.operation).toBe(SolidOperation.Subtractive);
    expect(hierarchy[root.childOffset + 2]!.preparedIndex).toBe(1);
  });

  it('stores parentIndex for O(1) ancestor walks', () => {
    const tree = flatTreeFromOperations([SolidOperation.Additive, SolidOperation.Subtractive]);
    const hierarchy = SolidAlgorithmCompactHierarchyBuilder.build(tree, false);
    const root = hierarchy[0]!;
    expect(root.parentIndex).toBe(-1);
    for (let child = 0; child < root.childCount; child++) {
      const node = hierarchy[root.childOffset + child]!;
      expect(node.parentIndex).toBe(0);
    }
  });
});

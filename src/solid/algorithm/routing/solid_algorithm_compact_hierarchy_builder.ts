import { SolidOperation } from '@/solid/types/solid_operation.js';
import type { SolidCsgTree, SolidCsgTreeNode } from '@/solid/algorithm/compile/solid_csg_tree.js';
import {
  SOLID_ALGORITHM_INFINITE_PREPARED_INDEX,
  type SolidAlgorithmCompactNode,
} from './solid_algorithm_compact_node.js';

/** Temporary tree used only while building the compact array. */
interface HierarchyTempNode {
  kind: 'brush' | 'branch';
  preparedIndex: number;
  operation: SolidOperation;
  children: HierarchyTempNode[];
}

/**
 * Builds a Chisel compact hierarchy array from a solid CSG tree. Inverted world
 * injects a virtual infinite additive brush as the first root child. Layout
 * matches CompactTreeBuilder BFS so each parent's direct children occupy a
 * contiguous index range. Each node receives a unique nodeId.
 */
export class SolidAlgorithmCompactHierarchyBuilder {
  /**
   * Builds the compact node array for CreateRoutingTableJob (root at index 0).
   *
   * @param tree Hierarchical or flat CSG tree.
   * @param invertedWorld When true, prepends the infinite additive brush.
   * @returns Compact hierarchy nodes.
   */
  static build(tree: SolidCsgTree, invertedWorld: boolean): SolidAlgorithmCompactNode[] {
    const rootTemp = this.buildTempRoot(tree, invertedWorld);
    return this.serializeBreadthFirst(rootTemp);
  }

  /**
   * Builds the temporary root branch with optional infinite first child.
   *
   * @param tree CSG tree.
   * @param invertedWorld Inverted-world flag.
   * @returns Temporary root node.
   */
  private static buildTempRoot(tree: SolidCsgTree, invertedWorld: boolean): HierarchyTempNode {
    const children: HierarchyTempNode[] = [];
    if (invertedWorld) {
      children.push({
        kind: 'brush',
        preparedIndex: SOLID_ALGORITHM_INFINITE_PREPARED_INDEX,
        operation: SolidOperation.Additive,
        children: [],
      });
    }
    for (const root of tree.roots) {
      children.push(this.treeNodeToTemp(root));
    }
    return {
      kind: 'branch',
      preparedIndex: -2,
      operation: SolidOperation.Additive,
      children,
    };
  }

  /**
   * Converts a solid CSG tree node into a temporary hierarchy node.
   *
   * @param node CSG tree node.
   * @returns Temporary node.
   */
  private static treeNodeToTemp(node: SolidCsgTreeNode): HierarchyTempNode {
    if (node.kind === 'brush') {
      return {
        kind: 'brush',
        preparedIndex: node.preparedIndex,
        operation: node.operation,
        children: [],
      };
    }
    return {
      kind: 'branch',
      preparedIndex: -2,
      operation: node.operation,
      children: node.children.map((child) => this.treeNodeToTemp(child)),
    };
  }

  /**
   * Serializes the temp tree into a compact array with contiguous children.
   *
   * @param root Temporary root.
   * @returns Compact hierarchy.
   */
  private static serializeBreadthFirst(root: HierarchyTempNode): SolidAlgorithmCompactNode[] {
    const nodes: SolidAlgorithmCompactNode[] = [];
    const queue: { temp: HierarchyTempNode; index: number }[] = [];
    nodes.push(this.toCompactShell(root, 0));
    queue.push({ temp: root, index: 0 });
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) {
        break;
      }
      this.expandQueuedBranch(item.temp, item.index, nodes, queue);
    }
    return nodes;
  }

  /**
   * Creates a compact node shell with a unique nodeId.
   *
   * @param temp Temporary node.
   * @param nodeId Assigned compact node id.
   * @returns Compact node shell.
   */
  private static toCompactShell(temp: HierarchyTempNode, nodeId: number): SolidAlgorithmCompactNode {
    return {
      kind: temp.kind,
      nodeId,
      preparedIndex: temp.preparedIndex,
      operation: temp.operation,
      childOffset: 0,
      childCount: 0,
    };
  }

  /**
   * Appends direct children of a branch contiguously and queues nested
   * branches.
   *
   * @param temp Branch temporary node.
   * @param parentIndex Compact index of the parent.
   * @param nodes Compact array.
   * @param queue BFS queue for nested branches.
   */
  private static expandQueuedBranch(
    temp: HierarchyTempNode,
    parentIndex: number,
    nodes: SolidAlgorithmCompactNode[],
    queue: { temp: HierarchyTempNode; index: number }[],
  ): void {
    if (temp.kind !== 'branch' || temp.children.length === 0) {
      return;
    }
    const childOffset = nodes.length;
    for (const child of temp.children) {
      const childIndex = nodes.length;
      nodes.push(this.toCompactShell(child, childIndex));
      if (child.kind === 'branch') {
        queue.push({ temp: child, index: childIndex });
      }
    }
    const parent = nodes[parentIndex]!;
    nodes[parentIndex] = {
      kind: 'branch',
      nodeId: parent.nodeId,
      preparedIndex: temp.preparedIndex,
      operation: temp.operation,
      childOffset,
      childCount: temp.children.length,
    };
  }
}

import type { AreaLeafPayload } from './area_editor_type.js';
import { areRectsJoinable, clampAreaNumber, createUnitAreaRect, type AreaRect } from './area_rect.js';
import type { AreaSplitDirection } from './area_split_direction.js';
import {
  createAreaLeafNode,
  createAreaSplitNode,
  isAreaLeafNode,
  isAreaSplitNode,
  type AreaLeafNode,
  type AreaSplitNode,
  type AreaTreeNode,
} from './area_tree_node.js';
import type { AreaLeafPlacement } from './area_leaf_placement.js';
import { mergePlacementPair, rebuildAreaTreeFromPlacements } from './area_tree_rebuild.js';

export type { AreaLeafPlacement } from './area_leaf_placement.js';

/** Minimum and maximum allowed split ratios. */
export const AREA_SPLIT_RATIO_MIN = 0.05;
export const AREA_SPLIT_RATIO_MAX = 0.95;

/**
 * Clamps a split ratio into the safe range.
 *
 * @param ratio Requested ratio.
 * @returns Clamped ratio.
 */
export function clampAreaSplitRatio(ratio: number): number {
  return clampAreaNumber(ratio, AREA_SPLIT_RATIO_MIN, AREA_SPLIT_RATIO_MAX);
}

/**
 * Lists every leaf with its normalized rect filling the unit square without
 * gaps.
 *
 * @param root Layout tree root.
 * @returns Leaf placements in depth-first order.
 */
export function listAreaLeafPlacements(root: AreaTreeNode): AreaLeafPlacement[] {
  const placements: AreaLeafPlacement[] = [];
  collectLeafPlacements(root, createUnitAreaRect(), placements);
  return placements;
}

/**
 * Returns the leaf count of a tree.
 *
 * @param root Layout tree root.
 * @returns Number of leaves.
 */
export function countAreaLeaves(root: AreaTreeNode): number {
  if (isAreaLeafNode(root)) return 1;
  return countAreaLeaves(root.first) + countAreaLeaves(root.second);
}

/**
 * Finds a leaf node by area id.
 *
 * @param root Layout tree root.
 * @param areaId Target area id.
 * @returns Leaf node or null.
 */
export function findAreaLeafById(root: AreaTreeNode, areaId: string): AreaLeafNode | null {
  if (isAreaLeafNode(root)) {
    return root.payload.areaId === areaId ? root : null;
  }
  return findAreaLeafById(root.first, areaId) ?? findAreaLeafById(root.second, areaId);
}

/**
 * Returns the placement for a leaf id when present.
 *
 * @param root Layout tree root.
 * @param areaId Target area id.
 * @returns Placement or null.
 */
export function findAreaLeafPlacement(root: AreaTreeNode, areaId: string): AreaLeafPlacement | null {
  return listAreaLeafPlacements(root).find((item) => item.payload.areaId === areaId) ?? null;
}

/**
 * Splits a leaf into two leaves along a direction.
 *
 * @param root Layout tree root.
 * @param areaId Leaf to split.
 * @param direction Split axis.
 * @param ratio Fraction for the original leaf (first child).
 * @param newPayload Payload for the new sibling leaf.
 * @returns New tree root, or the original root when the leaf is missing.
 */
export function splitAreaLeaf(
  root: AreaTreeNode,
  areaId: string,
  direction: AreaSplitDirection,
  ratio: number,
  newPayload: AreaLeafPayload,
): AreaTreeNode {
  return replaceLeafWithSplit(root, areaId, direction, clampAreaSplitRatio(ratio), newPayload) ?? root;
}

/**
 * Updates the split ratio for the parent that has `areaId` as first or second
 * child. Prefer {@link setSplitRatioAtPath} for precise control; this walks and
 * sets the nearest split containing the leaf when used after a border drag on a
 * known split.
 *
 * @param root Layout tree root.
 * @param match Predicate selecting the split node to update.
 * @param ratio New ratio.
 * @returns Updated tree root.
 */
export function updateMatchingSplitRatio(
  root: AreaTreeNode,
  match: (node: AreaSplitNode) => boolean,
  ratio: number,
): AreaTreeNode {
  return mapTree(root, (node) => {
    if (!isAreaSplitNode(node) || !match(node)) return node;
    return createAreaSplitNode(node.direction, clampAreaSplitRatio(ratio), node.first, node.second);
  });
}

/**
 * Sets the ratio on the lowest split whose first/second subtrees contain the
 * two area ids (supports non-sibling neighbors such as top|side in the quad
 * layout).
 *
 * @param root Layout tree root.
 * @param firstAreaId Area on the first side of the border (left or top).
 * @param secondAreaId Area on the second side (right or bottom).
 * @param ratio New first-child ratio.
 * @returns Updated root, or the original root when no separating split exists.
 */
export function setSplitRatioBetweenAreas(
  root: AreaTreeNode,
  firstAreaId: string,
  secondAreaId: string,
  ratio: number,
): AreaTreeNode {
  return updateSplitSeparating(root, firstAreaId, secondAreaId, clampAreaSplitRatio(ratio)) ?? root;
}

/**
 * Joins two leaves when they share a full edge. The survivor keeps its payload;
 * the removed leaf is dropped. When the leaves are not joinable, returns null.
 *
 * @param root Layout tree root.
 * @param survivorId Area id that remains.
 * @param removeId Area id that is absorbed.
 * @returns New root, or null when join is illegal.
 */
export function joinAreaLeaves(root: AreaTreeNode, survivorId: string, removeId: string): AreaTreeNode | null {
  if (survivorId === removeId) return null;
  if (countAreaLeaves(root) < 2) return null;
  const placements = listAreaLeafPlacements(root);
  const survivor = placements.find((item) => item.payload.areaId === survivorId);
  const removed = placements.find((item) => item.payload.areaId === removeId);
  if (!survivor || !removed) return null;
  if (!areRectsJoinable(survivor.rect, removed.rect)) return null;
  const siblingJoin = tryCollapseSiblingPair(root, survivorId, removeId);
  if (siblingJoin) return siblingJoin;
  const merged = mergePlacementPair(placements, survivorId, removeId);
  return rebuildAreaTreeFromPlacements(merged, createUnitAreaRect());
}

/**
 * Deep-clones a tree node graph.
 *
 * @param root Source tree.
 * @returns Independent clone.
 */
export function cloneAreaTree(root: AreaTreeNode): AreaTreeNode {
  if (isAreaLeafNode(root)) {
    return createAreaLeafNode({ ...root.payload });
  }
  return createAreaSplitNode(root.direction, root.ratio, cloneAreaTree(root.first), cloneAreaTree(root.second));
}

/**
 * Collects leaf placements under a node into an array.
 *
 * @param node Current node.
 * @param rect Parent rect for this node.
 * @param out Destination list.
 */
function collectLeafPlacements(node: AreaTreeNode, rect: AreaRect, out: AreaLeafPlacement[]): void {
  if (isAreaLeafNode(node)) {
    out.push({ payload: node.payload, rect });
    return;
  }
  const { firstRect, secondRect } = splitRect(rect, node.direction, node.ratio);
  collectLeafPlacements(node.first, firstRect, out);
  collectLeafPlacements(node.second, secondRect, out);
}

/**
 * Divides a parent rect into first/second child rects.
 *
 * @param rect Parent rect.
 * @param direction Split axis.
 * @param ratio Fraction for first child.
 * @returns First and second child rects.
 */
function splitRect(
  rect: AreaRect,
  direction: AreaSplitDirection,
  ratio: number,
): { firstRect: AreaRect; secondRect: AreaRect } {
  if (direction === 'horizontal') {
    const firstWidth = rect.width * ratio;
    return {
      firstRect: { x: rect.x, y: rect.y, width: firstWidth, height: rect.height },
      secondRect: {
        x: rect.x + firstWidth,
        y: rect.y,
        width: rect.width - firstWidth,
        height: rect.height,
      },
    };
  }
  const firstHeight = rect.height * ratio;
  return {
    firstRect: { x: rect.x, y: rect.y, width: rect.width, height: firstHeight },
    secondRect: {
      x: rect.x,
      y: rect.y + firstHeight,
      width: rect.width,
      height: rect.height - firstHeight,
    },
  };
}

/**
 * Replaces a leaf with a split of that leaf and a new sibling.
 *
 * @param node Current node.
 * @param areaId Leaf to replace.
 * @param direction Split axis.
 * @param ratio Clamped ratio for the original leaf.
 * @param newPayload New sibling payload.
 * @returns Updated subtree, or null when leaf not found.
 */
function replaceLeafWithSplit(
  node: AreaTreeNode,
  areaId: string,
  direction: AreaSplitDirection,
  ratio: number,
  newPayload: AreaLeafPayload,
): AreaTreeNode | null {
  if (isAreaLeafNode(node)) {
    if (node.payload.areaId !== areaId) return null;
    return createAreaSplitNode(direction, ratio, createAreaLeafNode(node.payload), createAreaLeafNode(newPayload));
  }
  const first = replaceLeafWithSplit(node.first, areaId, direction, ratio, newPayload);
  if (first) return createAreaSplitNode(node.direction, node.ratio, first, node.second);
  const second = replaceLeafWithSplit(node.second, areaId, direction, ratio, newPayload);
  if (second) return createAreaSplitNode(node.direction, node.ratio, node.first, second);
  return null;
}

/**
 * Maps every node; match can replace a node in place.
 *
 * @param node Current node.
 * @param mapper Replacement function (return same node to keep).
 * @returns Mapped tree.
 */
function mapTree(node: AreaTreeNode, mapper: (candidate: AreaTreeNode) => AreaTreeNode): AreaTreeNode {
  if (isAreaLeafNode(node)) return mapper(node);
  const mapped = mapper(
    createAreaSplitNode(node.direction, node.ratio, mapTree(node.first, mapper), mapTree(node.second, mapper)),
  );
  return mapped;
}

/**
 * Recursively finds the split that separates two area ids and updates its
 * ratio.
 *
 * @param node Current node.
 * @param firstAreaId First area id.
 * @param secondAreaId Second area id.
 * @param ratio Clamped ratio.
 * @returns Updated node when a match is found below, else null.
 */
function updateSplitSeparating(
  node: AreaTreeNode,
  firstAreaId: string,
  secondAreaId: string,
  ratio: number,
): AreaTreeNode | null {
  if (isAreaLeafNode(node)) return null;
  const firstHasA = subtreeHasArea(node.first, firstAreaId);
  const firstHasB = subtreeHasArea(node.first, secondAreaId);
  const secondHasA = subtreeHasArea(node.second, firstAreaId);
  const secondHasB = subtreeHasArea(node.second, secondAreaId);
  if ((firstHasA && secondHasB) || (firstHasB && secondHasA)) {
    const firstIsFirstSide = firstHasA && secondHasB;
    const appliedRatio = firstIsFirstSide ? ratio : 1 - ratio;
    return createAreaSplitNode(node.direction, clampAreaSplitRatio(appliedRatio), node.first, node.second);
  }
  const firstUpdate = updateSplitSeparating(node.first, firstAreaId, secondAreaId, ratio);
  if (firstUpdate) {
    return createAreaSplitNode(node.direction, node.ratio, firstUpdate, node.second);
  }
  const secondUpdate = updateSplitSeparating(node.second, firstAreaId, secondAreaId, ratio);
  if (secondUpdate) {
    return createAreaSplitNode(node.direction, node.ratio, node.first, secondUpdate);
  }
  return null;
}

/**
 * Returns whether a subtree contains the given area id.
 *
 * @param node Subtree root.
 * @param areaId Target area id.
 * @returns True when present.
 */
function subtreeHasArea(node: AreaTreeNode, areaId: string): boolean {
  if (isAreaLeafNode(node)) return node.payload.areaId === areaId;
  return subtreeHasArea(node.first, areaId) || subtreeHasArea(node.second, areaId);
}

/**
 * Collapses a parent whose two children are exactly the survivor and remove
 * pair.
 *
 * @param node Current node.
 * @param survivorId Survivor area id.
 * @param removeId Removed area id.
 * @returns Collapsed tree when a sibling pair is found, else null.
 */
function tryCollapseSiblingPair(node: AreaTreeNode, survivorId: string, removeId: string): AreaTreeNode | null {
  if (isAreaLeafNode(node)) return null;
  const siblingResult = collapseIfSiblingPair(node, survivorId, removeId);
  if (siblingResult) return siblingResult;
  const first = tryCollapseSiblingPair(node.first, survivorId, removeId);
  if (first) return createAreaSplitNode(node.direction, node.ratio, first, node.second);
  const second = tryCollapseSiblingPair(node.second, survivorId, removeId);
  if (second) return createAreaSplitNode(node.direction, node.ratio, node.first, second);
  return null;
}

/**
 * If a split's children are the survivor and remove leaves, returns the
 * survivor leaf.
 *
 * @param node Split node.
 * @param survivorId Survivor id.
 * @param removeId Remove id.
 * @returns Survivor leaf when children match the pair, else null.
 */
function collapseIfSiblingPair(node: AreaSplitNode, survivorId: string, removeId: string): AreaTreeNode | null {
  if (!isAreaLeafNode(node.first) || !isAreaLeafNode(node.second)) return null;
  const ids = [node.first.payload.areaId, node.second.payload.areaId];
  if (!ids.includes(survivorId) || !ids.includes(removeId)) return null;
  return node.first.payload.areaId === survivorId ? node.first : node.second;
}

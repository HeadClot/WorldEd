import { areRectsJoinable } from './area_rect.js';
import { countAreaLeaves, findAreaLeafPlacement, listAreaLeafPlacements } from './area_layout_tree.js';
import type { AreaLeafPlacement } from './area_leaf_placement.js';
import type { AreaTreeNode } from './area_tree_node.js';

/** Result of checking whether two areas may be joined. */
export interface AreaJoinCheck {
  allowed: boolean;
  reason: string;
  survivorPlacement: AreaLeafPlacement | null;
  removePlacement: AreaLeafPlacement | null;
}

/**
 * Returns whether joining is allowed for the given survivor and remove area
 * ids. Joining the last remaining area is always forbidden.
 *
 * @param root Layout tree root.
 * @param survivorId Area that keeps content.
 * @param removeId Area absorbed into the survivor.
 * @returns Join check result with reason.
 */
export function checkAreaJoin(root: AreaTreeNode, survivorId: string, removeId: string): AreaJoinCheck {
  const identityFailure = joinIdentityFailure(root, survivorId, removeId);
  if (identityFailure) return identityFailure;
  const survivorPlacement = findAreaLeafPlacement(root, survivorId);
  const removePlacement = findAreaLeafPlacement(root, removeId);
  if (!survivorPlacement || !removePlacement) {
    return emptyJoinCheck(false, 'One or both areas are missing');
  }
  if (!areRectsJoinable(survivorPlacement.rect, removePlacement.rect)) {
    return {
      allowed: false,
      reason: 'Areas do not share a full edge',
      survivorPlacement,
      removePlacement,
    };
  }
  return {
    allowed: true,
    reason: 'Join allowed',
    survivorPlacement,
    removePlacement,
  };
}

/**
 * Returns early join failures for identity and leaf-count rules.
 *
 * @param root Layout tree root.
 * @param survivorId Area that keeps content.
 * @param removeId Area absorbed into the survivor.
 * @returns Failure check or null when identity rules pass.
 */
function joinIdentityFailure(root: AreaTreeNode, survivorId: string, removeId: string): AreaJoinCheck | null {
  if (survivorId === removeId) {
    return emptyJoinCheck(false, 'Cannot join an area with itself');
  }
  if (countAreaLeaves(root) < 2) {
    return emptyJoinCheck(false, 'Cannot join the only remaining area');
  }
  return null;
}

/**
 * Lists every other leaf that can legally join with the given area.
 *
 * @param root Layout tree root.
 * @param areaId Source area id.
 * @returns Joinable neighbor placements.
 */
export function listJoinableNeighbors(root: AreaTreeNode, areaId: string): AreaLeafPlacement[] {
  if (countAreaLeaves(root) < 2) return [];
  const source = findAreaLeafPlacement(root, areaId);
  if (!source) return [];
  return listAreaLeafPlacements(root).filter((candidate) => {
    if (candidate.payload.areaId === areaId) return false;
    return areRectsJoinable(source.rect, candidate.rect);
  });
}

/**
 * Returns whether a sole-area tree forbids join operations.
 *
 * @param root Layout tree root.
 * @returns True when join must be impossible.
 */
export function isJoinImpossibleForTree(root: AreaTreeNode): boolean {
  return countAreaLeaves(root) < 2;
}

/**
 * Builds an empty failed join check.
 *
 * @param allowed Always false for empty failure helpers.
 * @param reason Human-readable reason.
 * @returns Join check without placements.
 */
function emptyJoinCheck(allowed: boolean, reason: string): AreaJoinCheck {
  return {
    allowed,
    reason,
    survivorPlacement: null,
    removePlacement: null,
  };
}

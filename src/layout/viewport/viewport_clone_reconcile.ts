import * as THREE from 'three';
import { EDITOR_SOURCE_UUID_KEY } from './viewport_sync_keys.js';

/**
 * Callbacks used while reconciling an orthographic viewport clone with the
 * authoritative world hierarchy.
 */
export interface ViewportCloneReconcileHooks {
  /**
   * Returns true when a world object should exist in the 2D clone tree.
   *
   * @param object World hierarchy node.
   */
  shouldAppearInClone(object: THREE.Object3D): boolean;

  /**
   * Builds an independent clone of a newly added world subtree.
   *
   * @param worldObject Authoritative world node to clone.
   * @returns Detached clone ready for parenting under a viewport clone.
   */
  createSubtreeClone(worldObject: THREE.Object3D): THREE.Object3D;

  /**
   * Disposes geometry and materials owned by a removed clone subtree.
   *
   * @param object Clone node to dispose.
   */
  disposeCloneObject(object: THREE.Object3D): void;

  /**
   * Copies local transform and visibility from world to clone.
   *
   * @param worldObject Authoritative node.
   * @param cloneObject Matching clone node.
   */
  syncCloneTransform(worldObject: THREE.Object3D, cloneObject: THREE.Object3D): void;
}

/**
 * Incrementally updates one viewport clone hierarchy to match a world parent.
 * Adds missing subtrees, removes stale ones, reorders siblings, and recurses.
 *
 * @param worldParent Authoritative parent node.
 * @param cloneParent Matching clone parent node.
 * @param hooks Clone create/dispose/sync callbacks.
 */
export function reconcileViewportCloneSubtree(
  worldParent: THREE.Object3D,
  cloneParent: THREE.Object3D,
  hooks: ViewportCloneReconcileHooks,
): void {
  hooks.syncCloneTransform(worldParent, cloneParent);
  const desiredChildren = collectDesiredWorldChildren(worldParent, hooks);
  const cloneBySourceUuid = indexCloneChildrenBySourceUuid(cloneParent);
  removeStaleCloneChildren(cloneParent, cloneBySourceUuid, desiredChildren, hooks);
  ensureDesiredCloneChildren(cloneParent, desiredChildren, cloneBySourceUuid, hooks);
  reorderCloneChildren(cloneParent, desiredChildren);
}

/**
 * Collects world children that should appear under a clone parent.
 *
 * @param worldParent Authoritative parent.
 * @param hooks Filter hooks.
 * @returns Ordered world children to mirror.
 */
function collectDesiredWorldChildren(
  worldParent: THREE.Object3D,
  hooks: ViewportCloneReconcileHooks,
): THREE.Object3D[] {
  return worldParent.children.filter((child) => hooks.shouldAppearInClone(child));
}

/**
 * Indexes direct clone children by their source world UUID.
 *
 * @param cloneParent Clone parent node.
 * @returns Map of source UUID to clone child.
 */
function indexCloneChildrenBySourceUuid(cloneParent: THREE.Object3D): Map<string, THREE.Object3D> {
  const cloneBySourceUuid = new Map<string, THREE.Object3D>();
  for (const child of cloneParent.children) {
    const sourceUuid = child.userData[EDITOR_SOURCE_UUID_KEY];
    if (typeof sourceUuid === 'string') {
      cloneBySourceUuid.set(sourceUuid, child);
    }
  }
  return cloneBySourceUuid;
}

/**
 * Removes clone children that no longer exist under the world parent.
 *
 * @param cloneParent Clone parent node.
 * @param cloneBySourceUuid Indexed clone children.
 * @param desiredChildren Desired world children.
 * @param hooks Dispose hooks.
 */
function removeStaleCloneChildren(
  cloneParent: THREE.Object3D,
  cloneBySourceUuid: Map<string, THREE.Object3D>,
  desiredChildren: readonly THREE.Object3D[],
  hooks: ViewportCloneReconcileHooks,
): void {
  const desiredUuids = new Set(desiredChildren.map((child) => child.uuid));
  for (const [sourceUuid, cloneChild] of cloneBySourceUuid) {
    if (desiredUuids.has(sourceUuid)) continue;
    cloneParent.remove(cloneChild);
    hooks.disposeCloneObject(cloneChild);
    cloneBySourceUuid.delete(sourceUuid);
  }
}

/**
 * Creates missing clones and recursively reconciles existing ones.
 *
 * @param cloneParent Clone parent node.
 * @param desiredChildren Desired world children in order.
 * @param cloneBySourceUuid Indexed clone children.
 * @param hooks Create/sync hooks.
 */
function ensureDesiredCloneChildren(
  cloneParent: THREE.Object3D,
  desiredChildren: readonly THREE.Object3D[],
  cloneBySourceUuid: Map<string, THREE.Object3D>,
  hooks: ViewportCloneReconcileHooks,
): void {
  for (const worldChild of desiredChildren) {
    const existingClone = cloneBySourceUuid.get(worldChild.uuid);
    if (!existingClone) {
      cloneParent.add(hooks.createSubtreeClone(worldChild));
      continue;
    }
    reconcileViewportCloneSubtree(worldChild, existingClone, hooks);
  }
}

/**
 * Reorders clone children so they match the world sibling order.
 *
 * @param cloneParent Clone parent node.
 * @param desiredChildren Desired world children in order.
 */
function reorderCloneChildren(cloneParent: THREE.Object3D, desiredChildren: readonly THREE.Object3D[]): void {
  for (const worldChild of desiredChildren) {
    const cloneChild = cloneParent.children.find((child) => child.userData[EDITOR_SOURCE_UUID_KEY] === worldChild.uuid);
    if (cloneChild) {
      cloneParent.add(cloneChild);
    }
  }
}

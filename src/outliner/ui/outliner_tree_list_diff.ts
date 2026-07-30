import type * as THREE from 'three';

/**
 * Returns whether two object lists reference the same objects in order.
 *
 * @param first First list.
 * @param second Second list.
 * @returns True when both lists are identical.
 */
export function areOutlinerObjectListsEqual(
  first: readonly THREE.Object3D[],
  second: readonly THREE.Object3D[],
): boolean {
  if (first.length !== second.length) {
    return false;
  }
  return first.every((object, index) => object === second[index]);
}

/**
 * Finds the index of a single inserted object between two ordered lists.
 *
 * @param desired Desired list (one longer).
 * @param current Current list.
 * @returns Insertion index, or -1 when the diff is not a single insert.
 */
export function findOutlinerSingleInsertionIndex(
  desired: readonly THREE.Object3D[],
  current: readonly THREE.Object3D[],
): number {
  let insertIndex = 0;
  while (insertIndex < current.length && desired[insertIndex] === current[insertIndex]) {
    insertIndex++;
  }
  for (let index = insertIndex; index < current.length; index++) {
    if (desired[index + 1] !== current[index]) {
      return -1;
    }
  }
  return insertIndex;
}

/**
 * Finds the index of a single removed object between two ordered lists.
 *
 * @param desired Desired list (one shorter).
 * @param current Current list.
 * @returns Removal index, or -1 when the diff is not a single remove.
 */
export function findOutlinerSingleRemovalIndex(
  desired: readonly THREE.Object3D[],
  current: readonly THREE.Object3D[],
): number {
  let removeIndex = 0;
  while (removeIndex < desired.length && desired[removeIndex] === current[removeIndex]) {
    removeIndex++;
  }
  for (let index = removeIndex; index < desired.length; index++) {
    if (desired[index] !== current[index + 1]) {
      return -1;
    }
  }
  return removeIndex;
}

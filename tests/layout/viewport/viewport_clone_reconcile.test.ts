import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { EDITOR_SOURCE_UUID_KEY } from '@/layout/viewport/viewport_sync_keys.js';
import { reconcileViewportCloneSubtree } from '@/layout/viewport/viewport_clone_reconcile.js';

describe('reconcileViewportCloneSubtree', () => {
  it('adds missing children and removes stale clones while preserving survivors', () => {
    const worldParent = new THREE.Group();
    const keep = new THREE.Object3D();
    const gone = new THREE.Object3D();
    const added = new THREE.Object3D();
    worldParent.add(keep);
    worldParent.add(added);

    const cloneParent = new THREE.Group();
    const keepClone = new THREE.Object3D();
    keepClone.userData[EDITOR_SOURCE_UUID_KEY] = keep.uuid;
    const goneClone = new THREE.Object3D();
    goneClone.userData[EDITOR_SOURCE_UUID_KEY] = gone.uuid;
    cloneParent.add(keepClone);
    cloneParent.add(goneClone);

    const disposeCloneObject = vi.fn();
    const createSubtreeClone = vi.fn((worldObject: THREE.Object3D) => {
      const clone = new THREE.Object3D();
      clone.userData[EDITOR_SOURCE_UUID_KEY] = worldObject.uuid;
      return clone;
    });

    reconcileViewportCloneSubtree(worldParent, cloneParent, {
      shouldAppearInClone: () => true,
      createSubtreeClone,
      disposeCloneObject,
      syncCloneTransform: (worldObject, cloneObject) => {
        cloneObject.position.copy(worldObject.position);
      },
    });

    expect(disposeCloneObject).toHaveBeenCalledWith(goneClone);
    expect(createSubtreeClone).toHaveBeenCalledWith(added);
    expect(cloneParent.children.map((child) => child.userData[EDITOR_SOURCE_UUID_KEY])).toEqual([
      keep.uuid,
      added.uuid,
    ]);
    expect(cloneParent.children[0]).toBe(keepClone);
  });
});

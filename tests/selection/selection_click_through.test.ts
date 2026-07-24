import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { SelectionManager } from '../../src/managers/selection_manager.js';
import { SelectionClickThrough } from '../../src/selection/selection_click_through.js';

/**
 * Unit tests for nested object click-through selection cycling.
 */
describe('SelectionClickThrough', () => {
  let selectionManager: SelectionManager;
  let outer: THREE.Mesh;
  let middle: THREE.Mesh;
  let inner: THREE.Mesh;

  beforeEach(() => {
    selectionManager = new SelectionManager();
    outer = createNamedMesh('outer');
    middle = createNamedMesh('middle');
    inner = createNamedMesh('inner');
  });

  it('selects the frontmost mesh when nothing is selected', () => {
    const picked = SelectionClickThrough.pickFromStack(
      [outer, middle, inner],
      selectionManager
    );
    expect(picked).toBe(outer);
  });

  it('cycles to the next mesh when the frontmost is already selected', () => {
    selectionManager.selectObject(outer);
    const picked = SelectionClickThrough.pickFromStack(
      [outer, middle, inner],
      selectionManager
    );
    expect(picked).toBe(middle);
  });

  it('cycles through the full stack and wraps to the front', () => {
    selectionManager.selectObject(inner);
    const picked = SelectionClickThrough.pickFromStack(
      [outer, middle, inner],
      selectionManager
    );
    expect(picked).toBe(outer);
  });

  it('returns null for an empty pick stack', () => {
    const picked = SelectionClickThrough.pickFromStack([], selectionManager);
    expect(picked).toBeNull();
  });

  it('returns the only mesh without requiring prior selection', () => {
    const picked = SelectionClickThrough.pickFromStack(
      [outer],
      selectionManager
    );
    expect(picked).toBe(outer);
  });

  it('dedupes raycast hits and resolves clone meshes to world meshes', () => {
    const cloneOuter = createNamedMesh('clone-outer');
    const cloneInner = createNamedMesh('clone-inner');
    const hits: THREE.Intersection[] = [
      { object: cloneOuter, distance: 1 } as THREE.Intersection,
      { object: cloneOuter, distance: 1.1 } as THREE.Intersection,
      { object: cloneInner, distance: 2 } as THREE.Intersection
    ];
    const resolve = (mesh: THREE.Mesh): THREE.Mesh => {
      if (mesh === cloneOuter) return outer;
      if (mesh === cloneInner) return inner;
      return mesh;
    };
    const stack = SelectionClickThrough.uniqueMeshesFromHits(hits, resolve);
    expect(stack).toEqual([outer, inner]);
  });
});

/**
 * Creates a named box mesh for pick-stack tests.
 * @param name Mesh display name.
 * @returns A simple mesh instance.
 */
function createNamedMesh(name: string): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial()
  );
  mesh.name = name;
  return mesh;
}

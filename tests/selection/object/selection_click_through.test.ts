import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { SelectionClickThrough } from '@/selection/object/selection_click_through.js';

/** Unit tests for nested object click-through selection cycling. */
describe('SelectionClickThrough', () => {
  let selectionManager: ManagerSelection;
  let outer: THREE.Mesh;
  let middle: THREE.Mesh;
  let inner: THREE.Mesh;

  beforeEach(() => {
    SelectionClickThrough.resetClickThrough();
    selectionManager = new ManagerSelection();
    outer = createNamedMesh('outer');
    middle = createNamedMesh('middle');
    inner = createNamedMesh('inner');
  });

  it('selects the frontmost mesh when nothing is selected', () => {
    const picked = SelectionClickThrough.pickFromStack([outer, middle, inner], selectionManager, 10, 20);
    expect(picked).toBe(outer);
  });

  it('cycles to the next mesh when clicking the same position again', () => {
    selectionManager.selectObject(outer);
    const first = SelectionClickThrough.pickFromStack([outer, middle, inner], selectionManager, 10, 20);
    expect(first).toBe(middle);
    selectionManager.selectObject(middle);
    const second = SelectionClickThrough.pickFromStack([outer, middle, inner], selectionManager, 10, 20);
    expect(second).toBe(inner);
  });

  it('cycles through the full stack and wraps to the front at the same position', () => {
    selectionManager.selectObject(inner);
    SelectionClickThrough.pickFromStack([outer, middle, inner], selectionManager, 5, 5);
    selectionManager.selectObject(outer);
    const picked = SelectionClickThrough.pickFromStack([outer, middle, inner], selectionManager, 5, 5);
    expect(picked).toBe(middle);
  });

  it('restarts at the frontmost mesh when the mouse position changes', () => {
    selectionManager.selectObject(outer);
    SelectionClickThrough.pickFromStack([outer, middle, inner], selectionManager, 10, 20);
    selectionManager.selectObject(middle);
    const moved = SelectionClickThrough.pickFromStack([outer, middle, inner], selectionManager, 50, 60);
    expect(moved).toBe(outer);
  });

  it('click-through continues when the frontmost is already selected after a move', () => {
    selectionManager.selectObject(outer);
    SelectionClickThrough.pickFromStack([outer, middle, inner], selectionManager, 10, 20);
    selectionManager.selectObject(middle);
    const reclickFront = SelectionClickThrough.pickFromStack([middle, outer, inner], selectionManager, 99, 99);
    expect(reclickFront).toBe(outer);
  });

  it('resetClickThrough forces a frontmost pick unless front is already selected', () => {
    selectionManager.selectObject(outer);
    SelectionClickThrough.pickFromStack([outer, middle, inner], selectionManager, 10, 20);
    selectionManager.selectObject(middle);
    SelectionClickThrough.resetClickThrough();
    const afterResetDifferentFront = SelectionClickThrough.pickFromStack(
      [outer, middle, inner],
      selectionManager,
      10,
      20,
    );
    expect(afterResetDifferentFront).toBe(outer);
    selectionManager.selectObject(outer);
    SelectionClickThrough.resetClickThrough();
    const afterResetFrontSelected = SelectionClickThrough.pickFromStack(
      [outer, middle, inner],
      selectionManager,
      10,
      20,
    );
    expect(afterResetFrontSelected).toBe(middle);
  });

  it('returns null for an empty pick stack', () => {
    const picked = SelectionClickThrough.pickFromStack([], selectionManager, 0, 0);
    expect(picked).toBeNull();
  });

  it('returns the only mesh without requiring prior selection', () => {
    const picked = SelectionClickThrough.pickFromStack([outer], selectionManager, 1, 1);
    expect(picked).toBe(outer);
  });

  it('dedupes raycast hits and resolves clone meshes to world meshes', () => {
    const cloneOuter = createNamedMesh('clone-outer');
    const cloneInner = createNamedMesh('clone-inner');
    const hits: THREE.Intersection[] = [
      { object: cloneOuter, distance: 1 } as unknown as THREE.Intersection,
      { object: cloneOuter, distance: 1.1 } as unknown as THREE.Intersection,
      { object: cloneInner, distance: 2 } as unknown as THREE.Intersection,
    ];
    const resolve = (mesh: THREE.Mesh): THREE.Mesh => {
      if (mesh === cloneOuter) return outer;
      if (mesh === cloneInner) return inner;
      return mesh;
    };
    const stack = SelectionClickThrough.uniqueMeshesFromHits(hits, resolve);
    expect(stack).toEqual([outer, inner]);
  });

  it('alternates wall and doorway without cycling room brushes behind', () => {
    const wall = createNamedMesh('wall');
    const doorway = createNamedMesh('doorway');
    const room = createNamedMesh('room');
    selectionManager.selectObject(wall);
    SelectionClickThrough.pickFromStack([wall, room], selectionManager, 10, 10);
    selectionManager.selectObject(room);
    const doorwayPick = SelectionClickThrough.pickFromStack([doorway, wall, room], selectionManager, 40, 40);
    expect(doorwayPick).toBe(doorway);
    selectionManager.selectObject(doorway);
    const wallAgain = SelectionClickThrough.pickFromStack([wall, doorway, room], selectionManager, 10, 10);
    expect(wallAgain).toBe(wall);
  });
});

/**
 * Creates a named box mesh for pick-stack tests.
 *
 * @param name Mesh display name.
 * @returns A simple mesh instance.
 */
function createNamedMesh(name: string): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  mesh.name = name;
  return mesh;
}

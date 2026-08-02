import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { ManagerSelection } from '@/selection/object/manager_selection.js';
import { SelectionClickThrough } from '@/selection/object/selection_click_through.js';
import {
  orderMeshesByReverseOutlinerOrder,
  orderObjectPickStackForViewport,
} from '@/selection/object/selection_pick_order_2d.js';

/** Unit tests for 2D reverse-outliner object pick ordering. */
describe('selection_pick_order_2d', () => {
  let world: THREE.Group;
  let room: THREE.Mesh;
  let cube: THREE.Mesh;
  let prop: THREE.Mesh;

  beforeEach(() => {
    SelectionClickThrough.resetClickThrough();
    world = new THREE.Group();
    room = createNamedMesh('room');
    cube = createNamedMesh('cube');
    prop = createNamedMesh('prop');
    world.add(room);
    world.add(cube);
    world.add(prop);
  });

  it('orders hit meshes last-to-first by outliner sibling order', () => {
    const depthOrder = [room, prop, cube];
    const ordered = orderMeshesByReverseOutlinerOrder(depthOrder);
    expect(ordered).toEqual([prop, cube, room]);
  });

  it('prefers a later outliner mesh even when it is nearer in depth order', () => {
    const nearRoomFarCubeDepth = [room, cube];
    const ordered = orderObjectPickStackForViewport(nearRoomFarCubeDepth, true);
    expect(ordered[0]).toBe(cube);
    expect(ordered[1]).toBe(room);
  });

  it('leaves perspective (3D) near-to-far stacks unchanged', () => {
    const depthOrder = [room, cube, prop];
    const ordered = orderObjectPickStackForViewport(depthOrder, false);
    expect(ordered).toBe(depthOrder);
    expect(ordered).toEqual([room, cube, prop]);
  });

  it('2D click-through cycles reverse outliner order at the same position', () => {
    const selectionManager = new ManagerSelection();
    const ordered = orderObjectPickStackForViewport([room, cube, prop], true);
    expect(ordered).toEqual([prop, cube, room]);
    const first = SelectionClickThrough.pickFromStack(ordered, selectionManager, 10, 20);
    expect(first).toBe(prop);
    selectionManager.selectObject(prop);
    const second = SelectionClickThrough.pickFromStack(ordered, selectionManager, 10, 20);
    expect(second).toBe(cube);
    selectionManager.selectObject(cube);
    const third = SelectionClickThrough.pickFromStack(ordered, selectionManager, 10, 20);
    expect(third).toBe(room);
  });

  it('2D nested hierarchy prefers the last outliner leaf under the parent', () => {
    const solidRoot = new THREE.Group();
    solidRoot.name = 'solid';
    const shell = createNamedMesh('shell');
    const subtract = createNamedMesh('subtract');
    const furniture = createNamedMesh('furniture');
    world.clear();
    world.add(solidRoot);
    solidRoot.add(shell);
    solidRoot.add(subtract);
    world.add(furniture);
    const depthOrder = [shell, furniture, subtract];
    const ordered = orderMeshesByReverseOutlinerOrder(depthOrder);
    expect(ordered).toEqual([furniture, subtract, shell]);
  });
});

/**
 * Creates a named box mesh for outliner order tests.
 *
 * @param name Mesh display name.
 * @returns A simple mesh instance.
 */
function createNamedMesh(name: string): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  mesh.name = name;
  return mesh;
}

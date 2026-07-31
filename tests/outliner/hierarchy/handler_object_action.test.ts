import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CommandStack } from '@/commands/command_stack.js';
import { HandlerObjectAction } from '@/outliner/hierarchy/handler_object_action.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';

describe('HandlerObjectAction grouping selection', () => {
  let world: THREE.Group;
  let commandStack: CommandStack;
  let selectionManager: ManagerSelection;
  let handler: HandlerObjectAction;

  beforeEach(() => {
    world = new THREE.Group();
    world.name = 'World';
    commandStack = new CommandStack(64);
    selectionManager = new ManagerSelection();
    handler = new HandlerObjectAction(world, commandStack, selectionManager);
  });

  /**
   * Builds a mesh with a box geometry and basic material.
   *
   * @param name Mesh name.
   * @returns Created mesh.
   */
  function createNamedMesh(name: string): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.name = name;
    return mesh;
  }

  it('should select the new group after grouping an existing group', () => {
    const innerGroup = new THREE.Group();
    innerGroup.name = 'InnerGroup';
    const childMesh = createNamedMesh('ChildMesh');
    innerGroup.add(childMesh);
    world.add(innerGroup);
    selectionManager.setSelection([childMesh], [innerGroup]);
    handler.groupObjects([innerGroup]);
    const createdGroup = world.children[0] as THREE.Group;
    expect(createdGroup).toBeInstanceOf(THREE.Group);
    expect(createdGroup).not.toBe(innerGroup);
    expect(createdGroup.children).toContain(innerGroup);
    expect(selectionManager.getInspectorObjects()).toEqual([createdGroup]);
    expect(selectionManager.getAllSelectedObjectsAsArray()).toEqual([childMesh]);
  });

  it('should select the new group when grouping multiple meshes', () => {
    const meshA = createNamedMesh('MeshA');
    const meshB = createNamedMesh('MeshB');
    world.add(meshA);
    world.add(meshB);
    selectionManager.setSelection([meshA, meshB], [meshA, meshB]);
    handler.groupObjects([meshA, meshB]);
    const createdGroup = world.children[0] as THREE.Group;
    expect(createdGroup.children).toContain(meshA);
    expect(createdGroup.children).toContain(meshB);
    expect(selectionManager.getInspectorObjects()).toEqual([createdGroup]);
    const selectedMeshes = selectionManager.getAllSelectedObjectsAsArray();
    expect(selectedMeshes).toContain(meshA);
    expect(selectedMeshes).toContain(meshB);
    expect(selectedMeshes).toHaveLength(2);
  });

  it('should select the outer group when nesting a group that already has a child group', () => {
    const leafMesh = createNamedMesh('Leaf');
    const midGroup = new THREE.Group();
    midGroup.name = 'Mid';
    midGroup.add(leafMesh);
    const outerExisting = new THREE.Group();
    outerExisting.name = 'ExistingOuter';
    outerExisting.add(midGroup);
    world.add(outerExisting);
    selectionManager.setSelection([leafMesh], [outerExisting]);
    handler.groupObjects([outerExisting]);
    const newOuter = world.children[0] as THREE.Group;
    expect(newOuter.children).toContain(outerExisting);
    expect(selectionManager.getInspectorObjects()).toEqual([newOuter]);
    expect(selectionManager.getInspectorObjects()[0]).not.toBe(outerExisting);
  });
});

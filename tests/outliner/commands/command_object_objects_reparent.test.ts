import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CommandObjectObjectsReparent } from '@/outliner/commands/command_object_objects_reparent.js';
import { CommandStack } from '@/commands/command_stack.js';

describe('CommandObjectObjectsReparent', () => {
  let world: THREE.Group;
  let group: THREE.Group;
  let meshA: THREE.Mesh;
  let meshB: THREE.Mesh;

  beforeEach(() => {
    world = new THREE.Group();
    group = new THREE.Group();
    group.name = 'Group';
    meshA = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    meshA.name = 'MeshA';
    meshB = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    meshB.name = 'MeshB';
    world.add(meshA);
    world.add(meshB);
    world.add(group);
  });

  it('should move every listed object into the destination parent', () => {
    const command = new CommandObjectObjectsReparent([
      { object: meshA, newParent: group, insertBefore: null },
      { object: meshB, newParent: group, insertBefore: null },
    ]);
    command.execute();
    expect(meshA.parent).toBe(group);
    expect(meshB.parent).toBe(group);
    expect(group.children.indexOf(meshA)).toBeLessThan(group.children.indexOf(meshB));
  });

  it('should undo all moves in reverse', () => {
    const command = new CommandObjectObjectsReparent([
      { object: meshA, newParent: group, insertBefore: null },
      { object: meshB, newParent: group, insertBefore: null },
    ]);
    command.execute();
    command.undo();
    expect(meshA.parent).toBe(world);
    expect(meshB.parent).toBe(world);
    expect(world.children.indexOf(meshA)).toBeLessThan(world.children.indexOf(meshB));
  });

  it('should support command stack undo and redo for the whole batch', () => {
    const stack = new CommandStack(16);
    stack.push(
      new CommandObjectObjectsReparent([
        { object: meshA, newParent: group, insertBefore: null },
        { object: meshB, newParent: group, insertBefore: null },
      ]),
    );
    expect(meshA.parent).toBe(group);
    expect(meshB.parent).toBe(group);
    stack.undo();
    expect(meshA.parent).toBe(world);
    expect(meshB.parent).toBe(world);
    stack.redo();
    expect(meshA.parent).toBe(group);
    expect(meshB.parent).toBe(group);
  });
});

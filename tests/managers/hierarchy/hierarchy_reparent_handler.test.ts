import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { HierarchyReparentHandler } from '../../../src/managers/hierarchy/hierarchy_reparent_handler.js';
import { CommandStack } from '../../../src/commands/command_stack.js';

describe('HierarchyReparentHandler', () => {
  let world: THREE.Group;
  let groupA: THREE.Group;
  let meshA: THREE.Mesh;
  let meshB: THREE.Mesh;
  let stack: CommandStack;
  let handler: HierarchyReparentHandler;

  beforeEach(() => {
    world = new THREE.Group();
    groupA = new THREE.Group();
    groupA.name = 'GroupA';
    meshA = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    meshA.name = 'MeshA';
    meshB = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    meshB.name = 'MeshB';
    world.add(groupA);
    world.add(meshA);
    world.add(meshB);
    stack = new CommandStack(16);
    handler = new HierarchyReparentHandler(world, stack);
  });

  it('should reparent a mesh into a group on drop', () => {
    handler.reparentFromDrop(meshA, groupA, 'into');
    expect(meshA.parent).toBe(groupA);
  });

  it('should reparent beside a mesh as a sibling before the target', () => {
    handler.reparentFromDrop(meshB, meshA, 'before');
    expect(meshB.parent).toBe(world);
    expect(world.children.indexOf(meshB)).toBeLessThan(world.children.indexOf(meshA));
  });

  it('should insert a mesh after the target when placement is after', () => {
    handler.reparentFromDrop(meshB, meshA, 'after');
    expect(meshB.parent).toBe(world);
    expect(world.children.indexOf(meshB)).toBeGreaterThan(world.children.indexOf(meshA));
  });

  it('should reorder a group as a sibling when dropping before another root child', () => {
    handler.reparentFromDrop(groupA, meshB, 'before');
    expect(groupA.parent).toBe(world);
    expect(world.children.indexOf(groupA)).toBeLessThan(world.children.indexOf(meshB));
  });

  it('should reject dropping a parent onto its own descendant', () => {
    handler.reparentFromDrop(meshA, groupA);
    handler.reparentFromDrop(groupA, meshA);
    expect(groupA.parent).toBe(world);
  });

  it('should call sync and refresh callbacks', () => {
    const sync = vi.fn();
    const refresh = vi.fn();
    handler.setSyncViewports(sync);
    handler.setRefreshOutliner(refresh);
    handler.reparentFromDrop(meshA, groupA);
    expect(sync).toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
  });

  it('should support undo of reparent', () => {
    handler.reparentFromDrop(meshA, groupA);
    expect(meshA.parent).toBe(groupA);
    stack.undo();
    expect(meshA.parent).toBe(world);
  });

  it('should reparent every multi-selected object into a group on one drop', () => {
    handler.reparentFromDrop([meshA, meshB], groupA, 'into');
    expect(meshA.parent).toBe(groupA);
    expect(meshB.parent).toBe(groupA);
    expect(groupA.children.indexOf(meshA)).toBeLessThan(groupA.children.indexOf(meshB));
  });

  it('should undo multi-reparent as a single stack entry', () => {
    handler.reparentFromDrop([meshA, meshB], groupA, 'into');
    expect(stack.getUndoCount()).toBe(1);
    stack.undo();
    expect(meshA.parent).toBe(world);
    expect(meshB.parent).toBe(world);
  });

  it('should preserve scene order when multi-drop receives reverse selection order', () => {
    handler.reparentFromDrop([meshB, meshA], groupA, 'into');
    expect(groupA.children.indexOf(meshA)).toBeLessThan(groupA.children.indexOf(meshB));
  });
});

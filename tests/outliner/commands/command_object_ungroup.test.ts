import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CommandObjectUngroup } from '@/outliner/commands/command_object_ungroup.js';
import { CommandStack } from '@/commands/command_stack.js';

describe('CommandObjectUngroup', () => {
  let parent: THREE.Group;
  let group: THREE.Group;
  let mesh1: THREE.Mesh;
  let mesh2: THREE.Mesh;

  beforeEach(() => {
    parent = new THREE.Group();
    group = new THREE.Group();
    group.name = 'TestGroup';
    mesh1 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh1.name = 'Mesh1';
    mesh2 = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 8), new THREE.MeshBasicMaterial());
    mesh2.name = 'Mesh2';
    group.add(mesh1);
    group.add(mesh2);
    parent.add(group);
  });

  it('should execute and move children to parent', () => {
    const command = new CommandObjectUngroup(group);
    command.execute();
    expect(parent.children.length).toBe(2);
    expect(parent.children).toContain(mesh1);
    expect(parent.children).toContain(mesh2);
    expect(group.children.length).toBe(0);
    expect(group.parent).toBeNull();
  });

  it('should insert children where the group was, not at the end', () => {
    const before = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    before.name = 'Before';
    const after = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    after.name = 'After';
    parent.clear();
    parent.add(before);
    parent.add(group);
    parent.add(after);
    const command = new CommandObjectUngroup(group);
    command.execute();
    expect(parent.children.map((child) => child.name)).toEqual(['Before', 'Mesh1', 'Mesh2', 'After']);
  });

  it('should undo and restore group structure', () => {
    const command = new CommandObjectUngroup(group);
    command.execute();
    command.undo();
    expect(parent.children.length).toBe(1);
    expect(parent.children[0]).toBe(group);
    expect(group.children.length).toBe(2);
    expect(group.children[0]).toBe(mesh1);
    expect(group.children[1]).toBe(mesh2);
  });

  it('should redo and re-ungroup children', () => {
    const command = new CommandObjectUngroup(group);
    command.execute();
    command.undo();
    command.execute();
    expect(parent.children.length).toBe(2);
    expect(group.parent).toBeNull();
  });

  it('should work with command stack for full undo/redo cycle', () => {
    const stack = new CommandStack(64);
    const command = new CommandObjectUngroup(group);
    stack.push(command);
    expect(parent.children.length).toBe(2);
    stack.undo();
    expect(parent.children.length).toBe(1);
    expect(parent.children[0]).toBe(group);
    stack.redo();
    expect(parent.children.length).toBe(2);
  });

  it('should ungroup single child group', () => {
    const singleGroup = new THREE.Group();
    const singleMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    singleMesh.name = 'SingleMesh';
    singleGroup.add(singleMesh);
    parent.add(singleGroup);
    const command = new CommandObjectUngroup(singleGroup);
    command.execute();
    expect(parent.children.length).toBe(2);
    expect(parent.children).toContain(singleMesh);
    expect(singleGroup.children.length).toBe(0);
  });

  it('should handle group with no parent', () => {
    const orphanGroup = new THREE.Group();
    const orphanMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    orphanMesh.name = 'OrphanMesh';
    orphanGroup.add(orphanMesh);
    const command = new CommandObjectUngroup(orphanGroup);
    command.execute();
    expect(orphanMesh.parent).toBeNull();
    command.undo();
    expect(orphanMesh.parent).toBe(orphanGroup);
  });

  it('should preserve object transforms on ungroup/group', () => {
    mesh1.position.set(5, 10, 15);
    const command = new CommandObjectUngroup(group);
    command.execute();
    command.undo();
    expect(mesh1.position.x).toBe(5);
    expect(mesh1.position.y).toBe(10);
    expect(mesh1.position.z).toBe(15);
  });

  it('should return the group via getGroup method', () => {
    const command = new CommandObjectUngroup(group);
    const returnedGroup = command.getGroup();
    expect(returnedGroup).toBe(group);
  });

  it('should not execute twice', () => {
    const command = new CommandObjectUngroup(group);
    command.execute();
    command.execute();
    expect(parent.children.length).toBe(2);
    expect(group.parent).toBeNull();
  });

  it('should no-op undo when execute has not run', () => {
    const command = new CommandObjectUngroup(group);
    command.undo();
    expect(parent.children.length).toBe(1);
    expect(parent.children[0]).toBe(group);
    expect(parent.children.filter((child) => child === group).length).toBe(1);
    expect(group.children.length).toBe(2);
  });
});

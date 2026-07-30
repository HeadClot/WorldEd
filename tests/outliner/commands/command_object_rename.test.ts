import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CommandObjectRename } from '@/outliner/commands/command_object_rename.js';
import { CommandStack } from '@/commands/command_stack.js';

describe('CommandObjectRename', () => {
  let mesh: THREE.Mesh;

  beforeEach(() => {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.name = 'OriginalName';
  });

  it('should execute and change the object name', () => {
    const command = new CommandObjectRename(mesh, 'NewName');
    command.execute();
    expect(mesh.name).toBe('NewName');
  });

  it('should undo and restore the original name', () => {
    const command = new CommandObjectRename(mesh, 'NewName');
    command.execute();
    command.undo();
    expect(mesh.name).toBe('OriginalName');
  });

  it('should redo and apply the new name again', () => {
    const command = new CommandObjectRename(mesh, 'NewName');
    command.execute();
    command.undo();
    command.execute();
    expect(mesh.name).toBe('NewName');
  });

  it('should work with command stack for full undo/redo cycle', () => {
    const stack = new CommandStack(64);
    const command = new CommandObjectRename(mesh, 'StackName');
    stack.push(command);
    expect(mesh.name).toBe('StackName');
    stack.undo();
    expect(mesh.name).toBe('OriginalName');
    stack.redo();
    expect(mesh.name).toBe('StackName');
  });

  it('should handle renaming a group', () => {
    const group = new THREE.Group();
    group.name = 'OriginalGroup';
    const command = new CommandObjectRename(group, 'RenamedGroup');
    command.execute();
    expect(group.name).toBe('RenamedGroup');
    command.undo();
    expect(group.name).toBe('OriginalGroup');
  });

  it('should handle renaming to empty string', () => {
    const command = new CommandObjectRename(mesh, '');
    command.execute();
    expect(mesh.name).toBe('');
    command.undo();
    expect(mesh.name).toBe('OriginalName');
  });

  it('should preserve identity of the object', () => {
    const originalUuid = mesh.uuid;
    const command = new CommandObjectRename(mesh, 'NewName');
    command.execute();
    expect(mesh.uuid).toBe(originalUuid);
  });

  it('should handle renaming object with no previous name', () => {
    const unnamed = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    const command = new CommandObjectRename(unnamed, 'NowNamed');
    command.execute();
    expect(unnamed.name).toBe('NowNamed');
    command.undo();
    expect(unnamed.name).toBe('');
  });
});

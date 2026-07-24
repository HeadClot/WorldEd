import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CsgActionHandler } from '../../src/managers/csg_action_handler.js';
import { SelectionManager } from '../../src/managers/selection_manager.js';
import { CommandStack } from '../../src/commands/command_stack.js';
import { CsgOperation } from '../../src/csg/csg_boolean_ops.js';
import { SOLID_BRUSH_USERDATA_KEY } from '../../src/solid/model/solid_brush_visual.js';
import { SOLID_MODEL_RESULT_USERDATA_KEY } from '../../src/solid/model/solid_model.js';

describe('CsgActionHandler', () => {
  let world: THREE.Group;
  let selectionManager: SelectionManager;
  let commandStack: CommandStack;
  let handler: CsgActionHandler;
  let statusMessages: string[];

  beforeEach(() => {
    world = new THREE.Group();
    selectionManager = new SelectionManager();
    commandStack = new CommandStack(32);
    handler = new CsgActionHandler(world, commandStack, selectionManager);
    statusMessages = [];
    handler.setShowStatus((message) => {
      statusMessages.push(message);
    });
  });

  it('allows mesh CSG when two regular meshes are selected', () => {
    const meshA = createRegularMesh('A');
    const meshB = createRegularMesh('B');
    world.add(meshA);
    world.add(meshB);
    selectionManager.setSelection([meshA, meshB]);
    expect(handler.canRunMeshBoolean()).toBe(true);
    const childCountBefore = world.children.length;
    handler.runBoolean(CsgOperation.UNION);
    expect(world.children.length).toBeGreaterThan(childCountBefore - 2);
    expect(commandStack.getUndoCount()).toBe(1);
  });

  it('disables mesh CSG when solid brushes are selected', () => {
    const brushA = createBrushMesh('BrushA');
    const brushB = createBrushMesh('BrushB');
    world.add(brushA);
    world.add(brushB);
    selectionManager.setSelection([brushA, brushB]);
    expect(handler.canRunMeshBoolean()).toBe(false);
    const childCountBefore = world.children.length;
    handler.runBoolean(CsgOperation.UNION);
    expect(world.children.length).toBe(childCountBefore);
    expect(commandStack.getUndoCount()).toBe(0);
    expect(statusMessages.some((message) => message.includes('solid brushes'))).toBe(
      true
    );
  });

  it('disables mesh CSG when a solid result mesh is selected', () => {
    const resultA = createResultMesh('ResultA');
    const resultB = createResultMesh('ResultB');
    world.add(resultA);
    world.add(resultB);
    selectionManager.setSelection([resultA, resultB]);
    expect(handler.canRunMeshBoolean()).toBe(false);
    handler.runBoolean(CsgOperation.SUBTRACT);
    expect(commandStack.getUndoCount()).toBe(0);
    expect(statusMessages.some((message) => message.includes('solid model results'))).toBe(
      true
    );
  });

  it('disables mesh CSG when selection mixes regular and brush meshes', () => {
    const regular = createRegularMesh('Cube');
    const brush = createBrushMesh('Brush');
    world.add(regular);
    world.add(brush);
    selectionManager.setSelection([regular, brush]);
    expect(handler.canRunMeshBoolean()).toBe(false);
    handler.runBoolean(CsgOperation.INTERSECT);
    expect(commandStack.getUndoCount()).toBe(0);
  });

  it('disables mesh CSG when fewer than two meshes are selected', () => {
    const mesh = createRegularMesh('OnlyOne');
    world.add(mesh);
    selectionManager.setSelection([mesh]);
    expect(handler.canRunMeshBoolean()).toBe(false);
    handler.runBoolean(CsgOperation.UNION);
    expect(commandStack.getUndoCount()).toBe(0);
  });
});

/**
 * Creates a regular content mesh eligible for mesh CSG.
 * @param name Mesh name.
 * @returns Configured mesh.
 */
function createRegularMesh(name: string): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh.name = name;
  return mesh;
}

/**
 * Creates a solid brush helper mesh marked with brush userData.
 * @param name Mesh name.
 * @returns Brush-marked mesh.
 */
function createBrushMesh(name: string): THREE.Mesh {
  const mesh = createRegularMesh(name);
  mesh.userData[SOLID_BRUSH_USERDATA_KEY] = true;
  return mesh;
}

/**
 * Creates a solid model result mesh marked with result userData.
 * @param name Mesh name.
 * @returns Result-marked mesh.
 */
function createResultMesh(name: string): THREE.Mesh {
  const mesh = createRegularMesh(name);
  mesh.userData[SOLID_MODEL_RESULT_USERDATA_KEY] = true;
  return mesh;
}

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { FaceExtrusionController } from '../../../src/managers/face/face_extrusion_controller.js';
import { SelectionMode } from '../../../src/types/selection_mode.js';
import { CommandStack } from '../../../src/commands/command_stack.js';
import { GridSnap } from '../../../src/transform/snap/grid_snap.js';
import { SolidModel } from '../../../src/solid/model/solid_model.js';
import { SolidOperation } from '../../../src/solid/types/solid_operation.js';
import { SolidBrushVisual } from '../../../src/solid/model/solid_brush_visual.js';
import { SOLID_TRIANGLE_SOURCES_USERDATA_KEY } from '../../../src/solid/model/solid_model_keys.js';

/**
 * Face extrude must create solid brushes from solid result faces and regular
 * meshes from ordinary mesh faces, including mixed selections.
 */
describe('FaceExtrusionController solid brush extrude', () => {
  let scene: THREE.Scene;
  let world: THREE.Group;
  let commandStack: CommandStack;
  let controller: FaceExtrusionController;

  beforeEach(() => {
    scene = new THREE.Scene();
    world = new THREE.Group();
    commandStack = new CommandStack(64);
    controller = new FaceExtrusionController(scene, commandStack, new GridSnap(false, 1.0), world);
  });

  it('should create a solid brush when extruding a solid result face', () => {
    const model = createSolidWithBox(world, 2);
    const resultMesh = model.getResultMesh();
    const seedFace = findSolidSeedTriangle(resultMesh);
    controller.setAvailableMeshes([resultMesh]);
    controller.setSelectionMode(SelectionMode.FACE);
    controller.selectFace(resultMesh, seedFace, false);
    const brushCountBefore = model.getBrushCount();
    const created = controller.extrudeSelectedFaces(1.0);
    expect(created.length).toBe(1);
    expect(SolidBrushVisual.isBrushObject(created[0]!)).toBe(true);
    expect(model.getBrushCount()).toBe(brushCountBefore + 1);
    expect(world.children.includes(created[0]!)).toBe(false);
    expect(model.root.children.includes(created[0]!)).toBe(true);
  });

  it('should leave ordinary mesh extrude as a free mesh under the world root', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    world.add(mesh);
    controller.setAvailableMeshes([mesh]);
    controller.setSelectionMode(SelectionMode.FACE);
    controller.selectFace(mesh, 0, false);
    const created = controller.extrudeSelectedFaces(1.0);
    expect(created.length).toBe(1);
    expect(SolidBrushVisual.isBrushObject(created[0]!)).toBe(false);
    expect(world.children.includes(created[0]!)).toBe(true);
  });

  it('should create brush and mesh products for mixed face selection', () => {
    const model = createSolidWithBox(world, 2);
    const resultMesh = model.getResultMesh();
    const ordinary = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    ordinary.position.set(5, 0, 0);
    world.add(ordinary);
    controller.setAvailableMeshes([resultMesh, ordinary]);
    controller.setSelectionMode(SelectionMode.FACE);
    controller.selectFace(resultMesh, findSolidSeedTriangle(resultMesh), false);
    controller.selectFace(ordinary, 0, true);
    const brushCountBefore = model.getBrushCount();
    const created = controller.extrudeSelectedFaces(1.0);
    expect(created.length).toBe(2);
    const brushMeshes = created.filter((mesh) => SolidBrushVisual.isBrushObject(mesh));
    const freeMeshes = created.filter((mesh) => !SolidBrushVisual.isBrushObject(mesh));
    expect(brushMeshes.length).toBe(1);
    expect(freeMeshes.length).toBe(1);
    expect(model.getBrushCount()).toBe(brushCountBefore + 1);
    expect(world.children.includes(freeMeshes[0]!)).toBe(true);
  });

  it('should undo solid brush extrude by removing the new brush', () => {
    const model = createSolidWithBox(world, 2);
    const resultMesh = model.getResultMesh();
    controller.setAvailableMeshes([resultMesh]);
    controller.setSelectionMode(SelectionMode.FACE);
    controller.selectFace(resultMesh, findSolidSeedTriangle(resultMesh), false);
    const brushCountBefore = model.getBrushCount();
    const created = controller.extrudeSelectedFaces(1.0);
    expect(model.getBrushCount()).toBe(brushCountBefore + 1);
    commandStack.undo();
    expect(model.getBrushCount()).toBe(brushCountBefore);
    expect(model.root.children.includes(created[0]!)).toBe(false);
  });

  it('should inherit the source brush CSG operation', () => {
    const model = new SolidModel('OpInheritSolid');
    world.add(model.root);
    model.addBoxBrush(4, SolidOperation.Additive);
    const subtractive = model.addBoxBrush(2, SolidOperation.Subtractive);
    model.rebuild(true);
    const resultMesh = model.getResultMesh();
    const seedFace = findSolidSeedTriangleForBrush(resultMesh, subtractive.id);
    controller.setAvailableMeshes([resultMesh]);
    controller.setSelectionMode(SelectionMode.FACE);
    controller.selectFace(resultMesh, seedFace, false);
    const created = controller.extrudeSelectedFaces(1.0);
    expect(created.length).toBe(1);
    const newBrush = model.findBrushByMesh(created[0]!);
    expect(newBrush).toBeDefined();
    expect(newBrush!.operation).toBe(SolidOperation.Subtractive);
  });
});

/**
 * Creates a solid model with one additive box brush under the world root.
 *
 * @param world Scene world group.
 * @param size Box edge length.
 * @returns Configured solid model.
 */
function createSolidWithBox(world: THREE.Group, size: number): SolidModel {
  const model = new SolidModel('ExtrudeSolid');
  world.add(model.root);
  model.addBoxBrush(size, SolidOperation.Additive);
  model.rebuild(true);
  return model;
}

/**
 * Finds the first result triangle that still has solid source metadata.
 *
 * @param resultMesh Solid CSG result mesh.
 * @returns Triangle index with valid brush source.
 */
function findSolidSeedTriangle(resultMesh: THREE.Mesh): number {
  const sources = readTriangleSources(resultMesh);
  for (let index = 0; index < sources.length; index++) {
    const source = sources[index];
    if (source?.brushId && typeof source.surfaceIndex === 'number') {
      return index;
    }
  }
  throw new Error('No solid triangle source found on result mesh');
}

/**
 * Finds the first result triangle authored by a specific brush.
 *
 * @param resultMesh Solid CSG result mesh.
 * @param brushId Brush instance id.
 * @returns Triangle index owned by that brush.
 */
function findSolidSeedTriangleForBrush(resultMesh: THREE.Mesh, brushId: string): number {
  const sources = readTriangleSources(resultMesh);
  for (let index = 0; index < sources.length; index++) {
    const source = sources[index];
    if (source?.brushId === brushId && typeof source.surfaceIndex === 'number') {
      return index;
    }
  }
  throw new Error(`No solid triangle source found for brush ${brushId}`);
}

/**
 * Reads solid triangle sources from a result mesh.
 *
 * @param resultMesh Solid CSG result mesh.
 * @returns Source table.
 */
function readTriangleSources(resultMesh: THREE.Mesh): Array<{ brushId?: string; surfaceIndex?: number }> {
  const sources = resultMesh.userData[SOLID_TRIANGLE_SOURCES_USERDATA_KEY] as
    Array<{ brushId?: string; surfaceIndex?: number }> | undefined;
  if (!Array.isArray(sources) || sources.length === 0) {
    throw new Error('Solid result mesh is missing triangle sources');
  }
  return sources;
}

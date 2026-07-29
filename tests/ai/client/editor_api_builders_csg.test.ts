import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { EditorApi } from '../../../src/ai/client/editor_api.js';
import type { EditorApiHost } from '../../../src/ai/client/editor_api_host.js';
import { CommandStack } from '../../../src/commands/command_stack.js';
import { SelectionManager } from '../../../src/selection/object/selection_manager.js';
import { SolidModel } from '../../../src/solid/model/solid_model.js';
import { SolidOperation } from '../../../src/solid/types/solid_operation.js';
import { CreateSolidModelCommand } from '../../../src/commands/create/create_solid_model_command.js';
import { GridSnap } from '../../../src/transform/snap/grid_snap.js';
import { SnapManager } from '../../../src/transform/snap/snap_manager.js';
import { SolidModelController } from '../../../src/managers/solid/solid_model_controller.js';
import { SolidModelPanel } from '../../../src/ui/solid_model_panel.js';

/**
 * Builds a write-capable EditorApi fixture with an empty world.
 *
 * @returns Api and command stack.
 */
function createApi(): { api: EditorApi; world: THREE.Group; stack: CommandStack } {
  const world = new THREE.Group();
  const stack = new CommandStack(64);
  const selection = new SelectionManager();
  const panelHost = document.createElement('div');
  const panel = new SolidModelPanel(panelHost, { onAddBoxBrush: () => undefined });
  const solidModelController = new SolidModelController(world, stack, selection, panel);
  const host: EditorApiHost = {
    worldObject: world,
    commandStack: stack,
    selectionManager: selection,
    solidModelController,
    gridSnap: new GridSnap(true, 0.25),
    snapManager: new SnapManager(0.25),
    getUserSnapEnabled: () => true,
    refreshAfterWorldMutation: () => undefined,
    refreshOutliner: () => undefined,
    showStatus: () => undefined,
  };
  return { api: new EditorApi(host), world, stack };
}

/**
 * Creates a solid model already in the world.
 *
 * @param world World group.
 * @param stack Command stack.
 * @param name Model name.
 * @returns Model instance.
 */
function pushModel(world: THREE.Group, stack: CommandStack, name: string): SolidModel {
  const model = new SolidModel(name);
  model.addBoxBrush(1, SolidOperation.Additive);
  stack.push(new CreateSolidModelCommand(model, world));
  return model;
}

/** Unit tests for builders, CSG explain, half extents, and relative reorder. */
describe('EditorApi builders and csg helpers', () => {
  it('returns half extents and face centers', () => {
    const { api, world, stack } = createApi();
    const model = pushModel(world, stack, 'HalfModel');
    const brush = model.getBrushes()[0]!;
    brush.scale.set(2, 4, 6);
    brush.pushTransformToMesh();
    model.rebuild(true);
    const result = api.invokeTool('half_extents', { brushId: brush.id });
    expect(result.ok).toBe(true);
    const data = result.data as {
      halfExtents: { x: number; y: number; z: number };
      faceCenters: { plusY: { y: number } };
    };
    expect(data.halfExtents.x).toBeCloseTo(1, 2);
    expect(data.halfExtents.y).toBeCloseTo(2, 2);
    expect(data.halfExtents.z).toBeCloseTo(3, 2);
    expect(data.faceCenters.plusY.y).toBeGreaterThan(0);
  });

  it('previews a new box without creating it', () => {
    const { api, world, stack } = createApi();
    const model = pushModel(world, stack, 'PreviewModel');
    const before = model.getBrushCount();
    const result = api.invokeTool('preview_new_box', {
      modelId: model.root.uuid,
      size: { x: 2, y: 3, z: 4 },
      position: { x: 5, y: 1.5, z: 0 },
      snap: false,
    });
    expect(result.ok).toBe(true);
    expect(model.getBrushCount()).toBe(before);
    const data = result.data as { applied: boolean; worldSize: { y: number }; center: { x: number } };
    expect(data.applied).toBe(false);
    expect(data.worldSize.y).toBeCloseTo(3, 2);
    expect(data.center.x).toBeCloseTo(5, 2);
  });

  it('places a wall between two XZ points with correct center and yaw', () => {
    const { api, world, stack } = createApi();
    const model = pushModel(world, stack, 'WallModel');
    const before = model.getBrushCount();
    const result = api.invokeTool('place_wall', {
      modelId: model.root.uuid,
      from: { x: 0, z: 0 },
      to: { x: 10, z: 0 },
      height: 3,
      thickness: 0.5,
      name: 'north_wall',
      snap: false,
    });
    expect(result.ok).toBe(true);
    expect(model.getBrushCount()).toBe(before + 1);
    const wall = model.getBrushes().find((brush) => brush.name === 'north_wall');
    expect(wall).toBeTruthy();
    wall!.pullTransformFromMesh();
    expect(wall!.position.x).toBeCloseTo(5, 2);
    expect(wall!.position.y).toBeCloseTo(1.5, 2);
    expect(wall!.position.z).toBeCloseTo(0, 2);
    // Local +Z follows +X when yaw = 90°.
    expect(THREE.MathUtils.radToDeg(wall!.rotation.y)).toBeCloseTo(90, 1);
  });

  it('places a wall along +Z with zero yaw', () => {
    const { api, world, stack } = createApi();
    const model = pushModel(world, stack, 'WallZModel');
    api.invokeTool('place_wall', {
      modelId: model.root.uuid,
      from: { x: 2, z: -4 },
      to: { x: 2, z: 4 },
      height: 2,
      thickness: 0.4,
      baseY: 1,
      name: 'z_wall',
      snap: false,
    });
    const wall = model.getBrushes().find((brush) => brush.name === 'z_wall')!;
    wall.pullTransformFromMesh();
    expect(wall.position.x).toBeCloseTo(2, 2);
    expect(wall.position.y).toBeCloseTo(2, 2);
    expect(wall.position.z).toBeCloseTo(0, 2);
    expect(THREE.MathUtils.radToDeg(wall.rotation.y)).toBeCloseTo(0, 1);
  });

  it('builds a room shell with correct wall midplanes', () => {
    const { api, world, stack } = createApi();
    const model = pushModel(world, stack, 'RoomModel');
    const wallT = 0.25;
    const size = { x: 8, y: 3, z: 6 };
    const result = api.invokeTool('add_room_shell', {
      modelId: model.root.uuid,
      size,
      position: { x: 0, y: 1.5, z: 0 },
      wallThickness: wallT,
      name: 'lobby',
      snap: false,
    });
    expect(result.ok).toBe(true);
    const names = model.getBrushes().map((brush) => brush.name);
    expect(names.some((name) => name.includes('lobby_floor'))).toBe(true);
    const front = model.getBrushes().find((brush) => brush.name === 'lobby_wall_front')!;
    const back = model.getBrushes().find((brush) => brush.name === 'lobby_wall_back')!;
    const left = model.getBrushes().find((brush) => brush.name === 'lobby_wall_left')!;
    const right = model.getBrushes().find((brush) => brush.name === 'lobby_wall_right')!;
    front.pullTransformFromMesh();
    back.pullTransformFromMesh();
    left.pullTransformFromMesh();
    right.pullTransformFromMesh();
    expect(front.position.z).toBeCloseTo(size.z * 0.5 - wallT * 0.5, 3);
    expect(back.position.z).toBeCloseTo(-(size.z * 0.5 - wallT * 0.5), 3);
    expect(left.position.x).toBeCloseTo(-(size.x * 0.5 - wallT * 0.5), 3);
    expect(right.position.x).toBeCloseTo(size.x * 0.5 - wallT * 0.5, 3);
  });

  it('cuts a subtractive opening', () => {
    const { api, world, stack } = createApi();
    const model = pushModel(world, stack, 'CutModel');
    const result = api.invokeTool('cut_opening', {
      modelId: model.root.uuid,
      position: { x: 0, y: 1, z: 2 },
      size: { x: 1, y: 2, z: 0.5 },
      name: 'door_cut',
      snap: false,
    });
    expect(result.ok).toBe(true);
    const cut = model.getBrushes().find((brush) => brush.name === 'door_cut');
    expect(cut?.operation).toBe(SolidOperation.Subtractive);
  });

  it('places a door opening on a room wall midplane with correct CSG order', () => {
    const { api, world, stack } = createApi();
    const model = pushModel(world, stack, 'DoorModel');
    const wallT = 0.3;
    api.invokeTool('add_room_shell', {
      modelId: model.root.uuid,
      size: { x: 10, y: 3, z: 8 },
      position: { x: 0, y: 1.5, z: 0 },
      wallThickness: wallT,
      floorThickness: 0.2,
      ceilingThickness: 0.2,
      name: 'hall',
      snap: false,
      carveInterior: false,
    });
    const front = model.getBrushes().find((brush) => brush.name === 'hall_wall_front')!;
    front.pullTransformFromMesh();
    const doorWidth = 1.2;
    const doorHeight = 2.1;
    const sillHeight = 0.2;
    const result = api.invokeTool('add_opening', {
      modelId: model.root.uuid,
      kind: 'door',
      targetBrushId: front.id,
      position: { x: 1.5, y: 0, z: 99 },
      size: { width: doorWidth, height: doorHeight },
      sillHeight,
      addFrame: false,
      name: 'entry',
      snap: false,
    });
    expect(result.ok).toBe(true);
    const data = result.data as {
      center: { x: number; y: number; z: number };
      axis: string;
      depth: number;
      cutBrushId: string;
    };
    expect(data.axis).toBe('z');
    expect(data.depth).toBeCloseTo(wallT, 2);
    expect(data.center.x).toBeCloseTo(1.5, 3);
    expect(data.center.y).toBeCloseTo(sillHeight + doorHeight * 0.5, 3);
    expect(data.center.z).toBeCloseTo(front.position.z, 3);
    const cut = model.findBrush(data.cutBrushId)!;
    expect(cut.operation).toBe(SolidOperation.Subtractive);
    cut.pullTransformFromMesh();
    expect(cut.position.z).toBeCloseTo(front.position.z, 3);
    const order = model.getBrushes().map((brush) => brush.id);
    expect(order.indexOf(cut.id)).toBeGreaterThan(order.indexOf(front.id));
  });

  it('omits bottom frame for doors and includes it for windows', () => {
    const { api, world, stack } = createApi();
    const model = pushModel(world, stack, 'FrameModel');
    api.invokeTool('add_box_brush', {
      modelId: model.root.uuid,
      size: { x: 4, y: 3, z: 0.25 },
      position: { x: 0, y: 1.5, z: 0 },
      name: 'thin_wall',
      snap: false,
    });
    const wall = model.getBrushes().find((brush) => brush.name === 'thin_wall')!;
    api.invokeTool('add_opening', {
      modelId: model.root.uuid,
      kind: 'door',
      targetBrushId: wall.id,
      position: { x: 0, y: 1, z: 0 },
      size: { width: 1, height: 2 },
      sillHeight: 0,
      name: 'd',
      snap: false,
    });
    api.invokeTool('add_opening', {
      modelId: model.root.uuid,
      kind: 'window',
      targetBrushId: wall.id,
      position: { x: 1.2, y: 0, z: 0 },
      size: { width: 0.8, height: 0.8 },
      sillHeight: 1,
      name: 'w',
      snap: false,
    });
    const names = model.getBrushes().map((brush) => brush.name);
    expect(names.some((name) => name === 'd_frame_bottom')).toBe(false);
    expect(names.some((name) => name === 'd_frame_top')).toBe(true);
    expect(names.some((name) => name === 'w_frame_bottom')).toBe(true);
  });

  it('explains CSG at a point inside an additive box', () => {
    const { api, world, stack } = createApi();
    const model = pushModel(world, stack, 'CsgModel');
    const brush = model.getBrushes()[0]!;
    brush.scale.set(4, 4, 4);
    brush.pushTransformToMesh();
    model.rebuild(true);
    const result = api.invokeTool('explain_csg_at_point', {
      modelId: model.root.uuid,
      point: { x: 0, y: 0, z: 0 },
    });
    expect(result.ok).toBe(true);
    const data = result.data as { finalSolid: boolean; affectingBrushes: Array<{ brushId: string }> };
    expect(data.finalSolid).toBe(true);
    expect(data.affectingBrushes.some((row) => row.brushId === brush.id)).toBe(true);
  });

  it('reports void connectivity along a clear line', () => {
    const { api, world, stack } = createApi();
    const model = pushModel(world, stack, 'VoidModel');
    const brush = model.getBrushes()[0]!;
    brush.position.set(100, 0, 0);
    brush.pushTransformToMesh();
    model.rebuild(true);
    const result = api.invokeTool('query_void_connectivity', {
      modelId: model.root.uuid,
      fromPoint: { x: 0, y: 0, z: 0 },
      toPoint: { x: 0, y: 0, z: 5 },
    });
    expect(result.ok).toBe(true);
    const data = result.data as { connected: boolean };
    expect(data.connected).toBe(true);
  });

  it('reorders a brush relative to another by name', () => {
    const { api, world, stack } = createApi();
    const model = pushModel(world, stack, 'OrderModel');
    api.invokeTool('add_box_brush', {
      modelId: model.root.uuid,
      position: { x: 2, y: 0, z: 0 },
      name: 'second',
      snap: false,
    });
    api.invokeTool('add_box_brush', {
      modelId: model.root.uuid,
      position: { x: 4, y: 0, z: 0 },
      name: 'third',
      snap: false,
    });
    const third = model.getBrushes().find((brush) => brush.name === 'third')!;
    const result = api.invokeTool('reorder_brush_relative', {
      brushId: third.id,
      relativeToName: 'second',
      placement: 'before',
    });
    expect(result.ok).toBe(true);
    const names = model.getBrushes().map((brush) => brush.name);
    expect(names.indexOf('third')).toBeLessThan(names.indexOf('second'));
  });

  it('inserts a batch brush after a named brush', () => {
    const { api, world, stack } = createApi();
    const model = pushModel(world, stack, 'InsertModel');
    model.renameBrush(model.getBrushes()[0]!.id, 'wall_a');
    const result = api.invokeTool('add_box_brushes', {
      modelId: model.root.uuid,
      snap: false,
      brushes: [
        {
          name: 'door_cut',
          position: { x: 0, y: 1, z: 0 },
          size: { x: 1, y: 2, z: 0.4 },
          operation: 'subtractive',
          insertAfterName: 'wall_a',
        },
      ],
    });
    expect(result.ok).toBe(true);
    const names = model.getBrushes().map((brush) => brush.name);
    expect(names.indexOf('door_cut')).toBe(names.indexOf('wall_a') + 1);
  });
});

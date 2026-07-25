import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as THREE from 'three';
import { ClipPlaneHandler } from '../../../src/managers/clip_plane/clip_plane_handler.js';
import { ClipPlaneTool } from '../../../src/managers/clip_plane/clip_plane_tool.js';
import { CommandStack } from '../../../src/commands/command_stack.js';
import { SelectionManager } from '../../../src/selection/object/selection_manager.js';
import { GridSnap } from '../../../src/transform/snap/grid_snap.js';

/**
 * Builds a unit box mesh parented under the world for clip tests.
 *
 * @param world World root.
 * @returns Mesh ready to clip.
 */
function addBoxMesh(world: THREE.Group): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
  world.add(mesh);
  return mesh;
}

/**
 * Places a vertical cut plane through the origin on the active tool.
 *
 * @param tool Clip plane tool.
 */
function placeVerticalPlane(tool: ClipPlaneTool): void {
  tool.activate();
  tool.addPoint(new THREE.Vector3(0, 0, -1));
  tool.addPoint(new THREE.Vector3(0, 0, 1));
  expect(tool.isPlaneReady()).toBe(true);
}

/** Unit tests for continuous clip/split workflow after commit. */
describe('ClipPlaneHandler continuous commit flow', () => {
  let worldObject: THREE.Group;
  let clipPlaneTool: ClipPlaneTool;
  let selectionManager: SelectionManager;
  let handler: ClipPlaneHandler;

  beforeEach(() => {
    worldObject = new THREE.Group();
    clipPlaneTool = new ClipPlaneTool();
    selectionManager = new SelectionManager();
    handler = new ClipPlaneHandler({
      worldObject,
      commandStack: new CommandStack(32),
      selectionManager,
      gridSnap: new GridSnap(false, 1),
      clipPlaneTool,
      showStatusMessage: vi.fn(),
      syncPrimitivesToViewports: vi.fn(),
      refreshOutliner: vi.fn(),
      updateShadingMeshes: vi.fn(),
      onToolStateChanged: vi.fn(),
    });
  });

  it('keeps the clip tool active and clears placement after a successful clip', () => {
    const mesh = addBoxMesh(worldObject);
    selectionManager.selectObject(mesh);
    placeVerticalPlane(clipPlaneTool);
    handler.commitClip();
    expect(clipPlaneTool.isActive()).toBe(true);
    expect(clipPlaneTool.getPoints()).toHaveLength(0);
    expect(clipPlaneTool.isPlaneReady()).toBe(false);
    const selected = selectionManager.getAllSelectedObjectsAsArray();
    expect(selected.length).toBe(1);
    expect(selected[0]!).not.toBe(mesh);
    expect(selected[0]!.parent).toBe(worldObject);
  });

  it('selects both split halves and allows another plane to be placed', () => {
    const mesh = addBoxMesh(worldObject);
    selectionManager.selectObject(mesh);
    placeVerticalPlane(clipPlaneTool);
    handler.commitSplit();
    expect(clipPlaneTool.isActive()).toBe(true);
    const selected = selectionManager.getAllSelectedObjectsAsArray();
    expect(selected.length).toBe(2);
    selected.forEach((piece) => {
      expect(piece.parent).toBe(worldObject);
    });
    clipPlaneTool.addPoint(new THREE.Vector3(0.25, 0, -1));
    clipPlaneTool.addPoint(new THREE.Vector3(0.25, 0, 1));
    expect(clipPlaneTool.isPlaneReady()).toBe(true);
    handler.commitClip();
    expect(clipPlaneTool.isActive()).toBe(true);
    expect(selectionManager.getAllSelectedObjectsAsArray().length).toBeGreaterThan(0);
  });

  it('resetPlacementForNextCut preserves keep-front preference', () => {
    clipPlaneTool.activate();
    clipPlaneTool.addPoint(new THREE.Vector3(0, 0, 0));
    clipPlaneTool.addPoint(new THREE.Vector3(1, 0, 0));
    clipPlaneTool.flipKeepSide();
    expect(clipPlaneTool.getKeepFront()).toBe(false);
    clipPlaneTool.resetPlacementForNextCut();
    expect(clipPlaneTool.isActive()).toBe(true);
    expect(clipPlaneTool.getKeepFront()).toBe(false);
    expect(clipPlaneTool.getPoints()).toHaveLength(0);
  });
});

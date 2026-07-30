import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { SceneRaycaster } from '@/selection/object/scene_raycaster.js';
import { SelectionClickThrough } from '@/selection/object/selection_click_through.js';
import { ManagerSelection } from '@/selection/object/manager_selection.js';

/** Integration-style tests for multi-hit raycasting and click-through picks. */
describe('SceneRaycaster click-through', () => {
  let raycaster: SceneRaycaster;

  beforeEach(() => {
    raycaster = new SceneRaycaster();
  });

  it('returns nested meshes near-to-far from castAll', () => {
    const canvas = createCanvas();
    const renderer = createMockRenderer(canvas);
    const camera = createTestCamera();
    const outer = createMeshAt(4, 4, 1, 0, 0, -1);
    const inner = createMeshAt(1, 1, 1, 0, 0, -1);
    const event = createMockMouseEvent(400, 300);
    const hits = raycaster.castAll(camera, renderer.domElement, event, [outer, inner]);
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits[0]).toBe(outer);
    expect(hits).toContain(inner);
  });

  it('cycles selection through nested meshes along one ray', () => {
    const canvas = createCanvas();
    const renderer = createMockRenderer(canvas);
    const camera = createTestCamera();
    const outer = createMeshAt(4, 4, 1, 0, 0, -1);
    const inner = createMeshAt(1, 1, 1, 0, 0, -1);
    const event = createMockMouseEvent(400, 300);
    const intersections = raycaster.castIntersections(camera, renderer.domElement, event, [outer, inner]);
    const stack = SelectionClickThrough.uniqueMeshesFromHits(intersections, (mesh) => mesh);
    const selectionManager = new ManagerSelection();
    const first = SelectionClickThrough.pickFromStack(stack, selectionManager);
    expect(first).toBe(outer);
    selectionManager.selectObject(first!);
    const second = SelectionClickThrough.pickFromStack(stack, selectionManager);
    expect(second).toBe(inner);
  });
});

/**
 * Creates a mock canvas with fixed client bounds.
 *
 * @returns Canvas element stand-in.
 */
function createCanvas(): HTMLElement {
  const canvas = document.createElement('canvas');
  Object.defineProperty(canvas, 'getBoundingClientRect', {
    value: () => ({ left: 0, top: 0, width: 800, height: 600 }),
  });
  return canvas;
}

/**
 * Creates a mock WebGL renderer for testing.
 *
 * @param canvas The mock canvas element.
 * @returns A mock renderer object.
 */
function createMockRenderer(canvas: HTMLElement): THREE.WebGLRenderer {
  return {
    domElement: canvas,
  } as unknown as THREE.WebGLRenderer;
}

/**
 * Creates a test camera positioned at origin looking down negative Z.
 *
 * @returns A configured perspective camera.
 */
function createTestCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 1000);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  return camera;
}

/**
 * Creates a mesh at a specific position with updated world matrix.
 *
 * @param sizeX Width of the box along X.
 * @param sizeY Height of the box along Y.
 * @param sizeZ Depth of the box along Z.
 * @param posX X position.
 * @param posY Y position.
 * @param posZ Z position.
 * @returns A mesh with an updated world matrix.
 */
function createMeshAt(
  sizeX: number,
  sizeY: number,
  sizeZ: number,
  posX: number,
  posY: number,
  posZ: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sizeX, sizeY, sizeZ), new THREE.MeshBasicMaterial());
  mesh.position.set(posX, posY, posZ);
  mesh.updateMatrixWorld(true);
  return mesh;
}

/**
 * Creates a mock mouse event with specified coordinates.
 *
 * @param clientX The horizontal client coordinate.
 * @param clientY The vertical client coordinate.
 * @returns A mock MouseEvent.
 */
function createMockMouseEvent(clientX: number, clientY: number): MouseEvent {
  return new MouseEvent('click', {
    clientX,
    clientY,
    bubbles: true,
  });
}

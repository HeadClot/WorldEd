import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { ClipPlanePointDrag } from '@/tools/clip_plane/clip_plane_point_drag.js';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import { CLIP_MARKER_PICK_PIXELS } from '@/tools/clip_plane/clip_plane_marker_style.js';

describe('ClipPlanePointDrag', () => {
  let drag: ClipPlanePointDrag;
  let camera: THREE.PerspectiveCamera;
  let renderer: THREE.WebGLRenderer;
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    drag = new ClipPlanePointDrag(new GridSnap(false, 0.25));
    camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'clientWidth', { value: 200 });
    Object.defineProperty(canvas, 'clientHeight', { value: 200 });
    Object.defineProperty(canvas, 'getBoundingClientRect', {
      value: () => ({
        left: 0,
        top: 0,
        right: 200,
        bottom: 200,
        width: 200,
        height: 200,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });
    renderer = {
      domElement: canvas,
    } as unknown as THREE.WebGLRenderer;
  });

  it('should pick a marker under the projected screen position', () => {
    const point = new THREE.Vector3(0, 0, 0);
    const projected = point.clone().project(camera);
    const clientX = (projected.x * 0.5 + 0.5) * 200;
    const clientY = (-projected.y * 0.5 + 0.5) * 200;
    const event = {
      clientX,
      clientY,
    } as MouseEvent;
    const index = drag.pickMarkerIndex(event, camera, renderer.domElement, [point]);
    expect(index).toBe(0);
  });

  it('should not pick markers far from the pointer', () => {
    const point = new THREE.Vector3(0, 0, 0);
    const event = {
      clientX: 0,
      clientY: 0,
    } as MouseEvent;
    const index = drag.pickMarkerIndex(event, camera, renderer.domElement, [point]);
    expect(index).toBeNull();
  });

  it('should use a pick radius large enough for comfortable grabbing', () => {
    expect(CLIP_MARKER_PICK_PIXELS).toBeGreaterThanOrEqual(10);
    expect(CLIP_MARKER_PICK_PIXELS).toBeLessThanOrEqual(24);
  });

  it('should project pointer motion onto a view-aligned drag plane', () => {
    const origin = new THREE.Vector3(0, 0, 0);
    const plane = drag.createDragPlane(origin, camera);
    const centerEvent = { clientX: 100, clientY: 100 } as MouseEvent;
    const hit = drag.projectOntoDragPlane(centerEvent, camera, renderer.domElement, plane);
    expect(hit).not.toBeNull();
    expect(hit!.z).toBeCloseTo(0, 1);
  });

  it('should skip grid snap when applySnap is false (Shift precision mode)', () => {
    const snapOn = new ClipPlanePointDrag(new GridSnap(true, 1));
    const origin = new THREE.Vector3(0, 0, 0);
    const plane = snapOn.createDragPlane(origin, camera);
    const offsetEvent = { clientX: 120, clientY: 100 } as MouseEvent;
    const snapped = snapOn.projectOntoDragPlane(offsetEvent, camera, renderer.domElement, plane, true);
    const free = snapOn.projectOntoDragPlane(offsetEvent, camera, renderer.domElement, plane, false);
    expect(snapped).not.toBeNull();
    expect(free).not.toBeNull();
    expect(snapped!.x % 1).toBeCloseTo(0, 5);
    expect(Math.abs(free!.x - snapped!.x) > 1e-6 || Math.abs(free!.y - snapped!.y) > 1e-6).toBe(true);
  });
});

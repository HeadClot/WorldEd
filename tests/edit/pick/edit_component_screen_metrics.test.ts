import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  resolveEditComponentPickElementMetrics,
  resolveEditComponentPickRadius,
} from '@/edit/pick/edit_component_screen_metrics.js';
import { pickNearestWorldPointIndex } from '@/edit/pick/raycaster_component_world_points.js';
import { EDIT_COMPONENT_VERTEX_PICK_RADIUS_PX } from '@/edit/component/component_edit_pick_radii.js';

/**
 * Builds a pick element with layout bounds that differ from clientWidth so NDC
 * and pixel metrics must stay aligned to the bounding rect.
 *
 * @returns HTML element mock.
 */
function createScaledPickElement(): HTMLElement {
  return {
    clientWidth: 100,
    clientHeight: 100,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200 }),
  } as HTMLElement;
}

describe('edit_component_screen_metrics', () => {
  it('prefers layout bounds over smaller clientWidth values', () => {
    const metrics = resolveEditComponentPickElementMetrics(createScaledPickElement());
    expect(metrics.width).toBe(200);
    expect(metrics.height).toBe(200);
  });

  it('enlarges pick radius for orthographic cameras', () => {
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    const perspective = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    expect(resolveEditComponentPickRadius(ortho, 100)).toBeGreaterThan(100);
    expect(resolveEditComponentPickRadius(perspective, 100)).toBe(100);
  });

  it('picks off-center vertices under an orthographic top-down camera', () => {
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
    camera.position.set(0, 20, 0);
    camera.lookAt(0, 0, 0);
    camera.up.set(0, 0, -1);
    camera.updateMatrixWorld(true);
    const pickElement = createScaledPickElement();
    const worldPoints = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(4, 0, 0), new THREE.Vector3(0, 0, 4)];
    const target = worldPoints[1]!.clone().project(camera);
    const clientX = (target.x + 1) * 0.5 * 200;
    const clientY = (1 - (target.y + 1) * 0.5) * 200;
    const hit = pickNearestWorldPointIndex(
      { clientX, clientY } as MouseEvent,
      camera,
      pickElement,
      worldPoints,
      resolveEditComponentPickRadius(camera, EDIT_COMPONENT_VERTEX_PICK_RADIUS_PX),
    );
    expect(hit).not.toBeNull();
    expect(hit?.index).toBe(1);
  });
});

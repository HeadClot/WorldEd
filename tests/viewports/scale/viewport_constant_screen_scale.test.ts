import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  computeViewportConstantScreenScale,
  VIEWPORT_CONSTANT_SCREEN_ORTHOGRAPHIC_FRUSTUM_SCALE,
  VIEWPORT_CONSTANT_SCREEN_PERSPECTIVE_DISTANCE_SCALE,
  VIEWPORT_CONSTANT_SCREEN_PERSPECTIVE_MIN_SCALE,
} from '@/viewports/scale/viewport_constant_screen_scale.js';
import { computeGizmoCameraScale } from '@/transform/gizmo/gizmo_camera_scale.js';

describe('computeViewportConstantScreenScale', () => {
  it('matches historical gizmo perspective scaling', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 10);
    const pivot = new THREE.Vector3(0, 0, 0);
    const scale = computeViewportConstantScreenScale(camera, pivot);
    expect(scale).toBeCloseTo(10 * VIEWPORT_CONSTANT_SCREEN_PERSPECTIVE_DISTANCE_SCALE);
    expect(computeGizmoCameraScale(camera, pivot)).toBe(scale);
  });

  it('floors perspective scale for close-up cameras', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 0.1);
    const pivot = new THREE.Vector3(0, 0, 0);
    expect(computeViewportConstantScreenScale(camera, pivot)).toBe(VIEWPORT_CONSTANT_SCREEN_PERSPECTIVE_MIN_SCALE);
  });

  it('scales orthographic helpers from frustum height', () => {
    const camera = new THREE.OrthographicCamera(-5, 5, 4, -4, 0.1, 100);
    const pivot = new THREE.Vector3();
    const frustumHeight = 8;
    expect(computeViewportConstantScreenScale(camera, pivot)).toBeCloseTo(
      frustumHeight * VIEWPORT_CONSTANT_SCREEN_ORTHOGRAPHIC_FRUSTUM_SCALE,
    );
  });
});

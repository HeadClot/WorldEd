import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  computeGizmoCameraScale,
  GIZMO_ORTHOGRAPHIC_FRUSTUM_SCALE,
  GIZMO_ORTHOGRAPHIC_MIN_SCALE,
  GIZMO_PERSPECTIVE_DISTANCE_SCALE,
  GIZMO_PERSPECTIVE_MIN_SCALE,
} from '../../../src/transform/gizmo/gizmo_camera_scale.js';

describe('computeGizmoCameraScale', () => {
  it('uses distance for perspective cameras with a minimum floor', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 10);
    const pivot = new THREE.Vector3(0, 0, 0);
    expect(computeGizmoCameraScale(camera, pivot)).toBeCloseTo(10 * GIZMO_PERSPECTIVE_DISTANCE_SCALE);
    camera.position.set(0, 0, 1);
    expect(computeGizmoCameraScale(camera, pivot)).toBe(GIZMO_PERSPECTIVE_MIN_SCALE);
  });

  it('uses frustum height for orthographic cameras so zoom-in stays readable', () => {
    const camera = new THREE.OrthographicCamera(-5, 5, 4, -4, 0.1, 1000);
    camera.position.set(0, 50, 0);
    const pivot = new THREE.Vector3(0, 0, 0);
    const frustumHeight = 8;
    expect(computeGizmoCameraScale(camera, pivot)).toBeCloseTo(frustumHeight * GIZMO_ORTHOGRAPHIC_FRUSTUM_SCALE);
  });

  it('does not use orthographic camera distance which would inflate the gizmo', () => {
    const camera = new THREE.OrthographicCamera(-2, 2, 1.5, -1.5, 0.1, 1000);
    camera.position.set(0, 200, 0);
    const pivot = new THREE.Vector3(0, 0, 0);
    const scale = computeGizmoCameraScale(camera, pivot);
    const wrongDistanceScale = 200 * GIZMO_PERSPECTIVE_DISTANCE_SCALE;
    expect(scale).toBeLessThan(wrongDistanceScale);
    expect(scale).toBeCloseTo(3 * GIZMO_ORTHOGRAPHIC_FRUSTUM_SCALE);
  });

  it('clamps orthographic scale when heavily zoomed in', () => {
    const camera = new THREE.OrthographicCamera(-0.1, 0.1, 0.05, -0.05, 0.1, 1000);
    const scale = computeGizmoCameraScale(camera, new THREE.Vector3());
    expect(scale).toBe(GIZMO_ORTHOGRAPHIC_MIN_SCALE);
  });
});

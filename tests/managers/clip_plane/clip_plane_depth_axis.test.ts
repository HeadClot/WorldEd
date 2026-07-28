import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  createClipPlanePlacementHint,
  resolveClipPlaneDepthAxis,
} from '../../../src/managers/clip_plane/clip_plane_depth_axis.js';

describe('clip_plane_depth_axis', () => {
  it('should use camera direction for orthographic picks even with a surface normal', () => {
    const cameraDirection = new THREE.Vector3(0, -1, 0);
    const surfaceNormal = new THREE.Vector3(0, 0, 1);
    const axis = resolveClipPlaneDepthAxis({
      cameraDirection,
      surfaceNormal,
      isOrthographic: true,
    });
    expect(axis.x).toBeCloseTo(0);
    expect(axis.y).toBeCloseTo(-1);
    expect(axis.z).toBeCloseTo(0);
  });

  it('should use surface normal for perspective surface picks', () => {
    const axis = resolveClipPlaneDepthAxis({
      cameraDirection: new THREE.Vector3(0, 0, -1),
      surfaceNormal: new THREE.Vector3(1, 0, 0),
      isOrthographic: false,
    });
    expect(axis.x).toBeCloseTo(1);
    expect(axis.y).toBeCloseTo(0);
    expect(axis.z).toBeCloseTo(0);
  });

  it('should fall back to camera direction without a surface normal', () => {
    const axis = resolveClipPlaneDepthAxis({
      cameraDirection: new THREE.Vector3(0, 0, -1),
      surfaceNormal: null,
      isOrthographic: false,
    });
    expect(axis.z).toBeCloseTo(-1);
  });

  it('should build a placement hint from an orthographic camera', () => {
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 1000);
    camera.position.set(0, 20, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const hint = createClipPlanePlacementHint(camera, new THREE.Vector3(0, 0, 1));
    expect(hint.isOrthographic).toBe(true);
    expect(hint.surfaceNormal).not.toBeNull();
    expect(hint.cameraDirection.length()).toBeCloseTo(1);
    expect(hint.cameraDirection.y).toBeLessThan(0);
  });

  it('should build a placement hint from a perspective camera without surface', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const hint = createClipPlanePlacementHint(camera, null);
    expect(hint.isOrthographic).toBe(false);
    expect(hint.surfaceNormal).toBeNull();
    expect(hint.cameraDirection.z).toBeLessThan(0);
  });
});

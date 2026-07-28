import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  applyViewportCameraSnapshot,
  captureViewportCameraSnapshot,
  parseViewportCameraSnapshot,
} from '../../src/viewports/viewport_camera_snapshot.js';
import type { EditorViewport } from '../../src/viewports/editor_viewport.js';

/**
 * Builds a viewport-like object that exposes a camera.
 *
 * @param camera Perspective or orthographic camera.
 * @param extras Optional extra methods (flying sync).
 * @returns Viewport stand-in.
 */
function createViewportStub(
  camera: THREE.Camera,
  extras: { syncFlyingCameraOrientation?: () => void } = {},
): EditorViewport {
  return {
    getCamera: () => camera,
    ...extras,
  } as unknown as EditorViewport;
}

describe('viewport_camera_snapshot', () => {
  it('parses perspective and orthographic snapshots and rejects invalid data', () => {
    expect(
      parseViewportCameraSnapshot({
        kind: 'perspective',
        position: [1, 2, 3],
        quaternion: [0, 0, 0, 1],
      }),
    ).toEqual({
      kind: 'perspective',
      position: [1, 2, 3],
      quaternion: [0, 0, 0, 1],
    });
    const orthographic = parseViewportCameraSnapshot({
      kind: 'orthographic',
      position: [0, 10, 0],
      quaternion: [0, 0, 0, 1],
      left: -4,
      right: 4,
      top: 3,
      bottom: -3,
    });
    expect(orthographic?.kind).toBe('orthographic');
    if (orthographic?.kind === 'orthographic') {
      expect(orthographic.left).toBe(-4);
      expect(orthographic.top).toBe(3);
    }
    expect(parseViewportCameraSnapshot({ kind: 'perspective', position: [1, 2] })).toBeNull();
    expect(parseViewportCameraSnapshot(null)).toBeNull();
  });

  it('captures and applies a perspective camera pose and syncs flying orientation', () => {
    const sourceCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    sourceCamera.position.set(8, 6, 4);
    sourceCamera.quaternion.setFromEuler(new THREE.Euler(0.2, -0.4, 0));
    sourceCamera.updateMatrixWorld(true);
    const source = createViewportStub(sourceCamera);
    const snapshot = captureViewportCameraSnapshot(source);
    expect(snapshot?.kind).toBe('perspective');
    const targetCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    const syncFlyingCameraOrientation = vi.fn();
    const target = createViewportStub(targetCamera, { syncFlyingCameraOrientation });
    expect(applyViewportCameraSnapshot(target, snapshot!)).toBe(true);
    expect(targetCamera.position.x).toBeCloseTo(8);
    expect(targetCamera.position.y).toBeCloseTo(6);
    expect(targetCamera.position.z).toBeCloseTo(4);
    expect(targetCamera.quaternion.y).toBeCloseTo(sourceCamera.quaternion.y);
    expect(syncFlyingCameraOrientation).toHaveBeenCalledOnce();
  });

  it('captures and applies orthographic frustum and pose', () => {
    const sourceCamera = new THREE.OrthographicCamera(-2, 2, 1.5, -1.5, 0.1, 1000);
    sourceCamera.position.set(1, 20, -2);
    sourceCamera.quaternion.set(0, 0, 0, 1);
    const snapshot = captureViewportCameraSnapshot(createViewportStub(sourceCamera));
    expect(snapshot?.kind).toBe('orthographic');
    const targetCamera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 1000);
    expect(applyViewportCameraSnapshot(createViewportStub(targetCamera), snapshot!)).toBe(true);
    expect(targetCamera.left).toBe(-2);
    expect(targetCamera.right).toBe(2);
    expect(targetCamera.top).toBe(1.5);
    expect(targetCamera.bottom).toBe(-1.5);
    expect(targetCamera.position.y).toBeCloseTo(20);
  });

  it('rejects mismatched camera kinds', () => {
    const ortho = createViewportStub(new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100));
    const perspectiveSnap = parseViewportCameraSnapshot({
      kind: 'perspective',
      position: [0, 0, 5],
      quaternion: [0, 0, 0, 1],
    })!;
    expect(applyViewportCameraSnapshot(ortho, perspectiveSnap)).toBe(false);
  });
});

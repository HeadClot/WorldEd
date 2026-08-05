import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  isWorldEdgeSampleUnoccluded,
  isWorldEdgeUnoccluded,
  isWorldPointUnoccluded,
  isWorldPointVisibleForPick,
  measureClosestOccluderDistance,
  shouldApplyComponentPickOcclusion,
} from '@/edit/pick/edit_component_occlusion.js';

/**
 * Builds a centered box mesh used as an occluder.
 *
 * @returns Mesh with world matrices updated.
 */
function createOccluderBox(): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 0.2));
  mesh.position.set(0, 0, 0);
  mesh.updateMatrixWorld(true);
  return mesh;
}

describe('edit_component_occlusion', () => {
  it('rejects points behind a front-facing occluder mesh along the pointer ray', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const mesh = createOccluderBox();
    const pickElement = {
      clientWidth: 200,
      clientHeight: 200,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200 }),
    } as HTMLElement;
    const event = { clientX: 100, clientY: 100 } as MouseEvent;
    const occluderDistance = measureClosestOccluderDistance(event, camera, pickElement, [mesh]);
    expect(occluderDistance).not.toBeNull();
    const behind = new THREE.Vector3(0, 0, -2);
    expect(isWorldPointVisibleForPick(behind, camera, event, pickElement, occluderDistance)).toBe(false);
    const front = new THREE.Vector3(0, 0, 0.1);
    expect(isWorldPointVisibleForPick(front, camera, event, pickElement, occluderDistance)).toBe(true);
    mesh.geometry.dispose();
  });

  it('treats surface points as unoccluded and blocks points behind solid faces', () => {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const mesh = createOccluderBox();
    const surface = new THREE.Vector3(0, 0, 0.1);
    expect(isWorldPointUnoccluded(surface, camera, [mesh])).toBe(true);
    const behind = new THREE.Vector3(0, 0, -2);
    expect(isWorldPointUnoccluded(behind, camera, [mesh])).toBe(false);
    expect(isWorldEdgeUnoccluded(new THREE.Vector3(-0.5, 0, 0.1), new THREE.Vector3(0.5, 0, 0.1), camera, [mesh])).toBe(
      true,
    );
    expect(
      isWorldEdgeSampleUnoccluded(
        new THREE.Vector3(-0.5, 0, -2),
        new THREE.Vector3(0.5, 0, -2),
        new THREE.Vector3(0, 0, -2),
        camera,
        [mesh],
      ),
    ).toBe(false);
    mesh.geometry.dispose();
  });

  it('applies depth occlusion for orthographic cameras (no pick-through)', () => {
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
    camera.position.set(0, 0, 20);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    expect(shouldApplyComponentPickOcclusion(camera)).toBe(true);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 2));
    mesh.updateMatrixWorld(true);
    const frontCorner = new THREE.Vector3(1.8, 1.8, 1);
    expect(isWorldPointUnoccluded(frontCorner, camera, [mesh])).toBe(true);
    const backCorner = new THREE.Vector3(1.8, 1.8, -1);
    expect(isWorldPointUnoccluded(backCorner, camera, [mesh])).toBe(false);
    mesh.geometry.dispose();
  });
});

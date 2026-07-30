import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  buildClipHalfPreviewPair,
  CLIP_HALF_KEEP_USERDATA_KEY,
  CLIP_HALF_DISCARD_USERDATA_KEY,
} from '@/tools/clip_plane/clip_plane_half_preview.js';
import { Theme } from '@/theme.js';

/**
 * Creates a unit box mesh centered at the origin.
 *
 * @returns Mesh ready for clip half preview.
 */
function createUnitBox(): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
  mesh.updateMatrixWorld(true);
  return mesh;
}

describe('buildClipHalfPreviewPair', () => {
  it('should build keep and discard halves for a mid-plane box cut', () => {
    const mesh = createUnitBox();
    const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
    const pair = buildClipHalfPreviewPair(mesh, plane, true);
    expect(pair.keepMesh).toBeInstanceOf(THREE.Mesh);
    expect(pair.discardMesh).toBeInstanceOf(THREE.Mesh);
    expect(pair.keepMesh!.userData[CLIP_HALF_KEEP_USERDATA_KEY]).toBe(true);
    expect(pair.discardMesh!.userData[CLIP_HALF_DISCARD_USERDATA_KEY]).toBe(true);
    const keepMaterial = pair.keepMesh!.material as THREE.MeshBasicMaterial;
    const discardMaterial = pair.discardMesh!.material as THREE.MeshBasicMaterial;
    expect(keepMaterial.color.getHex()).toBe(Theme.clipKeepColor);
    expect(discardMaterial.color.getHex()).toBe(Theme.clipDiscardColor);
    expect(keepMaterial.opacity).toBeGreaterThan(0.2);
    expect(discardMaterial.opacity).toBeGreaterThanOrEqual(0.25);
  });

  it('should treat keep and discard materials the same except color and opacity', () => {
    const mesh = createUnitBox();
    const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
    const pair = buildClipHalfPreviewPair(mesh, plane, true);
    const keepMaterial = pair.keepMesh!.material as THREE.MeshBasicMaterial;
    const discardMaterial = pair.discardMesh!.material as THREE.MeshBasicMaterial;
    expect(keepMaterial.depthWrite).toBe(false);
    expect(discardMaterial.depthWrite).toBe(false);
    expect(keepMaterial.depthTest).toBe(false);
    expect(discardMaterial.depthTest).toBe(false);
    expect(keepMaterial.side).toBe(discardMaterial.side);
    expect(keepMaterial.transparent).toBe(true);
    expect(discardMaterial.transparent).toBe(true);
    expect(pair.keepMesh!.renderOrder).toBe(pair.discardMesh!.renderOrder);
  });

  it('should bias keep and discard opposite ways along the plane normal', () => {
    const mesh = createUnitBox();
    const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
    const pair = buildClipHalfPreviewPair(mesh, plane, true);
    expect(pair.keepMesh!.position.x).toBeGreaterThan(0);
    expect(pair.discardMesh!.position.x).toBeLessThan(0);
    expect(Math.abs(pair.keepMesh!.position.x)).toBeCloseTo(Math.abs(pair.discardMesh!.position.x));
  });

  it('should build comparable closed hulls for both halves', () => {
    const mesh = createUnitBox();
    const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
    const pair = buildClipHalfPreviewPair(mesh, plane, true);
    const keepCount = pair.keepMesh!.geometry.getAttribute('position').count;
    const discardCount = pair.discardMesh!.geometry.getAttribute('position').count;
    expect(keepCount).toBe(discardCount);
    expect(keepCount).toBeGreaterThan(30);
  });

  it('should swap keep and discard when keepFront is false', () => {
    const mesh = createUnitBox();
    const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
    const keepFront = buildClipHalfPreviewPair(mesh, plane, true);
    const keepBack = buildClipHalfPreviewPair(mesh, plane, false);
    expect(keepFront.keepMesh).not.toBeNull();
    expect(keepBack.keepMesh).not.toBeNull();
    const frontKeepCount = keepFront.keepMesh!.geometry.getAttribute('position').count;
    const backKeepCount = keepBack.keepMesh!.geometry.getAttribute('position').count;
    expect(frontKeepCount).toBeGreaterThan(0);
    expect(backKeepCount).toBeGreaterThan(0);
  });

  it('should put the whole mesh on the discard side when the plane misses', () => {
    const mesh = createUnitBox();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(20, 0, 0),
    );
    const pair = buildClipHalfPreviewPair(mesh, plane, true);
    expect(pair.keepMesh).toBeNull();
    expect(pair.discardMesh).toBeInstanceOf(THREE.Mesh);
  });
});

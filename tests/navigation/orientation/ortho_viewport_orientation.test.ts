import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ViewportKind } from '@/viewports/core/viewport_kind.js';
import {
  buildOrthoGridPlaneFrame,
  reorientOrthographicCamera,
  resolveOrthoViewAxes,
} from '@/navigation/orientation/ortho_viewport_orientation.js';
import {
  buildDefaultWorldBasis,
  buildEdgeAlignedOrientation,
} from '@/navigation/orientation/editor_orientation_edge_align.js';
import { EDITOR_DEFAULT_UP } from '@/navigation/orientation/editor_orientation_basis.js';

describe('ortho_viewport_orientation', () => {
  it('resolves identity top front and side look directions', () => {
    const basis = buildDefaultWorldBasis();
    const top = resolveOrthoViewAxes(ViewportKind.TOP, basis);
    expect(top.lookDirection.distanceTo(new THREE.Vector3(0, -1, 0))).toBeLessThan(1e-6);
    expect(top.up.distanceTo(new THREE.Vector3(0, 0, -1))).toBeLessThan(1e-6);
    const front = resolveOrthoViewAxes(ViewportKind.FRONT, basis);
    expect(front.lookDirection.distanceTo(new THREE.Vector3(0, 0, -1))).toBeLessThan(1e-6);
    expect(front.up.distanceTo(EDITOR_DEFAULT_UP)).toBeLessThan(1e-6);
    const side = resolveOrthoViewAxes(ViewportKind.SIDE, basis);
    expect(side.lookDirection.distanceTo(new THREE.Vector3(-1, 0, 0))).toBeLessThan(1e-6);
    expect(side.up.distanceTo(EDITOR_DEFAULT_UP)).toBeLessThan(1e-6);
  });

  it('reorients a top camera along a rotated working up axis', () => {
    const edge = new THREE.Vector3(1, 0, 1).normalize();
    const outcome = buildEdgeAlignedOrientation('z', edge, buildDefaultWorldBasis(), edge, new THREE.Vector3());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 1000);
    camera.position.set(0, 50, 0);
    camera.up.set(0, 0, -1);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    reorientOrthographicCamera(camera, ViewportKind.TOP, outcome.basis, new THREE.Vector3());
    const look = new THREE.Vector3();
    camera.getWorldDirection(look);
    expect(look.distanceTo(outcome.basis.yAxis.clone().negate())).toBeLessThan(1e-5);
    expect(camera.up.distanceTo(outcome.basis.zAxis.clone().negate())).toBeLessThan(1e-5);
    const focus = camera.position.clone().addScaledVector(look, 50);
    expect(focus.length()).toBeLessThan(1e-4);
  });

  it('builds orthographic grid frames with mutually perpendicular axes', () => {
    const basis = buildDefaultWorldBasis();
    const origin = new THREE.Vector3(1, 2, 3);
    const top = buildOrthoGridPlaneFrame(ViewportKind.TOP, basis, origin);
    expect(top.normal.distanceTo(EDITOR_DEFAULT_UP)).toBeLessThan(1e-6);
    expect(Math.abs(top.uAxis.dot(top.vAxis))).toBeLessThan(1e-6);
    const front = buildOrthoGridPlaneFrame(ViewportKind.FRONT, basis, origin);
    expect(front.normal.distanceTo(new THREE.Vector3(0, 0, 1))).toBeLessThan(1e-6);
    const side = buildOrthoGridPlaneFrame(ViewportKind.SIDE, basis, origin);
    expect(side.normal.distanceTo(new THREE.Vector3(1, 0, 0))).toBeLessThan(1e-6);
  });

  it('preserves the world focus point when reorienting after a pan', () => {
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 1000);
    camera.position.set(4, 50, -2);
    camera.up.set(0, 0, -1);
    camera.lookAt(4, 0, -2);
    camera.updateMatrixWorld(true);
    const edge = new THREE.Vector3(0, 0, 1);
    const outcome = buildEdgeAlignedOrientation('z', edge, buildDefaultWorldBasis(), edge, new THREE.Vector3());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    reorientOrthographicCamera(camera, ViewportKind.TOP, outcome.basis, new THREE.Vector3());
    const look = new THREE.Vector3();
    camera.getWorldDirection(look);
    const focus = camera.position
      .clone()
      .addScaledVector(look, camera.position.distanceTo(new THREE.Vector3(4, 0, -2)));
    expect(focus.distanceTo(new THREE.Vector3(4, 0, -2))).toBeLessThan(1e-4);
  });
});

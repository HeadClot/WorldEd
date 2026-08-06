import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { EditorOrientation } from '@/navigation/orientation/editor_orientation.js';
import { EditorOrientationAnimator } from '@/navigation/orientation/editor_orientation_animator.js';
import { CameraAnimationConfig } from '@/navigation/camera/camera_animation_config.js';
import { EDITOR_DEFAULT_UP } from '@/navigation/orientation/editor_orientation_basis.js';

describe('EditorOrientationAnimator', () => {
  it('keeps camera position and look-at fixed while reorienting up', () => {
    const orientation = new EditorOrientation();
    const animator = new EditorOrientationAnimator(orientation);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(3, 7, 11);
    camera.up.copy(EDITOR_DEFAULT_UP);
    const lookTarget = new THREE.Vector3(1, 2, 3);
    camera.lookAt(lookTarget);
    const startPosition = camera.position.clone();
    const startForward = new THREE.Vector3();
    camera.getWorldDirection(startForward);
    const config = new CameraAnimationConfig();
    config.setAnimationEnabled(false);
    const wallNormal = new THREE.Vector3(1, 0, 0);
    const planeOrigin = new THREE.Vector3(0, 0, 0);
    const running = animator.animateAlignToFace(wallNormal, planeOrigin, [camera], config);
    expect(running).toBe(false);
    expect(orientation.getUp().distanceTo(wallNormal)).toBeLessThan(1e-5);
    expect(camera.up.distanceTo(wallNormal)).toBeLessThan(1e-5);
    expect(camera.position.distanceTo(startPosition)).toBeLessThan(1e-8);
    const endForward = new THREE.Vector3();
    camera.getWorldDirection(endForward);
    expect(endForward.distanceTo(startForward)).toBeLessThan(1e-5);
  });

  it('resets orientation to default without moving position or look direction', () => {
    const orientation = new EditorOrientation();
    orientation.setFromFaceNormal(new THREE.Vector3(0, 0, 1), new THREE.Vector3());
    const animator = new EditorOrientationAnimator(orientation);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(2, 4, 8);
    camera.up.set(0, 0, 1);
    const lookTarget = new THREE.Vector3(0, 1, 0);
    camera.lookAt(lookTarget);
    const startPosition = camera.position.clone();
    const startForward = new THREE.Vector3();
    camera.getWorldDirection(startForward);
    const config = new CameraAnimationConfig();
    config.setAnimationEnabled(false);
    animator.animateResetToDefault([camera], config);
    expect(orientation.isDefault()).toBe(true);
    expect(camera.up.distanceTo(EDITOR_DEFAULT_UP)).toBeLessThan(1e-5);
    expect(camera.position.distanceTo(startPosition)).toBeLessThan(1e-8);
    const endForward = new THREE.Vector3();
    camera.getWorldDirection(endForward);
    expect(endForward.distanceTo(startForward)).toBeLessThan(1e-5);
  });
});

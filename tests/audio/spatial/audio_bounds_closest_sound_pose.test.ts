import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  computeWorldBoundsFromObjects,
  resolveBoundsClosestSoundPose,
} from '@/audio/spatial/audio_bounds_closest_sound_pose.js';

describe('resolveBoundsClosestSoundPose', () => {
  it('forces mono when the last viewport mode is mono', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, 10);
    const bounds = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
    const pose = resolveBoundsClosestSoundPose('mono', camera, bounds, new THREE.Vector3(5, 0, 0));
    expect(pose.mode).toBe('mono');
  });

  it('uses mono at the listener when the camera is inside the selection bounds', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0.2, 0.1, -0.3);
    camera.updateMatrixWorld(true);
    const bounds = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
    const pose = resolveBoundsClosestSoundPose('spatial3d', camera, bounds, new THREE.Vector3(0, 0, 0));
    expect(pose.mode).toBe('mono');
    expect(pose.sourcePosition.x).toBeCloseTo(0.2, 4);
    expect(pose.sourcePosition.y).toBeCloseTo(0.1, 4);
    expect(pose.sourcePosition.z).toBeCloseTo(-0.3, 4);
  });

  it('places the source on the closest bounds point when the camera is outside', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(10, 0, 0);
    camera.updateMatrixWorld(true);
    const bounds = new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
    const pose = resolveBoundsClosestSoundPose('spatial3d', camera, bounds, new THREE.Vector3(0, 0, 0));
    expect(pose.mode).toBe('spatial3d');
    expect(pose.sourcePosition.x).toBeCloseTo(1, 4);
    expect(pose.sourcePosition.y).toBeCloseTo(0, 4);
    expect(pose.sourcePosition.z).toBeCloseTo(0, 4);
  });

  it('falls back to the probe origin when bounds are missing', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, 5);
    const fallback = new THREE.Vector3(3, 2, 1);
    const pose = resolveBoundsClosestSoundPose('spatial3d', camera, null, fallback);
    expect(pose.mode).toBe('spatial3d');
    expect(pose.sourcePosition.equals(fallback)).toBe(true);
  });
});

describe('computeWorldBoundsFromObjects', () => {
  it('returns null for an empty selection', () => {
    expect(computeWorldBoundsFromObjects([])).toBeNull();
  });

  it('builds a world AABB covering selected meshes', () => {
    const meshA = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    meshA.position.set(0, 0, 0);
    meshA.updateMatrixWorld(true);
    const meshB = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    meshB.position.set(4, 0, 0);
    meshB.updateMatrixWorld(true);
    const bounds = computeWorldBoundsFromObjects([meshA, meshB]);
    expect(bounds).not.toBeNull();
    expect(bounds!.min.x).toBeCloseTo(-1, 4);
    expect(bounds!.max.x).toBeCloseTo(5, 4);
  });
});

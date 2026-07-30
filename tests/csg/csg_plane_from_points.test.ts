import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  buildVerticalPlaneFromTwoPoints,
  buildPlaneFromTwoPointsAndDepth,
  buildPlaneFromThreePoints,
  buildPlaneFromPlacementPoints,
  flipPlane,
  planeToCsgForm,
} from '@/csg/csg_plane_from_points.js';

describe('csg_plane_from_points', () => {
  it('should build a vertical plane containing two points', () => {
    const a = new THREE.Vector3(0, 0, 0);
    const b = new THREE.Vector3(2, 0, 0);
    const plane = buildVerticalPlaneFromTwoPoints(a, b);
    expect(plane).not.toBeNull();
    expect(Math.abs(plane!.distanceToPoint(a))).toBeLessThan(1e-6);
    expect(Math.abs(plane!.distanceToPoint(b))).toBeLessThan(1e-6);
    expect(Math.abs(plane!.normal.dot(new THREE.Vector3(0, 1, 0)))).toBeLessThan(1e-6);
    const edge = b.clone().sub(a).normalize();
    expect(Math.abs(plane!.normal.dot(edge))).toBeLessThan(1e-6);
  });

  it('should return null for coincident two-point input', () => {
    const a = new THREE.Vector3(1, 2, 3);
    expect(buildVerticalPlaneFromTwoPoints(a, a.clone())).toBeNull();
  });

  it('should build a plane containing two points and a camera depth axis', () => {
    const a = new THREE.Vector3(0, 1, 0);
    const b = new THREE.Vector3(2, 1, 0);
    const cameraDepth = new THREE.Vector3(0, 0, -1);
    const plane = buildPlaneFromTwoPointsAndDepth(a, b, cameraDepth);
    expect(plane).not.toBeNull();
    expect(Math.abs(plane!.distanceToPoint(a))).toBeLessThan(1e-6);
    expect(Math.abs(plane!.distanceToPoint(b))).toBeLessThan(1e-6);
    expect(Math.abs(plane!.normal.dot(cameraDepth))).toBeLessThan(1e-6);
    const edge = b.clone().sub(a).normalize();
    expect(Math.abs(plane!.normal.dot(edge))).toBeLessThan(1e-6);
  });

  it('should build a plane that cuts into a brush from a face-normal depth', () => {
    const a = new THREE.Vector3(-1, 0.5, 1);
    const b = new THREE.Vector3(1, 0.5, 1);
    const faceNormal = new THREE.Vector3(0, 0, 1);
    const plane = buildPlaneFromTwoPointsAndDepth(a, b, faceNormal);
    expect(plane).not.toBeNull();
    expect(Math.abs(plane!.distanceToPoint(a))).toBeLessThan(1e-6);
    expect(Math.abs(plane!.distanceToPoint(b))).toBeLessThan(1e-6);
    expect(Math.abs(plane!.normal.dot(faceNormal))).toBeLessThan(1e-6);
    const pointDeeperInBrush = new THREE.Vector3(0, 0.5, 0);
    expect(Math.abs(plane!.distanceToPoint(pointDeeperInBrush))).toBeLessThan(1e-6);
    const offPlane = new THREE.Vector3(0, 0, 0);
    expect(Math.abs(plane!.distanceToPoint(offPlane))).toBeGreaterThan(1e-4);
  });

  it('should fall back when edge is parallel to the preferred depth axis', () => {
    const a = new THREE.Vector3(0, 0, 0);
    const b = new THREE.Vector3(0, 0, 2);
    const depthParallelToEdge = new THREE.Vector3(0, 0, 1);
    const plane = buildPlaneFromTwoPointsAndDepth(a, b, depthParallelToEdge);
    expect(plane).not.toBeNull();
    expect(Math.abs(plane!.distanceToPoint(a))).toBeLessThan(1e-6);
    expect(Math.abs(plane!.distanceToPoint(b))).toBeLessThan(1e-6);
  });

  it('should build a free plane from three non-collinear points', () => {
    const a = new THREE.Vector3(0, 0, 0);
    const b = new THREE.Vector3(1, 0, 0);
    const c = new THREE.Vector3(0, 1, 0);
    const plane = buildPlaneFromThreePoints(a, b, c);
    expect(plane).not.toBeNull();
    expect(Math.abs(plane!.distanceToPoint(a))).toBeLessThan(1e-6);
    expect(Math.abs(plane!.distanceToPoint(b))).toBeLessThan(1e-6);
    expect(Math.abs(plane!.distanceToPoint(c))).toBeLessThan(1e-6);
  });

  it('should reject collinear three-point input', () => {
    const a = new THREE.Vector3(0, 0, 0);
    const b = new THREE.Vector3(1, 0, 0);
    const c = new THREE.Vector3(2, 0, 0);
    expect(buildPlaneFromThreePoints(a, b, c)).toBeNull();
  });

  it('should prefer three-point plane when three points are provided', () => {
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)];
    const depthIgnored = new THREE.Vector3(0, 1, 0);
    const plane = buildPlaneFromPlacementPoints(points, depthIgnored);
    expect(plane).not.toBeNull();
    points.forEach((point) => {
      expect(Math.abs(plane!.distanceToPoint(point))).toBeLessThan(1e-6);
    });
  });

  it('should use the supplied depth axis for two placement points', () => {
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)];
    const depth = new THREE.Vector3(0, 0, 1);
    const plane = buildPlaneFromPlacementPoints(points, depth);
    expect(plane).not.toBeNull();
    expect(Math.abs(plane!.normal.dot(depth))).toBeLessThan(1e-6);
  });

  it('should flip plane half-spaces', () => {
    const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), -1);
    const flipped = flipPlane(plane);
    expect(flipped.normal.x).toBeCloseTo(-1);
    expect(flipped.constant).toBeCloseTo(1);
  });

  it('should convert Three.js plane to CSG n·x = c form', () => {
    const point = new THREE.Vector3(2, 0, 0);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(1, 0, 0), point);
    const csg = planeToCsgForm(plane);
    expect(csg.normal.x).toBeCloseTo(1);
    expect(csg.constant).toBeCloseTo(2);
  });
});

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { closestParameterOnSegmentToRay, closestPointOnSegmentToRay } from '@/utils/ray_segment_closest.js';

describe('ray_segment_closest', () => {
  it('places the closest point under a ray that aims near the middle of a long edge', () => {
    const segmentA = new THREE.Vector3(-10, 0, 0);
    const segmentB = new THREE.Vector3(10, 0, 0);
    const rayOrigin = new THREE.Vector3(4, 5, 0);
    const rayDirection = new THREE.Vector3(0, -1, 0);
    const point = closestPointOnSegmentToRay(segmentA, segmentB, rayOrigin, rayDirection);
    expect(point.x).toBeCloseTo(4, 5);
    expect(point.y).toBeCloseTo(0, 5);
    expect(point.z).toBeCloseTo(0, 5);
  });

  it('clamps to the nearer endpoint when the ray aims past the segment', () => {
    const segmentA = new THREE.Vector3(0, 0, 0);
    const segmentB = new THREE.Vector3(2, 0, 0);
    const rayOrigin = new THREE.Vector3(8, 3, 0);
    const rayDirection = new THREE.Vector3(0, -1, 0);
    const parameter = closestParameterOnSegmentToRay(segmentA, segmentB, rayOrigin, rayDirection);
    expect(parameter).toBeCloseTo(1, 5);
  });

  it('does not use a screen-style midpoint for a foreshortened long edge', () => {
    const segmentA = new THREE.Vector3(-20, 0, -5);
    const segmentB = new THREE.Vector3(20, 0, -5);
    const rayOrigin = new THREE.Vector3(12, 8, 10);
    const rayDirection = new THREE.Vector3(0, -1, -1).normalize();
    const point = closestPointOnSegmentToRay(segmentA, segmentB, rayOrigin, rayDirection);
    expect(point.x).toBeCloseTo(12, 4);
    expect(Math.abs(point.x)).toBeGreaterThan(5);
  });
});

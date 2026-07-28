import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { GridLineBuffer } from '../../../src/viewports/grid/grid_line_buffer.js';

/**
 * Reads a line segment's six position floats from the buffer geometry.
 *
 * @param buffer Buffer under test after endFrame.
 * @param segmentIndex Zero-based segment index.
 * @returns Endpoint coordinates [ax, ay, az, bx, by, bz].
 */
function readSegmentPositions(buffer: GridLineBuffer, segmentIndex: number): number[] {
  const attribute = buffer.getObject().geometry.getAttribute('position') as THREE.BufferAttribute;
  const base = segmentIndex * 2;
  return [
    attribute.getX(base),
    attribute.getY(base),
    attribute.getZ(base),
    attribute.getX(base + 1),
    attribute.getY(base + 1),
    attribute.getZ(base + 1),
  ];
}

describe('GridLineBuffer', () => {
  let buffer: GridLineBuffer;
  let colorA: THREE.Color;
  let colorB: THREE.Color;

  beforeEach(() => {
    buffer = new GridLineBuffer();
    colorA = new THREE.Color(1, 0, 0);
    colorB = new THREE.Color(0, 1, 0);
  });

  it('exposes a LineSegments object with frustum culling disabled', () => {
    const lines = buffer.getObject();
    expect(lines).toBeInstanceOf(THREE.LineSegments);
    expect(lines.frustumCulled).toBe(false);
  });

  it('reports zero segments before any lines are added', () => {
    buffer.beginFrame();
    buffer.endFrame();
    expect(buffer.getSegmentCount()).toBe(0);
  });

  it('stores endpoint positions for added segments', () => {
    buffer.beginFrame();
    buffer.addLine(1, 2, 3, 4, 5, 6, colorA, colorB);
    buffer.endFrame();
    expect(buffer.getSegmentCount()).toBe(1);
    expect(readSegmentPositions(buffer, 0)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('stores per-endpoint vertex colors', () => {
    buffer.beginFrame();
    buffer.addLine(0, 0, 0, 1, 0, 0, colorA, colorB);
    buffer.endFrame();
    const colors = buffer.getObject().geometry.getAttribute('color') as THREE.BufferAttribute;
    expect([colors.getX(0), colors.getY(0), colors.getZ(0)]).toEqual([1, 0, 0]);
    expect([colors.getX(1), colors.getY(1), colors.getZ(1)]).toEqual([0, 1, 0]);
  });

  it('clears previous frame content when beginFrame is called', () => {
    buffer.beginFrame();
    buffer.addLine(0, 0, 0, 1, 0, 0, colorA, colorB);
    buffer.endFrame();
    expect(buffer.getSegmentCount()).toBe(1);
    buffer.beginFrame();
    buffer.addLine(2, 0, 0, 3, 0, 0, colorA, colorB);
    buffer.endFrame();
    expect(buffer.getSegmentCount()).toBe(1);
    expect(readSegmentPositions(buffer, 0)).toEqual([2, 0, 0, 3, 0, 0]);
  });

  it('grows capacity without losing earlier segments in the same frame', () => {
    buffer.beginFrame();
    const segmentCount = 1200;
    for (let i = 0; i < segmentCount; i++) {
      buffer.addLine(i, 0, 0, i + 1, 0, 0, colorA, colorB);
    }
    buffer.endFrame();
    expect(buffer.getSegmentCount()).toBe(segmentCount);
    expect(readSegmentPositions(buffer, 0)).toEqual([0, 0, 0, 1, 0, 0]);
    expect(readSegmentPositions(buffer, segmentCount - 1)).toEqual([segmentCount - 1, 0, 0, segmentCount, 0, 0]);
  });

  it('reuses capacity across frames after a large first upload', () => {
    buffer.beginFrame();
    for (let i = 0; i < 500; i++) {
      buffer.addLine(i, 0, 0, i + 1, 0, 0, colorA, colorB);
    }
    buffer.endFrame();
    const firstGeometry = buffer.getObject().geometry;
    const firstPosition = firstGeometry.getAttribute('position');
    buffer.beginFrame();
    for (let i = 0; i < 500; i++) {
      buffer.addLine(i, 1, 0, i + 1, 1, 0, colorA, colorB);
    }
    buffer.endFrame();
    expect(buffer.getObject().geometry).toBe(firstGeometry);
    expect(buffer.getObject().geometry.getAttribute('position')).toBe(firstPosition);
    expect(buffer.getSegmentCount()).toBe(500);
    expect(readSegmentPositions(buffer, 0)).toEqual([0, 1, 0, 1, 1, 0]);
  });

  it('applies depth test and render order on the line mesh', () => {
    buffer.setDepthTest(true);
    buffer.setRenderOrder(-1);
    const lines = buffer.getObject();
    const material = lines.material as THREE.LineBasicMaterial;
    expect(material.depthTest).toBe(true);
    expect(lines.renderOrder).toBe(-1);
  });

  it('disposes without throwing after use', () => {
    buffer.beginFrame();
    buffer.addLine(0, 0, 0, 1, 0, 0, colorA, colorB);
    buffer.endFrame();
    expect(() => buffer.dispose()).not.toThrow();
  });
});

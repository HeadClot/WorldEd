import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CadRulerLineBatch } from '@/rulers/system/cad_ruler_line_batch.js';
import type { CadLineSegment } from '@/rulers/dimension/cad_dimension_geometry.js';

describe('CadRulerLineBatch', () => {
  let batch: CadRulerLineBatch;

  beforeEach(() => {
    batch = new CadRulerLineBatch('test_batch');
  });

  it('should start empty and hidden', () => {
    expect(batch.getSegmentCount()).toBe(0);
    expect(batch.isVisible()).toBe(false);
  });

  it('should upload segments and become visible', () => {
    const color = new THREE.Color(0xffffff);
    const segments: CadLineSegment[] = [
      { ax: 0, ay: 0, az: 0, bx: 1, by: 0, bz: 0, colorA: color, colorB: color },
      { ax: 0, ay: 0, az: 0, bx: 0, by: 1, bz: 0, colorA: color, colorB: color },
    ];
    batch.setSegments(segments);
    expect(batch.getSegmentCount()).toBe(2);
    expect(batch.isVisible()).toBe(true);
  });

  it('should clear segments and hide', () => {
    const color = new THREE.Color(0xffffff);
    batch.setSegments([{ ax: 0, ay: 0, az: 0, bx: 1, by: 0, bz: 0, colorA: color, colorB: color }]);
    batch.clear();
    expect(batch.getSegmentCount()).toBe(0);
    expect(batch.isVisible()).toBe(false);
  });

  it('should mark the root as a CAD ruler helper', () => {
    expect(batch.getObject().userData['isCadRuler']).toBe(true);
  });

  it('should grow capacity for large segment uploads without throwing', () => {
    const color = new THREE.Color(0xffffff);
    const segments: CadLineSegment[] = [];
    for (let index = 0; index < 200; index += 1) {
      segments.push({
        ax: index,
        ay: 0,
        az: 0,
        bx: index + 1,
        by: 0,
        bz: 0,
        colorA: color,
        colorB: color,
      });
    }
    expect(() => batch.setSegments(segments)).not.toThrow();
    expect(batch.getSegmentCount()).toBe(200);
  });

  it('reuses buffer attributes across same-capacity uploads', () => {
    const color = new THREE.Color(0xffffff);
    const first: CadLineSegment[] = [{ ax: 0, ay: 0, az: 0, bx: 1, by: 0, bz: 0, colorA: color, colorB: color }];
    batch.setSegments(first);
    expect(batch.hasStableAttributes()).toBe(true);
    const geometry = batch.getObject().children.find((child) => child instanceof THREE.LineSegments) as
      THREE.LineSegments | undefined;
    expect(geometry).toBeDefined();
    const positionBefore = geometry!.geometry.getAttribute('position');
    batch.setSegments([
      { ax: 2, ay: 0, az: 0, bx: 3, by: 0, bz: 0, colorA: color, colorB: color },
      { ax: 0, ay: 1, az: 0, bx: 0, by: 2, bz: 0, colorA: color, colorB: color },
    ]);
    const positionAfter = geometry!.geometry.getAttribute('position');
    expect(positionAfter).toBe(positionBefore);
    expect(batch.hasStableAttributes()).toBe(true);
  });

  it('should dispose without throwing', () => {
    expect(() => batch.dispose()).not.toThrow();
  });

  it('disables depth testing and hides occluded pass for orthographic 2D', () => {
    const color = new THREE.Color(0xffffff);
    batch.setSegments([{ ax: 0, ay: 0, az: 0, bx: 1, by: 0, bz: 0, colorA: color, colorB: color }]);
    expect(batch.isDepthOcclusionEnabled()).toBe(true);
    expect(batch.getFrontMaterial().depthTest).toBe(true);
    expect(batch.isOccludedPassVisible()).toBe(true);
    batch.setDepthOcclusionEnabled(false);
    expect(batch.isDepthOcclusionEnabled()).toBe(false);
    expect(batch.getFrontMaterial().depthTest).toBe(false);
    expect(batch.getFrontMaterial().depthFunc).toBe(THREE.AlwaysDepth);
    expect(batch.getOccludedMaterial().depthTest).toBe(false);
    expect(batch.isOccludedPassVisible()).toBe(false);
    batch.setDepthOcclusionEnabled(true);
    expect(batch.getFrontMaterial().depthTest).toBe(true);
    expect(batch.getFrontMaterial().depthFunc).toBe(THREE.LessEqualDepth);
    expect(batch.getOccludedMaterial().depthFunc).toBe(THREE.GreaterDepth);
    expect(batch.isOccludedPassVisible()).toBe(true);
  });

  it('uses the screen-pixel dashed shader and line endpoint attributes when dashed', () => {
    const dashedBatch = new CadRulerLineBatch('dashed_batch', 0.95, 0.22, { dashed: true });
    const color = new THREE.Color(0x5ec8ff);
    dashedBatch.setSegments([{ ax: 0, ay: 0, az: 0, bx: 2, by: 0, bz: 0, colorA: color, colorB: color }]);
    expect(dashedBatch.isDashed()).toBe(true);
    expect(dashedBatch.getFrontMaterial()).toBeInstanceOf(THREE.ShaderMaterial);
    expect(dashedBatch.getOccludedMaterial()).toBeInstanceOf(THREE.ShaderMaterial);
    const geometry = dashedBatch.getObject().children.find((child) => child instanceof THREE.LineSegments) as
      THREE.LineSegments | undefined;
    expect(geometry).toBeDefined();
    expect(geometry!.geometry.getAttribute('lineStart')).toBeDefined();
    expect(geometry!.geometry.getAttribute('lineEnd')).toBeDefined();
    const lineStart = geometry!.geometry.getAttribute('lineStart') as THREE.BufferAttribute;
    expect(lineStart.getX(0)).toBeCloseTo(0);
    expect(lineStart.getX(1)).toBeCloseTo(0);
    const lineEnd = geometry!.geometry.getAttribute('lineEnd') as THREE.BufferAttribute;
    expect(lineEnd.getX(0)).toBeCloseTo(2);
    expect(lineEnd.getX(1)).toBeCloseTo(2);
    dashedBatch.dispose();
  });
});

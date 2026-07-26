import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  BOUNDS_GUIDE_DASH_PIXELS,
  BOUNDS_GUIDE_GAP_PIXELS,
  createBoundsGuideFrontLineMaterial,
  createBoundsGuideOccludedLineMaterial,
} from '../../../src/transform/bounds/bounds_guide_line_material.js';
import { GizmoVisualStyle } from '../../../src/transform/gizmo/gizmo_visual_style.js';

describe('bounds_guide_line_material', () => {
  it('should create a front dashed shader with depth-tested opacity', () => {
    const material = createBoundsGuideFrontLineMaterial();
    expect(material).toBeInstanceOf(THREE.ShaderMaterial);
    expect(material.depthTest).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.depthFunc).toBe(THREE.LessEqualDepth);
    expect(material.transparent).toBe(true);
    expect(material.uniforms['opacity']!.value).toBeCloseTo(GizmoVisualStyle.frontOpacity);
    expect(material.uniforms['dashSize']!.value).toBeCloseTo(BOUNDS_GUIDE_DASH_PIXELS);
    expect(material.uniforms['gapSize']!.value).toBeCloseTo(BOUNDS_GUIDE_GAP_PIXELS);
    expect(material.uniforms['resolution']!.value).toBeInstanceOf(THREE.Vector2);
    material.dispose();
  });

  it('should create an occluded ghost dashed shader with lower opacity', () => {
    const front = createBoundsGuideFrontLineMaterial();
    const occluded = createBoundsGuideOccludedLineMaterial();
    expect(occluded).toBeInstanceOf(THREE.ShaderMaterial);
    expect(occluded.depthFunc).toBe(THREE.GreaterDepth);
    expect(occluded.uniforms['opacity']!.value).toBeCloseTo(GizmoVisualStyle.occludedOpacity);
    expect(occluded.uniforms['opacity']!.value).toBeLessThan(front.uniforms['opacity']!.value);
    expect(occluded.uniforms['dashSize']!.value).toBeCloseTo(BOUNDS_GUIDE_DASH_PIXELS);
    front.dispose();
    occluded.dispose();
  });

  it('should project both endpoints to pixels for screen-stable dashes', () => {
    const material = createBoundsGuideFrontLineMaterial();
    expect(BOUNDS_GUIDE_DASH_PIXELS).toBeLessThanOrEqual(6);
    expect(BOUNDS_GUIDE_GAP_PIXELS).toBeLessThanOrEqual(5);
    expect(material.vertexShader).toContain('otherEnd');
    expect(material.vertexShader).toContain('resolution');
    expect(material.vertexShader).toContain('segmentPixels');
    expect(material.fragmentShader).toContain('vPixelFromTip');
    expect(material.fragmentShader).toContain('discard');
    expect(material.fragmentShader).not.toContain('fwidth');
    expect(typeof material.onBeforeRender).toBe('function');
    material.dispose();
  });

  it('should refresh the resolution uniform from the drawing buffer size', () => {
    const material = createBoundsGuideFrontLineMaterial();
    const renderer = {
      getDrawingBufferSize: (target: THREE.Vector2) => target.set(1280, 720),
    } as unknown as THREE.WebGLRenderer;
    material.onBeforeRender!(
      renderer,
      {} as THREE.Scene,
      {} as THREE.Camera,
      {} as THREE.BufferGeometry,
      {} as THREE.Object3D,
      undefined,
    );
    const resolution = material.uniforms['resolution']!.value as THREE.Vector2;
    expect(resolution.x).toBe(1280);
    expect(resolution.y).toBe(720);
    material.dispose();
  });
});

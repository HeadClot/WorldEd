import * as THREE from 'three';
import { GizmoVisualStyle } from '../gizmo/gizmo_visual_style.js';

/** Screen-space dash length in pixels for bounds guide rays. */
export const BOUNDS_GUIDE_DASH_PIXELS = 5;

/** Screen-space gap length in pixels between dashes on bounds guide rays. */
export const BOUNDS_GUIDE_GAP_PIXELS = 4;

/**
 * Vertex shader: projects guide rays and forwards tip-aligned world distance
 * for screen-space dash conversion in the fragment stage.
 */
const GUIDE_LINE_VERTEX_SHADER = `
  attribute float lineDistance;
  attribute vec3 color;
  varying float vLineDistance;
  varying vec3 vColor;

  void main() {
    vLineDistance = lineDistance;
    vColor = color;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Fragment shader: converts world distance along the ray into pixels via fwidth
 * so dash size stays zoom-stable in 2D and 3D. lineDistance is 0 at the tip so
 * a full dash lands on the hit target.
 */
const GUIDE_LINE_FRAGMENT_SHADER = `
  uniform float opacity;
  uniform float dashSize;
  uniform float gapSize;
  varying float vLineDistance;
  varying vec3 vColor;

  void main() {
    float distanceChangePerPixel = fwidth(vLineDistance);
    float pixelsFromTip = vLineDistance / max(distanceChangePerPixel, 1e-6);
    float period = dashSize + gapSize;
    float phase = mod(pixelsFromTip, period);
    if (phase > dashSize) discard;
    gl_FragColor = vec4(vColor, opacity);
  }
`;

/**
 * Creates the front-pass dashed material for bounds guide lines (depth-tested).
 *
 * @returns Shader material that draws unoccluded dashed rays.
 */
export function createBoundsGuideFrontLineMaterial(): THREE.ShaderMaterial {
  return createBoundsGuideLineMaterial(GizmoVisualStyle.frontOpacity, THREE.LessEqualDepth);
}

/**
 * Creates the occluded ghost dashed material for bounds guide lines.
 *
 * @returns Shader material that draws dashed rays behind scene geometry.
 */
export function createBoundsGuideOccludedLineMaterial(): THREE.ShaderMaterial {
  return createBoundsGuideLineMaterial(GizmoVisualStyle.occludedOpacity, THREE.GreaterDepth);
}

/**
 * Builds one dual-pass-compatible dashed guide line material.
 *
 * @param opacity Base alpha for the pass.
 * @param depthFunc Depth comparison for front or occluded rendering.
 * @returns Configured shader material.
 */
function createBoundsGuideLineMaterial(opacity: number, depthFunc: THREE.DepthModes): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: buildBoundsGuideLineUniforms(opacity),
    vertexShader: GUIDE_LINE_VERTEX_SHADER,
    fragmentShader: GUIDE_LINE_FRAGMENT_SHADER,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    depthFunc,
    toneMapped: false,
  });
}

/**
 * Builds dash and opacity uniforms for a guide line material.
 *
 * @param opacity Base alpha for the pass.
 * @returns Shader uniform map.
 */
function buildBoundsGuideLineUniforms(opacity: number): Record<string, THREE.IUniform> {
  return {
    opacity: { value: opacity },
    dashSize: { value: BOUNDS_GUIDE_DASH_PIXELS },
    gapSize: { value: BOUNDS_GUIDE_GAP_PIXELS },
  };
}

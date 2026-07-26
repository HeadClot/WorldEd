import * as THREE from 'three';
import { GizmoVisualStyle } from '../gizmo/gizmo_visual_style.js';

/** Screen-space dash length in pixels for bounds guide rays. */
export const BOUNDS_GUIDE_DASH_PIXELS = 5;

/** Screen-space gap length in pixels between dashes on bounds guide rays. */
export const BOUNDS_GUIDE_GAP_PIXELS = 4;

/**
 * Vertex shader: projects both endpoints of a segment to pixels so dash length
 * is true screen-space in perspective and orthographic views.
 */
const GUIDE_LINE_VERTEX_SHADER = `
  attribute float lineParam;
  attribute vec3 otherEnd;
  attribute vec3 color;
  uniform vec2 resolution;
  varying float vPixelFromTip;
  varying vec3 vColor;

  vec2 clipToScreen(vec4 clip) {
    float safeW = abs(clip.w) < 1e-6 ? 1e-6 : clip.w;
    vec2 ndc = clip.xy / safeW;
    return (ndc * 0.5 + 0.5) * resolution;
  }

  void main() {
    vec4 clipThis = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vec4 clipOther = projectionMatrix * modelViewMatrix * vec4(otherEnd, 1.0);
    gl_Position = clipThis;
    float segmentPixels = length(clipToScreen(clipThis) - clipToScreen(clipOther));
    vPixelFromTip = lineParam * segmentPixels;
    vColor = color;
  }
`;

/**
 * Fragment shader: discards gap pixels using a fixed pixel period so dash size
 * stays constant under zoom and perspective foreshortening.
 */
const GUIDE_LINE_FRAGMENT_SHADER = `
  uniform float opacity;
  uniform float dashSize;
  uniform float gapSize;
  varying float vPixelFromTip;
  varying vec3 vColor;

  void main() {
    float period = dashSize + gapSize;
    float phase = mod(vPixelFromTip, period);
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
  const material = new THREE.ShaderMaterial({
    uniforms: buildBoundsGuideLineUniforms(opacity),
    vertexShader: GUIDE_LINE_VERTEX_SHADER,
    fragmentShader: GUIDE_LINE_FRAGMENT_SHADER,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    depthFunc,
    toneMapped: false,
  });
  material.onBeforeRender = (renderer) => {
    updateBoundsGuideResolutionUniform(material, renderer);
  };
  return material;
}

/**
 * Builds dash, gap, opacity, and resolution uniforms for a guide line material.
 *
 * @param opacity Base alpha for the pass.
 * @returns Shader uniform map.
 */
function buildBoundsGuideLineUniforms(opacity: number): Record<string, THREE.IUniform> {
  return {
    opacity: { value: opacity },
    dashSize: { value: BOUNDS_GUIDE_DASH_PIXELS },
    gapSize: { value: BOUNDS_GUIDE_GAP_PIXELS },
    resolution: { value: new THREE.Vector2(1, 1) },
  };
}

/**
 * Writes the active drawing-buffer resolution into a guide material.
 *
 * @param material Guide line shader material.
 * @param renderer Renderer currently drawing the material.
 */
function updateBoundsGuideResolutionUniform(
  material: THREE.ShaderMaterial,
  renderer: THREE.WebGLRenderer,
): void {
  const resolution = material.uniforms['resolution']?.value as THREE.Vector2 | undefined;
  if (!resolution) return;
  const size = new THREE.Vector2();
  renderer.getDrawingBufferSize(size);
  resolution.copy(size);
}

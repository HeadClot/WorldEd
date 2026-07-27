import * as THREE from 'three';
import { GizmoVisualStyle } from '../gizmo/gizmo_visual_style.js';

/** Drawn dash length in framebuffer pixels along the projected line. */
export const BOUNDS_GUIDE_DASH_PIXELS = 6;

/** Gap length in framebuffer pixels between dashes along the projected line. */
export const BOUNDS_GUIDE_GAP_PIXELS = 5;

/**
 * Vertex shader: projects both segment endpoints into the active multi-view
 * window and passes them as constants along the primitive (same values at both
 * vertices). Dash distance is measured in the fragment stage from gl_FragCoord
 * so perspective-correct interpolation cannot stretch dashes with depth.
 */
const GUIDE_LINE_VERTEX_SHADER = `
  attribute vec3 lineStart;
  attribute vec3 lineEnd;
  attribute vec3 color;
  uniform vec4 viewport;
  varying vec2 vScreenStart;
  varying vec2 vScreenEnd;
  varying vec3 vColor;

  vec2 clipToWindow(vec4 clip) {
    float safeW = abs(clip.w) < 1e-6 ? 1e-6 : clip.w;
    vec2 ndc = clip.xy / safeW;
    return viewport.xy + (ndc * 0.5 + 0.5) * viewport.zw;
  }

  void main() {
    vec4 clipThis = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = clipThis;
    // lineStart / lineEnd are authored identically on both segment vertices, so
    // interpolated screen endpoints stay constant across the stroke.
    vScreenStart = clipToWindow(projectionMatrix * modelViewMatrix * vec4(lineStart, 1.0));
    vScreenEnd = clipToWindow(projectionMatrix * modelViewMatrix * vec4(lineEnd, 1.0));
    vColor = color;
  }
`;

/**
 * Fragment shader: true monitor-pixel dashing. Distance is the projection of
 * gl_FragCoord onto the screen-space segment — never a world-space length and
 * never a perspective-warped varying.
 */
const GUIDE_LINE_FRAGMENT_SHADER = `
  uniform float opacity;
  uniform float dashSize;
  uniform float gapSize;
  varying vec2 vScreenStart;
  varying vec2 vScreenEnd;
  varying vec3 vColor;

  void main() {
    vec2 segment = vScreenEnd - vScreenStart;
    float segmentLength = length(segment);
    float distAlong = 0.0;
    if (segmentLength > 1e-4) {
      distAlong = dot(gl_FragCoord.xy - vScreenStart, segment / segmentLength);
    }
    float period = max(dashSize + gapSize, 1.0);
    float phase = mod(distAlong, period);
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
    updateBoundsGuideViewportUniform(material, renderer);
  };
  return material;
}

/**
 * Builds dash, gap, opacity, and viewport uniforms for a guide line material.
 *
 * @param opacity Base alpha for the pass.
 * @returns Shader uniform map.
 */
function buildBoundsGuideLineUniforms(opacity: number): Record<string, THREE.IUniform> {
  return {
    opacity: { value: opacity },
    dashSize: { value: BOUNDS_GUIDE_DASH_PIXELS },
    gapSize: { value: BOUNDS_GUIDE_GAP_PIXELS },
    // xy = viewport origin, zw = viewport size in drawing-buffer pixels.
    viewport: { value: new THREE.Vector4(0, 0, 1, 1) },
  };
}

/**
 * Writes the active scissor viewport (drawing-buffer pixels) into the material.
 *
 * @param material Guide line shader material.
 * @param renderer Renderer currently drawing the material.
 */
function updateBoundsGuideViewportUniform(material: THREE.ShaderMaterial, renderer: THREE.WebGLRenderer): void {
  const viewportUniform = material.uniforms['viewport']?.value as THREE.Vector4 | undefined;
  if (!viewportUniform) return;
  const current = new THREE.Vector4();
  renderer.getCurrentViewport(current);
  viewportUniform.copy(current);
}

/**
 * Returns whether a screen-pixel distance along a guide ray is inside a dash.
 *
 * @param pixelAlongLine Distance in screen pixels from the segment start.
 * @param dashSize Drawn dash length in pixels.
 * @param gapSize Gap length in pixels.
 * @returns True when the fragment should be drawn.
 */
export function isBoundsGuideDashPixelDrawn(
  pixelAlongLine: number,
  dashSize: number = BOUNDS_GUIDE_DASH_PIXELS,
  gapSize: number = BOUNDS_GUIDE_GAP_PIXELS,
): boolean {
  const period = Math.max(dashSize + gapSize, 1);
  const phase = ((pixelAlongLine % period) + period) % period;
  return phase <= dashSize;
}

/**
 * Projects a fragment onto a screen-space segment and returns distance along
 * it. Mirrors the fragment shader math for unit tests.
 *
 * @param fragmentX Framebuffer X (gl_FragCoord.x).
 * @param fragmentY Framebuffer Y (gl_FragCoord.y).
 * @param startX Segment start X in the same space.
 * @param startY Segment start Y in the same space.
 * @param endX Segment end X in the same space.
 * @param endY Segment end Y in the same space.
 * @returns Signed distance along the segment in pixels.
 */
export function measureScreenPixelDistanceAlongSegment(
  fragmentX: number,
  fragmentY: number,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): number {
  const dx = endX - startX;
  const dy = endY - startY;
  const length = Math.hypot(dx, dy);
  if (length <= 1e-4) return 0;
  return ((fragmentX - startX) * dx + (fragmentY - startY) * dy) / length;
}

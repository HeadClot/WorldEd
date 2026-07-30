import { Theme } from '@/theme.js';

/**
 * Visual and interaction constants for clip plane placement markers. Sized for
 * a professional world-editor feel (small, readable, easy to grab). Point
 * colors are distinct so the three plane points stay recognizable across
 * views.
 */

/** World-space radius of the solid marker core at unit scale. */
export const CLIP_MARKER_CORE_RADIUS = 0.028;

/** World-space radius of the dark halo behind the core at unit scale. */
export const CLIP_MARKER_HALO_RADIUS = 0.042;

/** World-space radius of the light rim between halo and core. */
export const CLIP_MARKER_RIM_RADIUS = 0.036;

/**
 * Multiplier from camera distance (perspective) or half-height (ortho) to
 * marker scale so markers stay roughly constant on screen.
 */
export const CLIP_MARKER_DISTANCE_SCALE = 0.028;

/** Minimum marker scale so points never become unusable when zoomed in. */
export const CLIP_MARKER_MIN_SCALE = 0.55;

/** Maximum marker scale so points never dominate the view when far away. */
export const CLIP_MARKER_MAX_SCALE = 4.5;

/** Screen-space pick radius in CSS pixels for grabbing a marker. */
export const CLIP_MARKER_PICK_PIXELS = 18;

/** UserData key storing the placement point index on a marker group. */
export const CLIP_MARKER_INDEX_KEY = 'clipPlaneMarkerIndex';

/**
 * Returns the display color for a clip placement point index.
 *
 * @param pointIndex Zero-based point index (0, 1, or 2).
 * @returns Theme hex color for that point.
 */
export function getClipPointColor(pointIndex: number): number {
  if (pointIndex === 0) return Theme.clipPoint1Color;
  if (pointIndex === 1) return Theme.clipPoint2Color;
  return Theme.clipPoint3Color;
}

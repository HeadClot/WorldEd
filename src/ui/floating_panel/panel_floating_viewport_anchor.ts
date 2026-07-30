import type { ViewportEditor } from '@/viewports/core/viewport_editor.js';
import { isPerspectiveViewport } from '@/viewports/core/viewport_editor.js';

/**
 * Chooses which viewport should host floating tool-window startup placement.
 *
 * Rules:
 *
 * 1. Prefer perspective viewports.
 * 2. If several perspectives exist, pick the largest by client area.
 * 3. If none are perspective, pick the top-leftmost viewport (min top, then left).
 *
 * @param viewports Live editor viewports (any order).
 * @returns Chosen viewport, or null when the list is empty.
 */
export function resolveFloatingPanelAnchorViewport(viewports: readonly ViewportEditor[]): ViewportEditor | null {
  if (viewports.length === 0) return null;
  const perspectiveViewports = viewports.filter(isPerspectiveViewport);
  if (perspectiveViewports.length === 1) {
    return perspectiveViewports[0]!;
  }
  if (perspectiveViewports.length > 1) {
    return pickLargestViewportByClientArea(perspectiveViewports);
  }
  return pickTopLeftViewport(viewports);
}

/**
 * Resolves the DOM container used for floating panel placement.
 *
 * @param viewports Live editor viewports.
 * @returns Viewport container element, or null when none are available.
 */
export function resolveFloatingPanelAnchorElement(viewports: readonly ViewportEditor[]): HTMLElement | null {
  const viewport = resolveFloatingPanelAnchorViewport(viewports);
  return viewport?.getContainer() ?? null;
}

/**
 * Picks the viewport with the largest client pixel area.
 *
 * @param viewports Candidates (typically perspective panes).
 * @returns Viewport with max width×height (stable on ties: first wins).
 */
function pickLargestViewportByClientArea(viewports: readonly ViewportEditor[]): ViewportEditor {
  let best = viewports[0]!;
  let bestArea = measureViewportClientArea(best);
  for (let i = 1; i < viewports.length; i++) {
    const candidate = viewports[i]!;
    const area = measureViewportClientArea(candidate);
    if (area > bestArea) {
      best = candidate;
      bestArea = area;
    }
  }
  return best;
}

/**
 * Picks the top-leftmost viewport by container screen rect.
 *
 * @param viewports Candidates.
 * @returns Viewport with smallest top, then smallest left.
 */
function pickTopLeftViewport(viewports: readonly ViewportEditor[]): ViewportEditor {
  let best = viewports[0]!;
  let bestRect = best.getContainer().getBoundingClientRect();
  for (let i = 1; i < viewports.length; i++) {
    const candidate = viewports[i]!;
    const rect = candidate.getContainer().getBoundingClientRect();
    if (rect.top < bestRect.top - 0.5) {
      best = candidate;
      bestRect = rect;
      continue;
    }
    if (Math.abs(rect.top - bestRect.top) <= 0.5 && rect.left < bestRect.left - 0.5) {
      best = candidate;
      bestRect = rect;
    }
  }
  return best;
}

/**
 * Measures a viewport container's client area in CSS pixels.
 *
 * @param viewport Viewport to measure.
 * @returns Non-negative width×height product.
 */
function measureViewportClientArea(viewport: ViewportEditor): number {
  const rect = viewport.getContainer().getBoundingClientRect();
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

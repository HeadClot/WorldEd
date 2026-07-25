/**
 * Visual constants for CAD-style dimension rulers. Offsets are expressed in
 * screen pixels and converted to world units from the active camera so growing
 * a brush does not shove dimensions across the map.
 */
export const CadRulerStyle = {
  /**
   * Screen-pixel stand-off from the measured edge to the dimension line. Kept
   * small so rulers stay next to the brush in 2D and 3D.
   */
  dimensionOffsetPixels: 18,
  /**
   * Screen-pixel overshoot of extension legs past the dimension line. Zero
   * makes gray extension legs stop exactly on the blue dimension line.
   */
  extensionOvershootPixels: 0,
  /**
   * Extension legs start on the measured mesh edge (0). Non-zero values create
   * the disconnected "H" look.
   */
  extensionGapPixels: 0,
  /** Clamp for world stand-off on tiny orthographic zooms. */
  minimumOffsetWorld: 0.02,
  /** Clamp for world stand-off so huge perspective distances stay readable. */
  maximumOffsetWorld: 2.5,
  /** Ghost wire opacity (front pass). */
  ghostFrontOpacity: 0.55,
  /** Ghost wire opacity (occluded pass). */
  ghostOccludedOpacity: 0.18,
  /** Dimension line front opacity. */
  lineFrontOpacity: 0.95,
  /** Dimension line occluded opacity. */
  lineOccludedOpacity: 0.22,
  /** Render order for occluded ruler geometry. */
  occludedRenderOrder: 990,
  /** Render order for front ruler geometry. */
  frontRenderOrder: 991,
  /**
   * Maximum fractional digits for distance labels. Fine snap steps like 0.03125
   * need five places; trailing zeros are stripped at format time.
   */
  distanceDecimals: 5,
  /** Ignore translation components smaller than this when drawing delta labels. */
  deltaDisplayEpsilon: 1e-5,
} as const;

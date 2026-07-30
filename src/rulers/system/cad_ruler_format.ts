import { CadRulerStyle } from './cad_ruler_style.js';

/**
 * Formats a world-space length for CAD dimension labels. Uses up to five
 * fractional digits (for fine snap steps such as 0.03125) and strips trailing
 * zeros.
 *
 * @param distance Absolute length in world units.
 * @returns Compact display string without unit suffix.
 */
export function formatCadDistance(distance: number): string {
  const absolute = Math.abs(distance);
  if (absolute < 1e-9) return '0';
  if (absolute >= 10000) return absolute.toFixed(0);
  if (absolute >= 1000) return trimTrailingZeros(absolute.toFixed(1));
  return trimTrailingZeros(absolute.toFixed(CadRulerStyle.distanceDecimals));
}

/**
 * Removes trailing fractional zeros while keeping a leading integer part.
 *
 * @param value Fixed-decimal string.
 * @returns Compact numeric string.
 */
function trimTrailingZeros(value: string): string {
  if (!value.includes('.')) return value;
  return value.replace(/\.?0+$/, '');
}

/**
 * Formats a signed component delta for drag feedback.
 *
 * @param delta Signed offset along one axis.
 * @returns Signed compact string such as "+1.25" or "-0.03125".
 */
export function formatCadSignedDelta(delta: number): string {
  if (Math.abs(delta) < 1e-9) return '0';
  const sign = delta > 0 ? '+' : '-';
  return `${sign}${formatCadDistance(delta)}`;
}

/**
 * Formats a three-component drag delta for status text.
 *
 * @param deltaX Signed X component.
 * @param deltaY Signed Y component.
 * @param deltaZ Signed Z component.
 * @returns Status-bar friendly summary.
 */
export function formatCadDeltaStatus(deltaX: number, deltaY: number, deltaZ: number): string {
  const total = Math.hypot(deltaX, deltaY, deltaZ);
  return `Δ ${formatCadSignedDelta(deltaX)}, ${formatCadSignedDelta(deltaY)}, ${formatCadSignedDelta(deltaZ)} | ${formatCadDistance(total)}`;
}

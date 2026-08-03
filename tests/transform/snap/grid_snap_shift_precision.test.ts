import { describe, it, expect, beforeEach } from 'vitest';
import { GridSnap } from '@/transform/snap/grid_snap.js';
import {
  applyGridSnapPrecisionFromShift,
  restoreGridSnapUserPreference,
} from '@/transform/snap/grid_snap_shift_precision.js';

describe('applyGridSnapPrecisionFromShift', () => {
  let gridSnap: GridSnap;

  beforeEach(() => {
    gridSnap = new GridSnap(true, 1);
  });

  it('disables snap while Shift is held even when user snap is on', () => {
    applyGridSnapPrecisionFromShift(gridSnap, true, true);
    expect(gridSnap.isEnabled()).toBe(false);
  });

  it('restores user snap preference when Shift is not held', () => {
    gridSnap.setEnabled(false);
    applyGridSnapPrecisionFromShift(gridSnap, false, true);
    expect(gridSnap.isEnabled()).toBe(true);
  });

  it('keeps snap off when Shift is released and user snap is off', () => {
    gridSnap.setEnabled(true);
    applyGridSnapPrecisionFromShift(gridSnap, false, false);
    expect(gridSnap.isEnabled()).toBe(false);
  });

  it('clears sticky Shift-disabled state from a prior sample when Shift is up', () => {
    applyGridSnapPrecisionFromShift(gridSnap, true, true);
    expect(gridSnap.isEnabled()).toBe(false);
    applyGridSnapPrecisionFromShift(gridSnap, false, true);
    expect(gridSnap.isEnabled()).toBe(true);
  });
});

describe('restoreGridSnapUserPreference', () => {
  it('restores user preference after a Shift-disabled drag ends', () => {
    const gridSnap = new GridSnap(true, 1);
    applyGridSnapPrecisionFromShift(gridSnap, true, true);
    restoreGridSnapUserPreference(gridSnap, true);
    expect(gridSnap.isEnabled()).toBe(true);
  });

  it('does not force snap on when the user prefers snap off', () => {
    const gridSnap = new GridSnap(false, 1);
    applyGridSnapPrecisionFromShift(gridSnap, true, false);
    restoreGridSnapUserPreference(gridSnap, false);
    expect(gridSnap.isEnabled()).toBe(false);
  });
});

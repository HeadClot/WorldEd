import { describe, expect, it } from 'vitest';
import {
  FREEVERB_ALLPASS_TUNING_L,
  FREEVERB_ALLPASS_TUNING_R,
  FREEVERB_COMB_TUNING_L,
  FREEVERB_COMB_TUNING_R,
  FREEVERB_FIXED_GAIN,
  FREEVERB_FREEZE_MODE,
  FREEVERB_INITIAL_DAMP,
  FREEVERB_INITIAL_DRY,
  FREEVERB_INITIAL_MODE,
  FREEVERB_INITIAL_ROOM,
  FREEVERB_INITIAL_WET,
  FREEVERB_INITIAL_WIDTH,
  FREEVERB_MUTED,
  FREEVERB_NUM_ALLPASSES,
  FREEVERB_NUM_COMBS,
  FREEVERB_OFFSET_ROOM,
  FREEVERB_SCALE_DAMP,
  FREEVERB_SCALE_DRY,
  FREEVERB_SCALE_ROOM,
  FREEVERB_SCALE_WET,
  FREEVERB_STEREO_SPREAD,
  FREEVERB_TUNING_SAMPLE_RATE,
  scaleFreeverbTuningSamples,
} from '@/audio/effect/freeverb/audio_freeverb_tuning.js';

describe('audio_freeverb_tuning', () => {
  it('matches Freeverb tuning.h scalar constants', () => {
    expect(FREEVERB_NUM_COMBS).toBe(8);
    expect(FREEVERB_NUM_ALLPASSES).toBe(4);
    expect(FREEVERB_MUTED).toBe(0);
    expect(FREEVERB_FIXED_GAIN).toBe(0.015);
    expect(FREEVERB_SCALE_WET).toBe(3);
    expect(FREEVERB_SCALE_DRY).toBe(2);
    expect(FREEVERB_SCALE_DAMP).toBe(0.4);
    expect(FREEVERB_SCALE_ROOM).toBe(0.28);
    expect(FREEVERB_OFFSET_ROOM).toBe(0.7);
    expect(FREEVERB_INITIAL_ROOM).toBe(0.5);
    expect(FREEVERB_INITIAL_DAMP).toBe(0.5);
    expect(FREEVERB_INITIAL_WET).toBeCloseTo(1 / 3, 10);
    expect(FREEVERB_INITIAL_DRY).toBe(0);
    expect(FREEVERB_INITIAL_WIDTH).toBe(1);
    expect(FREEVERB_INITIAL_MODE).toBe(0);
    expect(FREEVERB_FREEZE_MODE).toBe(0.5);
    expect(FREEVERB_STEREO_SPREAD).toBe(23);
  });

  it('matches Freeverb left comb and allpass sample lengths', () => {
    expect([...FREEVERB_COMB_TUNING_L]).toEqual([1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617]);
    expect([...FREEVERB_ALLPASS_TUNING_L]).toEqual([556, 441, 341, 225]);
  });

  it('matches Freeverb right channels as left plus stereospread', () => {
    for (let index = 0; index < FREEVERB_COMB_TUNING_L.length; index++) {
      expect(FREEVERB_COMB_TUNING_R[index]).toBe(FREEVERB_COMB_TUNING_L[index]! + FREEVERB_STEREO_SPREAD);
    }
    for (let index = 0; index < FREEVERB_ALLPASS_TUNING_L.length; index++) {
      expect(FREEVERB_ALLPASS_TUNING_R[index]).toBe(FREEVERB_ALLPASS_TUNING_L[index]! + FREEVERB_STEREO_SPREAD);
    }
  });

  it('keeps 44.1 kHz tuning samples unchanged at the reference rate', () => {
    expect(FREEVERB_TUNING_SAMPLE_RATE).toBe(44100);
    expect(scaleFreeverbTuningSamples(1116, 44100)).toBe(1116);
  });

  it('scales delay samples proportionally for other sample rates', () => {
    expect(scaleFreeverbTuningSamples(1116, 48000)).toBe(Math.round((1116 * 48000) / 44100));
    expect(scaleFreeverbTuningSamples(556, 96000)).toBe(Math.round((556 * 96000) / 44100));
  });
});

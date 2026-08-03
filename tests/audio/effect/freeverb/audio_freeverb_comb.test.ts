import { describe, expect, it } from 'vitest';
import { AudioFreeverbComb } from '@/audio/effect/freeverb/audio_freeverb_comb.js';

describe('AudioFreeverbComb', () => {
  it('returns zeros until the delay buffer wraps with feedback off', () => {
    const comb = createComb(4, 0, 0);
    expect(comb.process(1)).toBe(0);
    expect(comb.process(0)).toBe(0);
    expect(comb.process(0)).toBe(0);
    expect(comb.process(0)).toBe(0);
    expect(comb.process(0)).toBe(1);
  });

  it('applies one-pole damp and feedback like Freeverb comb::process', () => {
    const comb = createComb(1, 0.5, 0.25);
    const first = comb.process(1);
    expect(first).toBe(0);
    const second = comb.process(0);
    expect(second).toBeCloseTo(1, 10);
    const third = comb.process(0);
    const expectedFilterstore = 1 * (1 - 0.25);
    expect(third).toBeCloseTo(expectedFilterstore * 0.5, 10);
  });

  it('mute clears the delay buffer', () => {
    const comb = createComb(2, 0, 0);
    comb.process(1);
    comb.process(0);
    comb.mute();
    expect(comb.process(0)).toBe(0);
    expect(comb.process(0)).toBe(0);
  });
});

/**
 * Builds a comb with a fixed buffer, feedback, and damp.
 *
 * @param size Delay length in samples.
 * @param feedback Comb feedback coefficient.
 * @param damp One-pole damp1 coefficient.
 * @returns Configured comb.
 */
function createComb(size: number, feedback: number, damp: number): AudioFreeverbComb {
  const comb = new AudioFreeverbComb();
  comb.setBuffer(new Float32Array(size), size);
  comb.setFeedback(feedback);
  comb.setDamp(damp);
  return comb;
}

import { describe, expect, it } from 'vitest';
import { AudioFreeverbAllpass } from '@/audio/effect/freeverb/audio_freeverb_allpass.js';
import { FREEVERB_ALLPASS_FEEDBACK } from '@/audio/effect/freeverb/audio_freeverb_tuning.js';

describe('AudioFreeverbAllpass', () => {
  it('matches Freeverb allpass::process for a unit impulse', () => {
    const allpass = createAllpass(2, FREEVERB_ALLPASS_FEEDBACK);
    const first = allpass.process(1);
    expect(first).toBeCloseTo(-1, 10);
    const second = allpass.process(0);
    expect(second).toBeCloseTo(0, 10);
    const third = allpass.process(0);
    expect(third).toBeCloseTo(1 + FREEVERB_ALLPASS_FEEDBACK * 0, 10);
    expect(third).toBeCloseTo(1, 10);
  });

  it('writes input + bufout * feedback into the delay buffer', () => {
    const allpass = createAllpass(1, 0.5);
    expect(allpass.process(2)).toBeCloseTo(-2, 10);
    expect(allpass.process(0)).toBeCloseTo(2 + 0 * 0.5, 10);
    expect(allpass.process(0)).toBeCloseTo(0 + (2 + 0 * 0.5) * 0.5, 10);
  });
});

/**
 * Builds an allpass with a fixed buffer and feedback.
 *
 * @param size Delay length in samples.
 * @param feedback Allpass feedback coefficient.
 * @returns Configured allpass.
 */
function createAllpass(size: number, feedback: number): AudioFreeverbAllpass {
  const allpass = new AudioFreeverbAllpass();
  allpass.setBuffer(new Float32Array(size), size);
  allpass.setFeedback(feedback);
  return allpass;
}

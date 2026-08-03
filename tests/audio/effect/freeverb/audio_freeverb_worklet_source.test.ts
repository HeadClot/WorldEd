import { describe, expect, it } from 'vitest';
import {
  AUDIO_FREEVERB_WORKLET_PROCESSOR_NAME,
  buildAudioFreeverbWorkletSource,
} from '@/audio/effect/freeverb/audio_freeverb_worklet_source.js';
import {
  FREEVERB_COMB_TUNING_L,
  FREEVERB_FIXED_GAIN,
  FREEVERB_SCALE_ROOM,
  FREEVERB_OFFSET_ROOM,
} from '@/audio/effect/freeverb/audio_freeverb_tuning.js';

describe('buildAudioFreeverbWorkletSource', () => {
  it('embeds Freeverb tuning constants and processor name', () => {
    const source = buildAudioFreeverbWorkletSource();
    expect(source).toContain(AUDIO_FREEVERB_WORKLET_PROCESSOR_NAME);
    expect(source).toContain(String(FREEVERB_FIXED_GAIN));
    expect(source).toContain(String(FREEVERB_SCALE_ROOM));
    expect(source).toContain(String(FREEVERB_OFFSET_ROOM));
    expect(source).toContain(String(FREEVERB_COMB_TUNING_L[0]));
    expect(source).toContain('registerProcessor');
    expect(source).toContain('processReplace');
    expect(source).toContain('resolveInputChannels');
    expect(source).toContain('ensureSilence');
  });

  it('always advances Freeverb when browser supplies empty inputs', () => {
    const source = buildAudioFreeverbWorkletSource();
    expect(source).toContain('resolveInputChannels(inputs[0], frames)');
    expect(source).not.toContain('if (!input || !output || !input[0] || !output[0])');
  });
});

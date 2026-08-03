import { describe, expect, it, vi } from 'vitest';
import { AudioSampleClick001 } from '@/audio/sample/audio_sample_click001.js';

describe('AudioSampleClick001', () => {
  it('exposes the configured sample URL', () => {
    const sample = new AudioSampleClick001('data:audio/wav;base64,QQ==');
    expect(sample.getSampleUrl()).toBe('data:audio/wav;base64,QQ==');
  });

  it('decodes a data-URL sample through the audio context', async () => {
    const samples = new Float32Array(4);
    const buffer = { getChannelData: () => samples, length: 4, sampleRate: 48000, numberOfChannels: 1 };
    const context = {
      decodeAudioData: vi.fn(async (bytes: ArrayBuffer) => {
        expect(bytes.byteLength).toBeGreaterThan(0);
        return buffer;
      }),
    } as unknown as AudioContext;
    const sample = new AudioSampleClick001('data:audio/wav;base64,UklGRg==');
    const decoded = await sample.getDecodedBuffer(context);
    expect(decoded).toBe(buffer);
    expect(sample.getCachedBuffer(context)).toBe(buffer);
    expect(context.decodeAudioData).toHaveBeenCalledTimes(1);
    await sample.getDecodedBuffer(context);
    expect(context.decodeAudioData).toHaveBeenCalledTimes(1);
  });
});

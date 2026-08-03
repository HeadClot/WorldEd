import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioContextHost } from '@/audio/context/audio_context_host.js';
import { AudioEffectSoftReverb } from '@/audio/effect/audio_effect_soft_reverb.js';
import { AudioSoundEmbeddedClick } from '@/audio/playback/audio_sound_embedded_click.js';
import { AudioSoundSoftWhoosh } from '@/audio/playback/audio_sound_soft_whoosh.js';
import { AudioSampleClick001 } from '@/audio/sample/audio_sample_click001.js';

describe('AudioSoundSoftWhoosh', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not throw when AudioContext is unavailable', () => {
    const host = new AudioContextHost(() => null);
    const player = new AudioSoundSoftWhoosh(host, new AudioEffectSoftReverb());
    expect(() => player.play()).not.toThrow();
  });

  it('schedules the embedded click sample for move snaps', async () => {
    vi.stubGlobal(
      'AudioWorkletNode',
      class {
        port = { postMessage: vi.fn() };
        connect = vi.fn();
        constructor() {}
      },
    );
    const context = createMockAudioContext('running');
    const decoded = createMockAudioBuffer();
    const sample = new AudioSampleClick001('data:audio/wav;base64,AA==');
    vi.spyOn(sample, 'getDecodedBuffer').mockResolvedValue(decoded);
    vi.spyOn(sample, 'getCachedBuffer').mockReturnValue(decoded);
    const host = new AudioContextHost(() => context as unknown as AudioContext);
    const reverb = new AudioEffectSoftReverb();
    const embedded = new AudioSoundEmbeddedClick(host, reverb, sample);
    const player = new AudioSoundSoftWhoosh(host, reverb, embedded);
    player.play(1.2);
    await Promise.resolve();
    expect(context.createBufferSource).toHaveBeenCalled();
    const source = context.createBufferSource.mock.results[0]?.value as {
      playbackRate: { value: number };
    };
    expect(source.playbackRate.value).toBe(1.2);
  });
});

/**
 * Builds a minimal AudioBuffer double for decode/cache stubs.
 *
 * @returns Mock buffer accepted as AudioBuffer.
 */
function createMockAudioBuffer(): AudioBuffer {
  const samples = new Float32Array(8);
  return {
    getChannelData: vi.fn(() => samples),
    length: 8,
    sampleRate: 48000,
    numberOfChannels: 1,
    duration: 8 / 48000,
    copyFromChannel: vi.fn(),
    copyToChannel: vi.fn(),
  } as unknown as AudioBuffer;
}

/**
 * Builds a minimal AudioContext double for move-snap scheduling.
 *
 * @param state Initial context state.
 * @returns Mock context with graph factories.
 */
function createMockAudioContext(state: 'running' | 'suspended' = 'running') {
  const buffer = createMockAudioBuffer();
  const bufferSource = {
    buffer: null as unknown,
    playbackRate: { value: 1 },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
  const makeParam = (value = 0) => ({
    value,
    setTargetAtTime: vi.fn(),
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  });
  const gain = {
    gain: makeParam(1),
    connect: vi.fn(),
  };
  const panner = {
    panningModel: 'equalpower',
    distanceModel: 'inverse',
    refDistance: 1,
    maxDistance: 10000,
    rolloffFactor: 1,
    coneInnerAngle: 360,
    coneOuterAngle: 360,
    coneOuterGain: 0,
    positionX: makeParam(0),
    positionY: makeParam(0),
    positionZ: makeParam(0),
    connect: vi.fn(),
  };
  const context = {
    state,
    currentTime: 0,
    sampleRate: 48000,
    destination: {},
    listener: {
      positionX: { value: 0 },
      positionY: { value: 0 },
      positionZ: { value: 0 },
      forwardX: { value: 0 },
      forwardY: { value: 0 },
      forwardZ: { value: -1 },
      upX: { value: 0 },
      upY: { value: 1 },
      upZ: { value: 0 },
    },
    resume: vi.fn(async () => {
      context.state = 'running';
    }),
    createBuffer: vi.fn(() => buffer),
    createBufferSource: vi.fn(() => bufferSource),
    createBiquadFilter: vi.fn(() => ({
      type: 'lowpass',
      frequency: makeParam(0),
      Q: makeParam(0),
      connect: vi.fn(),
    })),
    createGain: vi.fn(() => gain),
    createDelay: vi.fn(() => ({
      delayTime: makeParam(0),
      connect: vi.fn(),
    })),
    createConvolver: vi.fn(() => ({
      buffer: null,
      normalize: false,
      connect: vi.fn(),
    })),
    audioWorklet: {
      addModule: vi.fn(async () => undefined),
    },
    createPanner: vi.fn(() => panner),
    decodeAudioData: vi.fn(async () => buffer),
  };
  return context;
}

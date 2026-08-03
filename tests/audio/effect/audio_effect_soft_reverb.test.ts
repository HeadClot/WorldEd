import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioEffectSoftReverb } from '@/audio/effect/audio_effect_soft_reverb.js';
import { AUDIO_ROOM_CHARACTER_MEDIUM } from '@/audio/space/audio_room_character.js';

describe('AudioEffectSoftReverb', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds a dry path plus Freeverb worklet routing without convolution', async () => {
    const context = createMockAudioContext();
    stubAudioWorkletNode();
    const reverb = new AudioEffectSoftReverb({ dryGain: 0.9, wetGain: 0.14 });
    const inputA = reverb.getInput(context as unknown as AudioContext);
    const inputB = reverb.getInput(context as unknown as AudioContext);
    expect(inputA).toBe(inputB);
    await flushMicrotasks();
    expect(context.audioWorklet.addModule).toHaveBeenCalled();
    expect(context.createGain).toHaveBeenCalled();
    expect(context.createConvolver).not.toHaveBeenCalled();
    expect(context.createDelay).not.toHaveBeenCalled();
  });

  it('applies room character without rebuilding the Freeverb worklet module', async () => {
    const context = createMockAudioContext();
    stubAudioWorkletNode();
    const reverb = new AudioEffectSoftReverb();
    reverb.getInput(context as unknown as AudioContext);
    await flushMicrotasks();
    const moduleCalls = context.audioWorklet.addModule.mock.calls.length;
    reverb.applyRoomCharacter(AUDIO_ROOM_CHARACTER_MEDIUM);
    reverb.applyRoomCharacter({
      ...AUDIO_ROOM_CHARACTER_MEDIUM,
      wetGain: 0.18,
      tailDelayScale: 1.4,
    });
    expect(context.audioWorklet.addModule.mock.calls.length).toBe(moduleCalls);
  });

  it('reuses the graph for the same context', async () => {
    const context = createMockAudioContext();
    stubAudioWorkletNode();
    const reverb = new AudioEffectSoftReverb();
    reverb.getInput(context as unknown as AudioContext);
    await flushMicrotasks();
    const moduleCallsAfterFirst = context.audioWorklet.addModule.mock.calls.length;
    reverb.getInput(context as unknown as AudioContext);
    await flushMicrotasks();
    expect(context.audioWorklet.addModule.mock.calls.length).toBe(moduleCallsAfterFirst);
  });

  it('hard-disarms Freeverb when room wetness drops to zero', async () => {
    const context = createMockAudioContext();
    const workletPort = { postMessage: vi.fn() };
    vi.stubGlobal(
      'AudioWorkletNode',
      class {
        port = workletPort;
        connect = vi.fn();
        constructor() {}
      },
    );
    const reverb = new AudioEffectSoftReverb({ dryGain: 0.9, wetGain: 0.14 });
    reverb.getInput(context as unknown as AudioContext);
    await flushMicrotasks();
    workletPort.postMessage.mockClear();
    reverb.applyRoomCharacter({
      ...AUDIO_ROOM_CHARACTER_MEDIUM,
      dryGain: 1,
      wetGain: 0,
    });
    const messages = workletPort.postMessage.mock.calls.map(
      (call: unknown[]) => call[0] as { wet?: number; mute?: boolean },
    );
    expect(messages.some((message) => message.wet === 0)).toBe(true);
    expect(messages.some((message) => message.mute === true)).toBe(true);
  });
});

/** Yields so Freeverb worklet install promises can settle. */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

/** Stubs global AudioWorkletNode for graph construction tests. */
function stubAudioWorkletNode(): void {
  vi.stubGlobal(
    'AudioWorkletNode',
    class {
      port = { postMessage: vi.fn() };
      connect = vi.fn();
      constructor() {}
    },
  );
}

/**
 * Builds a minimal AudioContext double for Freeverb construction.
 *
 * @returns Mock context with Web Audio factories.
 */
function createMockAudioContext() {
  const makeParam = (value = 0) => ({
    value,
    setTargetAtTime: vi.fn(),
    setValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  });
  const makeGain = () => ({
    gain: makeParam(1),
    connect: vi.fn(),
  });
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
    sampleRate: 48000,
    currentTime: 0,
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
    audioWorklet: {
      addModule: vi.fn(async () => undefined),
    },
    createGain: vi.fn(makeGain),
    createBiquadFilter: vi.fn(),
    createDelay: vi.fn(),
    createConvolver: vi.fn(),
    createBuffer: vi.fn(),
    createPanner: vi.fn(() => panner),
  };
  return context;
}

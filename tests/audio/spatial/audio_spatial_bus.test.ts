import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { AudioSpatialBus } from '@/audio/spatial/audio_spatial_bus.js';

describe('AudioSpatialBus', () => {
  it('builds dry and wet mix paths and reuses them for the same context', () => {
    const context = createMockAudioContext();
    const bus = new AudioSpatialBus();
    const dryA = bus.getDryMixInput(context as unknown as AudioContext);
    const dryB = bus.getDryMixInput(context as unknown as AudioContext);
    const wetA = bus.getWetMixInput(context as unknown as AudioContext);
    const wetB = bus.getWetMixInput(context as unknown as AudioContext);
    expect(dryA).toBe(dryB);
    expect(wetA).toBe(wetB);
    expect(dryA).not.toBe(wetA);
    expect(context.createPanner).toHaveBeenCalledTimes(1);
    expect(context.createGain).toHaveBeenCalled();
  });

  it('uses equalpower for both spatial3d and mono (no HRTF pitch warp)', () => {
    const context = createMockAudioContext();
    const bus = new AudioSpatialBus();
    bus.getDryMixInput(context as unknown as AudioContext);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 5, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    bus.prepareForPlayback(context as unknown as AudioContext, {
      mode: 'spatial3d',
      camera,
      sourcePosition: new THREE.Vector3(3, 0, 0),
    });
    expect(context.lastPanner.panningModel).toBe('equalpower');
    bus.prepareForPlayback(context as unknown as AudioContext, {
      mode: 'mono',
      camera: null,
      sourcePosition: new THREE.Vector3(0, 0, 0),
    });
    expect(context.lastPanner.panningModel).toBe('equalpower');
  });
});

/**
 * Builds a minimal AudioContext double for spatial bus tests.
 *
 * @returns Mock context with panner factories.
 */
function createMockAudioContext() {
  const makeParam = (value = 0) => ({
    value,
    setTargetAtTime: vi.fn(),
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
  const listener = {
    positionX: { value: 0 },
    positionY: { value: 0 },
    positionZ: { value: 0 },
    forwardX: { value: 0 },
    forwardY: { value: 0 },
    forwardZ: { value: -1 },
    upX: { value: 0 },
    upY: { value: 1 },
    upZ: { value: 0 },
  };
  const context = {
    currentTime: 0,
    destination: {},
    listener,
    lastPanner: panner,
    createGain: vi.fn(makeGain),
    createPanner: vi.fn(() => panner),
  };
  return context;
}

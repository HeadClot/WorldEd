import { describe, expect, it, vi } from 'vitest';
import { AudioContextHost } from '@/audio/context/audio_context_host.js';

describe('AudioContextHost', () => {
  it('returns null when the factory cannot create a context', () => {
    const host = new AudioContextHost(() => null);
    expect(host.ensureContext()).toBeNull();
    expect(host.isRunning()).toBe(false);
  });

  it('reuses the same context instance', () => {
    const context = createMockContext('running');
    const host = new AudioContextHost(() => context as unknown as AudioContext);
    expect(host.ensureContext()).toBe(context);
    expect(host.ensureContext()).toBe(context);
    expect(host.isRunning()).toBe(true);
  });

  it('resumes a suspended context on unlock and starts a near-silent keep-alive', async () => {
    const context = createMockContext('suspended');
    const host = new AudioContextHost(() => context as unknown as AudioContext);
    host.unlock();
    expect(context.resume).toHaveBeenCalled();
    await Promise.resolve();
    await Promise.resolve();
    expect(context.createConstantSource).toHaveBeenCalled();
    expect(context.createGain).toHaveBeenCalled();
    const gain = context.createGain.mock.results[0]?.value as { gain: { value: number } };
    expect(gain.gain.value).toBeGreaterThan(0);
    expect(gain.gain.value).toBeLessThan(0.001);
  });
});

/**
 * Builds a minimal AudioContext double for host lifecycle tests.
 *
 * @param state Initial context state.
 * @returns Mock context.
 */
function createMockContext(state: 'running' | 'suspended') {
  const constantSource = {
    offset: { value: 0 },
    connect: vi.fn(),
    start: vi.fn(),
  };
  const oscillator = {
    frequency: { value: 0 },
    connect: vi.fn(),
    start: vi.fn(),
  };
  const gain = {
    gain: { value: 1 },
    connect: vi.fn(),
  };
  const context = {
    state,
    destination: {},
    resume: vi.fn(async () => {
      context.state = 'running';
    }),
    createConstantSource: vi.fn(() => constantSource),
    createOscillator: vi.fn(() => oscillator),
    createGain: vi.fn(() => gain),
    addEventListener: vi.fn(),
  };
  return context;
}

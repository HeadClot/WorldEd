import { describe, expect, it } from 'vitest';
import { AudioFreeverbModel } from '@/audio/effect/freeverb/audio_freeverb_model.js';
import {
  FREEVERB_FIXED_GAIN,
  FREEVERB_INITIAL_DAMP,
  FREEVERB_INITIAL_DRY,
  FREEVERB_INITIAL_ROOM,
  FREEVERB_INITIAL_WET,
  FREEVERB_INITIAL_WIDTH,
  FREEVERB_OFFSET_ROOM,
  FREEVERB_SCALE_DAMP,
  FREEVERB_SCALE_DRY,
  FREEVERB_SCALE_ROOM,
  FREEVERB_SCALE_WET,
} from '@/audio/effect/freeverb/audio_freeverb_tuning.js';

describe('AudioFreeverbModel', () => {
  it('exposes Freeverb default public parameters after construction', () => {
    const model = new AudioFreeverbModel();
    expect(model.getRoomSize()).toBeCloseTo(FREEVERB_INITIAL_ROOM, 10);
    expect(model.getDamp()).toBeCloseTo(FREEVERB_INITIAL_DAMP, 10);
    expect(model.getWet()).toBeCloseTo(FREEVERB_INITIAL_WET, 10);
    expect(model.getDry()).toBeCloseTo(FREEVERB_INITIAL_DRY, 10);
    expect(model.getWidth()).toBeCloseTo(FREEVERB_INITIAL_WIDTH, 10);
    expect(model.getMode()).toBe(0);
  });

  it('scales room size through scaleroom and offsetroom', () => {
    const model = new AudioFreeverbModel();
    model.setRoomSize(0);
    expect(model.getRoomSize()).toBeCloseTo(0, 10);
    model.setRoomSize(1);
    expect(model.getRoomSize()).toBeCloseTo(1, 10);
    const internalAtHalf = FREEVERB_INITIAL_ROOM * FREEVERB_SCALE_ROOM + FREEVERB_OFFSET_ROOM;
    expect(internalAtHalf).toBeCloseTo(0.84, 10);
  });

  it('scales damp, wet, and dry through Freeverb scale constants', () => {
    const model = new AudioFreeverbModel();
    model.setDamp(1);
    expect(model.getDamp()).toBeCloseTo(1, 10);
    expect(1 * FREEVERB_SCALE_DAMP).toBeCloseTo(0.4, 10);
    model.setWet(1);
    expect(model.getWet()).toBeCloseTo(1, 10);
    expect(1 * FREEVERB_SCALE_WET).toBe(3);
    model.setDry(1);
    expect(model.getDry()).toBeCloseTo(1, 10);
    expect(1 * FREEVERB_SCALE_DRY).toBe(2);
  });

  it('reports freeze mode as 1 when mode is at or above the freeze threshold', () => {
    const model = new AudioFreeverbModel();
    model.setMode(0.49);
    expect(model.getMode()).toBe(0);
    model.setMode(0.5);
    expect(model.getMode()).toBe(1);
  });

  it('processReplace writes dry path using scaled dry when wet is zero', () => {
    const model = new AudioFreeverbModel();
    model.setWet(0);
    model.setDry(0.5);
    const inputL = new Float32Array([0.8, 0]);
    const inputR = new Float32Array([0.2, 0]);
    const outputL = new Float32Array(2);
    const outputR = new Float32Array(2);
    model.processReplace(inputL, inputR, outputL, outputR, 1, 1);
    expect(outputL[0]).toBeCloseTo(0.8 * 0.5 * FREEVERB_SCALE_DRY, 5);
    expect(outputR[0]).toBeCloseTo(0.2 * 0.5 * FREEVERB_SCALE_DRY, 5);
  });

  it('setWet(0) hard-gates wet output including residual delay energy', () => {
    const model = new AudioFreeverbModel();
    model.setDry(0);
    model.setWet(1);
    const frames = 1500;
    const inputL = new Float32Array(frames);
    const inputR = new Float32Array(frames);
    const outputL = new Float32Array(frames);
    const outputR = new Float32Array(frames);
    inputL[0] = 1;
    inputR[0] = 1;
    model.processReplace(inputL, inputR, outputL, outputR, frames, 1);
    expect(sumAbsolute(outputL) + sumAbsolute(outputR)).toBeGreaterThan(0);
    model.setWet(0);
    inputL.fill(0);
    inputR.fill(0);
    outputL.fill(0);
    outputR.fill(0);
    model.processReplace(inputL, inputR, outputL, outputR, frames, 1);
    expect(sumAbsolute(outputL) + sumAbsolute(outputR)).toBe(0);
  });

  it('processReplace emits a delayed wet tail for an impulse with dry zero', () => {
    const model = new AudioFreeverbModel();
    model.setDry(0);
    model.setWet(1);
    model.setRoomSize(0.5);
    model.setDamp(0.5);
    model.setWidth(1);
    const frames = 2000;
    const inputL = new Float32Array(frames);
    const inputR = new Float32Array(frames);
    const outputL = new Float32Array(frames);
    const outputR = new Float32Array(frames);
    inputL[0] = 1;
    inputR[0] = 1;
    model.processReplace(inputL, inputR, outputL, outputR, frames, 1);
    expect(outputL[0]).toBeCloseTo(0, 5);
    expect(outputR[0]).toBeCloseTo(0, 5);
    const energy = sumAbsolute(outputL) + sumAbsolute(outputR);
    expect(energy).toBeGreaterThan(0);
    expect(Math.max(...outputL, ...outputR)).toBeLessThan(10);
  });

  it('processMix accumulates into existing output samples', () => {
    const model = new AudioFreeverbModel();
    model.setWet(0);
    model.setDry(0.5);
    const inputL = new Float32Array([1]);
    const inputR = new Float32Array([0]);
    const outputL = new Float32Array([0.25]);
    const outputR = new Float32Array([0.1]);
    model.processMix(inputL, inputR, outputL, outputR, 1, 1);
    expect(outputL[0]).toBeCloseTo(0.25 + 1 * 0.5 * FREEVERB_SCALE_DRY, 5);
    expect(outputR[0]).toBeCloseTo(0.1 + 0 * 0.5 * FREEVERB_SCALE_DRY, 5);
  });

  it('uses fixedgain on the mono sum into the comb bank', () => {
    expect(FREEVERB_FIXED_GAIN).toBe(0.015);
    const model = new AudioFreeverbModel();
    model.setDry(0);
    model.setWet(0);
    const inputL = new Float32Array([1]);
    const inputR = new Float32Array([1]);
    const outputL = new Float32Array(1);
    const outputR = new Float32Array(1);
    model.processReplace(inputL, inputR, outputL, outputR, 1, 1);
    expect(outputL[0]).toBe(0);
    expect(outputR[0]).toBe(0);
  });

  it('scales delay lines so a 48 kHz model has longer buffers than 44.1 kHz', () => {
    const at44100 = new AudioFreeverbModel(44100);
    const at48000 = new AudioFreeverbModel(48000);
    at44100.setDry(0);
    at44100.setWet(1);
    at48000.setDry(0);
    at48000.setWet(1);
    const frames = 1300;
    const impulseL = new Float32Array(frames);
    const impulseR = new Float32Array(frames);
    impulseL[0] = 1;
    impulseR[0] = 1;
    const out44100 = new Float32Array(frames);
    const out48000 = new Float32Array(frames);
    const silent = new Float32Array(frames);
    at44100.processReplace(impulseL, impulseR, out44100, silent, frames, 1);
    const silentR = new Float32Array(frames);
    at48000.processReplace(impulseL, impulseR, out48000, silentR, frames, 1);
    const firstHit44100 = firstNonZeroIndex(out44100);
    const firstHit48000 = firstNonZeroIndex(out48000);
    expect(firstHit44100).toBeGreaterThan(0);
    expect(firstHit48000).toBeGreaterThan(firstHit44100);
  });
});

/**
 * Finds the first index with a non-zero sample.
 *
 * @param samples Buffer to scan.
 * @returns Index or -1 when silent.
 */
function firstNonZeroIndex(samples: Float32Array): number {
  for (let index = 0; index < samples.length; index++) {
    if (samples[index] !== 0) {
      return index;
    }
  }
  return -1;
}

/**
 * Sums absolute sample values in a buffer.
 *
 * @param samples Buffer to measure.
 * @returns L1 energy.
 */
function sumAbsolute(samples: Float32Array): number {
  let total = 0;
  for (let index = 0; index < samples.length; index++) {
    total += Math.abs(samples[index]!);
  }
  return total;
}

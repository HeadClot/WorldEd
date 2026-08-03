import { describe, expect, it } from 'vitest';
import {
  AUDIO_ROOM_CHARACTER_VOID,
  buildRoomCharacterFromAcoustics,
  computeMeanFreePath,
  computeSabineRt60Seconds,
  computeWorldAxisTotals,
  estimateRoomAcousticsFromRayDistances,
  resolveAudioRoomCharacter,
  resolveAudioRoomCharacterFromRayDistances,
  type AudioRoomCharacter,
} from '@/audio/space/audio_room_character.js';

describe('resolveAudioRoomCharacter', () => {
  it('uses void character when there are no solid hits', () => {
    expect(resolveAudioRoomCharacter(null)).toBe(AUDIO_ROOM_CHARACTER_VOID);
  });

  it('maps larger isotropic averages to wetter, longer reverb continuously', () => {
    const small = resolveAudioRoomCharacter(1);
    const medium = resolveAudioRoomCharacter(6);
    const large = resolveAudioRoomCharacter(30);
    expect(small.wetGain).toBeLessThan(medium.wetGain);
    expect(medium.wetGain).toBeLessThan(large.wetGain);
    expect(small.tailDelayScale).toBeLessThan(large.tailDelayScale);
    expect(small.wetGain).toBeGreaterThanOrEqual(0.08);
    expect(large.wetGain).toBeGreaterThan(0.12);
    expect(large.wetGain).toBeLessThanOrEqual(0.22);
  });
});

describe('computeWorldAxisTotals', () => {
  it('sums opposite rays so mid-hallway totals match end-of-hallway totals', () => {
    const nearEnd = computeWorldAxisTotals([2, 2, 1.5, 1.5, 2, 38]);
    const midHall = computeWorldAxisTotals([2, 2, 1.5, 1.5, 20, 20]);
    expect(nearEnd.totalX).toBeCloseTo(midHall.totalX, 5);
    expect(nearEnd.totalY).toBeCloseTo(midHall.totalY, 5);
    expect(nearEnd.totalZ).toBeCloseTo(midHall.totalZ, 5);
    expect(midHall.totalZ).toBeCloseTo(40, 5);
  });
});

describe('mean free path and Sabine RT60', () => {
  it('uses the classic mfp = 4V/S equation', () => {
    const volume = 10 * 4 * 4;
    const surface = 2 * (10 * 4 + 4 * 4 + 4 * 10);
    expect(computeMeanFreePath(volume, surface)).toBeCloseTo((4 * volume) / surface, 5);
  });

  it('estimates longer RT60 for larger rooms at fixed absorption', () => {
    const smallRt = computeSabineRt60Seconds(8, 24);
    const largeRt = computeSabineRt60Seconds(800, 480);
    expect(largeRt).toBeGreaterThan(smallRt);
  });
});

describe('resolveAudioRoomCharacterFromRayDistances', () => {
  it('returns void only when every ray misses (rare outdoor case)', () => {
    expect(resolveAudioRoomCharacterFromRayDistances([null, null, null, null, null, null])).toBe(
      AUDIO_ROOM_CHARACTER_VOID,
    );
  });

  it('gives a hallway audible wet reverb at both ends and mid-run', () => {
    const atEnd = resolveAudioRoomCharacterFromRayDistances([1.2, 1.1, 1.0, 1.0, 2, 40]);
    const atCenter = resolveAudioRoomCharacterFromRayDistances([1.2, 1.1, 1.0, 1.0, 21, 21]);
    expectHallwayLike(atEnd);
    expectHallwayLike(atCenter);
    expect(atEnd.wetGain).toBeGreaterThan(0.1);
    expect(atCenter.wetGain).toBeGreaterThan(0.1);
    expect(atEnd.wetGain).toBeLessThanOrEqual(0.22);
  });

  it('treats a mild rectangle as isotropic, not corridor flutter', () => {
    const character = resolveAudioRoomCharacterFromRayDistances([3, 3, 2.5, 2.5, 4, 5]);
    expect(character.tailDelayScale / Math.max(character.earlyDelayScale, 0.01)).toBeLessThan(2.2);
    expect(character.wetGain).toBeGreaterThan(0.08);
    expect(character.wetGain).toBeLessThanOrEqual(0.2);
  });

  it('gives large even chambers wetter, longer tails than small boxes', () => {
    const chamber = resolveAudioRoomCharacterFromRayDistances([16, 15, 14, 15, 17, 16]);
    const small = resolveAudioRoomCharacterFromRayDistances([1.5, 1.4, 1.2, 1.3, 1.6, 1.5]);
    expect(chamber.wetGain).toBeGreaterThan(small.wetGain);
    expect(chamber.tailDelayScale).toBeGreaterThan(small.tailDelayScale);
    expect(chamber.earlyDelayScale).toBeGreaterThan(small.earlyDelayScale);
  });

  it('keeps a small enclosure wet enough to hear air on short clicks', () => {
    const character = resolveAudioRoomCharacterFromRayDistances([1.5, 1.4, 1.2, 1.3, 1.6, 1.5]);
    expect(character.wetGain).toBeGreaterThanOrEqual(0.08);
    expect(character.tailFeedback).toBeGreaterThanOrEqual(0.18);
  });

  it('still sizes a closed-looking room when some rays miss (CSG not outdoor)', () => {
    const partial = resolveAudioRoomCharacterFromRayDistances([2, 2, 1.5, 1.5, null, null]);
    expect(partial).not.toBe(AUDIO_ROOM_CHARACTER_VOID);
    expect(partial.wetGain).toBeGreaterThan(0.08);
  });

  it('mirrors a single hit as a closed opposite wall (not open void)', () => {
    const oneSided = computeWorldAxisTotals([3, null, 2, 2, 4, 4]);
    expect(oneSided.totalX).toBeCloseTo(6, 5);
    expect(oneSided.totalY).toBeCloseTo(4, 5);
  });

  it('gives a fully enclosed narrow corridor audible hallway air without runaway wetness', () => {
    const corridor = resolveAudioRoomCharacterFromRayDistances([1.1, 1.1, 1.2, 1.2, 18, 18]);
    expectHallwayLike(corridor);
    expect(corridor.wetGain).toBeGreaterThan(0.1);
    expect(corridor.wetGain).toBeLessThanOrEqual(0.22);
    expect(corridor.tailFeedback).toBeGreaterThan(0.18);
    expect(corridor.tailFeedback).toBeLessThanOrEqual(0.36);
  });

  it('matches buildRoomCharacterFromAcoustics for the same rays', () => {
    const distances = [2, 2, 2, 2, 10, 10] as const;
    const acoustics = estimateRoomAcousticsFromRayDistances(distances);
    const fromAcoustics = buildRoomCharacterFromAcoustics(acoustics);
    const direct = resolveAudioRoomCharacterFromRayDistances(distances);
    expect(direct).toEqual(fromAcoustics);
    expect(acoustics.meanFreePath).toBeGreaterThan(0);
    expect(acoustics.anisotropy).toBeGreaterThan(1);
  });
});

/**
 * Asserts corridor-like early/tail shaping and audible wetness.
 *
 * @param character Room character under test.
 */
function expectHallwayLike(character: AudioRoomCharacter): void {
  expect(character.tailDelayScale).toBeGreaterThan(character.earlyDelayScale * 1.05);
  expect(character.tailFeedback).toBeGreaterThan(0.18);
  expect(character.tailFeedback).toBeLessThanOrEqual(0.36);
  expect(character.wetGain).toBeGreaterThan(0.1);
  expect(character.wetGain).toBeLessThanOrEqual(0.22);
}

import { describe, expect, it } from 'vitest';
import { mapRoomCharacterToFreeverbParameters } from '@/audio/effect/freeverb/audio_freeverb_room_map.js';
import {
  AUDIO_ROOM_CHARACTER_MEDIUM,
  AUDIO_ROOM_CHARACTER_OPEN,
  AUDIO_ROOM_CHARACTER_SMALL,
} from '@/audio/space/audio_room_character.js';

describe('mapRoomCharacterToFreeverbParameters', () => {
  it('maps larger rooms to higher Freeverb roomSize', () => {
    const small = mapRoomCharacterToFreeverbParameters(AUDIO_ROOM_CHARACTER_SMALL);
    const open = mapRoomCharacterToFreeverbParameters(AUDIO_ROOM_CHARACTER_OPEN);
    expect(open.roomSize).toBeGreaterThan(small.roomSize);
    expect(open.roomSize).toBeGreaterThanOrEqual(0);
    expect(open.roomSize).toBeLessThanOrEqual(1);
  });

  it('arms Freeverb wet only when character wetGain is above zero', () => {
    const mapped = mapRoomCharacterToFreeverbParameters(AUDIO_ROOM_CHARACTER_MEDIUM);
    expect(mapped.wet).toBe(1);
    expect(mapped.dry).toBe(0);
    expect(mapped.width).toBe(1);
    expect(mapped.mode).toBe(0);
  });

  it('hard-disarms Freeverb wet when character wetGain is zero', () => {
    const dryCharacter = mapRoomCharacterToFreeverbParameters({
      ...AUDIO_ROOM_CHARACTER_MEDIUM,
      wetGain: 0,
    });
    const wetCharacter = mapRoomCharacterToFreeverbParameters({
      ...AUDIO_ROOM_CHARACTER_MEDIUM,
      wetGain: 0.2,
    });
    expect(dryCharacter.wet).toBe(0);
    expect(wetCharacter.wet).toBe(1);
  });

  it('maps darker lowpass characters to higher Freeverb damp', () => {
    const bright = mapRoomCharacterToFreeverbParameters({
      ...AUDIO_ROOM_CHARACTER_MEDIUM,
      wetLowpassHz: 4000,
    });
    const dark = mapRoomCharacterToFreeverbParameters({
      ...AUDIO_ROOM_CHARACTER_MEDIUM,
      wetLowpassHz: 1600,
    });
    expect(dark.damp).toBeGreaterThan(bright.damp);
    expect(dark.damp).toBeGreaterThanOrEqual(0);
    expect(dark.damp).toBeLessThanOrEqual(1);
  });
});

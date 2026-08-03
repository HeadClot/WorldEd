import type { AudioRoomCharacter } from '@/audio/space/audio_room_character.js';
import type { AudioFreeverbParameters } from './audio_freeverb_parameters.js';
import { AUDIO_FREEVERB_PARAMETERS_DEFAULT } from './audio_freeverb_parameters.js';

/**
 * Maps probe room character onto Freeverb size/damp knobs. Wet level is not
 * mapped here: the soft-reverb bus uses wetSend gain so existing Freeverb tails
 * are not hard-gated when room wet changes.
 *
 * @param character Room character from the space probe.
 * @returns Freeverb parameters ready for AudioFreeverbModel setters.
 */
export function mapRoomCharacterToFreeverbParameters(character: AudioRoomCharacter): AudioFreeverbParameters {
  return {
    roomSize: mapRoomSize(character),
    damp: mapDamp(character),
    wet: character.wetGain <= 1e-6 ? 0 : 1,
    dry: 0,
    width: AUDIO_FREEVERB_PARAMETERS_DEFAULT.width,
    mode: AUDIO_FREEVERB_PARAMETERS_DEFAULT.mode,
  };
}

/**
 * Maps room tail fields onto Freeverb public room size 0–1.
 *
 * @param character Room character.
 * @returns Room size for setRoomSize.
 */
function mapRoomSize(character: AudioRoomCharacter): number {
  const fromTail = (character.tailDelayScale - 0.5) / 1.6;
  const fromFeedback = (character.tailFeedback - 0.18) / 0.2;
  const blended = fromTail * 0.65 + fromFeedback * 0.35;
  return clamp01(blended);
}

/**
 * Maps wet lowpass target onto Freeverb public damp 0–1.
 *
 * @param character Room character.
 * @returns Damp for setDamp.
 */
function mapDamp(character: AudioRoomCharacter): number {
  const damp = 1 - (character.wetLowpassHz - 1200) / 4500;
  return clamp01(damp);
}

/**
 * Clamps a value to [0, 1].
 *
 * @param value Input.
 * @returns Clamped value.
 */
function clamp01(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

/** Freeverb public parameters in the same 0–1 units as Jezar's set* API. */
export interface AudioFreeverbParameters {
  /** Room size 0–1 (maps through scaleroom/offsetroom to comb feedback). */
  roomSize: number;
  /** High-frequency damp 0–1 (maps through scaledamp to comb one-pole). */
  damp: number;
  /** Wet level 0–1 (maps through scalewet). */
  wet: number;
  /** Dry level 0–1 (maps through scaledry). */
  dry: number;
  /** Stereo width 0–1. */
  width: number;
  /** Freeze mode 0–1 (at or above 0.5 freezes the reverb). */
  mode: number;
}

/** Classic Freeverb defaults for a newly constructed model. */
export const AUDIO_FREEVERB_PARAMETERS_DEFAULT: Readonly<AudioFreeverbParameters> = Object.freeze({
  roomSize: 0.5,
  damp: 0.5,
  wet: 1 / 3,
  dry: 0,
  width: 1,
  mode: 0,
});

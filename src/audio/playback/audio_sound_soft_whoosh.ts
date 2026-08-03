import { audioContextHost, type AudioContextHost } from '@/audio/context/audio_context_host.js';
import { audioEffectSoftReverb, type AudioEffectSoftReverb } from '@/audio/effect/audio_effect_soft_reverb.js';
import { audioSoundEmbeddedClick, AudioSoundEmbeddedClick } from './audio_sound_embedded_click.js';

/**
 * Move/drag snap feedback: plays the embedded click001.wav sample (same asset
 * as resize, so drag and scale share one short snap).
 */
export class AudioSoundSoftWhoosh {
  private readonly player: AudioSoundEmbeddedClick;

  /**
   * Creates a move-snap player backed by the embedded WAV sample.
   *
   * @param contextHost Shared context host for create/unlock/resume.
   * @param softReverb Soft reverb bus for wet/dry output.
   * @param player Optional embedded-click player (shared by default).
   */
  constructor(
    contextHost: AudioContextHost = audioContextHost,
    softReverb: AudioEffectSoftReverb = audioEffectSoftReverb,
    player: AudioSoundEmbeddedClick = audioSoundEmbeddedClick,
  ) {
    this.player = player === audioSoundEmbeddedClick ? new AudioSoundEmbeddedClick(contextHost, softReverb) : player;
  }

  /**
   * Plays one embedded click for a move snap step.
   *
   * @param playbackRate BufferSource playback rate (1 = default pitch).
   */
  play(playbackRate = 1): void {
    this.player.play(playbackRate);
  }
}

/** Shared move-snap player for selection drag snap feedback. */
export const audioSoundSoftWhoosh = new AudioSoundSoftWhoosh();

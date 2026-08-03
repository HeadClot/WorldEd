import { audioContextHost, type AudioContextHost } from '@/audio/context/audio_context_host.js';
import { audioEffectSoftReverb, type AudioEffectSoftReverb } from '@/audio/effect/audio_effect_soft_reverb.js';
import { audioSoundEmbeddedClick, AudioSoundEmbeddedClick } from './audio_sound_embedded_click.js';

/** Scale/resize snap feedback: plays the embedded click001.wav sample. */
export class AudioSoundSoftClick {
  private readonly player: AudioSoundEmbeddedClick;

  /**
   * Creates a soft-click player backed by the embedded WAV sample.
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
   * Ensures the audio context exists and is running. Call from a user gesture
   * so later RAF playback is unlocked.
   */
  unlock(): void {
    this.player.unlock();
  }

  /**
   * Plays one embedded click for a scale/resize snap step.
   *
   * @param playbackRate BufferSource playback rate (1 = default pitch).
   */
  play(playbackRate = 1): void {
    this.player.play(playbackRate);
  }
}

/** Shared soft-click player for selection scale/resize snap feedback. */
export const audioSoundSoftClick = new AudioSoundSoftClick();

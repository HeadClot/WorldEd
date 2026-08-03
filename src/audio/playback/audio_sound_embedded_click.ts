import { audioContextHost, type AudioContextHost } from '@/audio/context/audio_context_host.js';
import { audioEffectSoftReverb, type AudioEffectSoftReverb } from '@/audio/effect/audio_effect_soft_reverb.js';
import { audioSampleClick001, type AudioSampleClick001 } from '@/audio/sample/audio_sample_click001.js';

/**
 * Plays the embedded click001.wav sample into the soft reverb bus. Used for
 * both selection move (drag) and scale/resize snap feedback.
 */
export class AudioSoundEmbeddedClick {
  private readonly contextHost: AudioContextHost;
  private readonly softReverb: AudioEffectSoftReverb;
  private readonly sample: AudioSampleClick001;
  private readonly playbackGain: number;
  private readonly activeSources: Set<AudioBufferSourceNode>;

  /**
   * Creates an embedded-click player.
   *
   * @param contextHost Shared context host for create/unlock/resume.
   * @param softReverb Soft reverb bus for wet/dry output.
   * @param sample Decoded click001 sample cache.
   * @param playbackGain Linear gain applied to each one-shot (0–1).
   */
  constructor(
    contextHost: AudioContextHost = audioContextHost,
    softReverb: AudioEffectSoftReverb = audioEffectSoftReverb,
    sample: AudioSampleClick001 = audioSampleClick001,
    playbackGain = 0.72,
  ) {
    this.contextHost = contextHost;
    this.softReverb = softReverb;
    this.sample = sample;
    this.playbackGain = playbackGain;
    this.activeSources = new Set();
  }

  /**
   * Ensures the audio context exists and is running. Call from a user gesture
   * so later RAF playback is unlocked.
   */
  unlock(): void {
    this.contextHost.unlock();
    const context = this.contextHost.ensureContext();
    if (context) {
      void this.sample.getDecodedBuffer(context);
    }
  }

  /**
   * Plays one click sample if the context is running. When suspended, only
   * resumes (no queued play) so wake-up does not fire a backlog of snaps.
   *
   * @param playbackRate BufferSource playback rate (1 = default pitch).
   */
  play(playbackRate = 1): void {
    const context = this.contextHost.ensureContext();
    if (!context) {
      return;
    }
    if (context.state !== 'running') {
      void this.contextHost.resumeContext(context);
      return;
    }
    void this.playWhenReady(context, playbackRate);
  }

  /**
   * Ensures the WAV is decoded, then schedules a one-shot into the reverb bus.
   *
   * @param context Running audio context.
   * @param playbackRate BufferSource playback rate.
   */
  private async playWhenReady(context: AudioContext, playbackRate: number): Promise<void> {
    const cached = this.sample.getCachedBuffer(context);
    if (cached) {
      this.scheduleSample(context, cached, playbackRate);
      return;
    }
    const decoded = await this.sample.getDecodedBuffer(context);
    if (!decoded || context.state !== 'running') {
      return;
    }
    this.scheduleSample(context, decoded, playbackRate);
  }

  /**
   * Schedules one buffer playback of the decoded click into the reverb input.
   *
   * @param context Running audio context.
   * @param buffer Decoded click sample.
   * @param playbackRate BufferSource playback rate (pitch / speed).
   */
  private scheduleSample(context: AudioContext, buffer: AudioBuffer, playbackRate: number): void {
    const now = context.currentTime;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;
    gain.gain.value = this.playbackGain;
    source.connect(gain);
    gain.connect(this.softReverb.getInput(context));
    this.retainSourceUntilEnded(source);
    source.start(now);
  }

  /**
   * Keeps a playing source referenced until it ends so it is not GC-stopped.
   *
   * @param source One-shot buffer source.
   */
  private retainSourceUntilEnded(source: AudioBufferSourceNode): void {
    this.activeSources.add(source);
    const release = (): void => {
      this.activeSources.delete(source);
    };
    source.onended = release;
  }
}

/** Shared embedded click used for drag move and resize snaps. */
export const audioSoundEmbeddedClick = new AudioSoundEmbeddedClick();

import { AudioFreeverbAllpass } from './audio_freeverb_allpass.js';
import { AudioFreeverbComb } from './audio_freeverb_comb.js';
import {
  FREEVERB_ALLPASS_FEEDBACK,
  FREEVERB_ALLPASS_TUNING_L,
  FREEVERB_ALLPASS_TUNING_R,
  FREEVERB_COMB_TUNING_L,
  FREEVERB_COMB_TUNING_R,
  FREEVERB_FIXED_GAIN,
  FREEVERB_FREEZE_MODE,
  FREEVERB_INITIAL_DAMP,
  FREEVERB_INITIAL_DRY,
  FREEVERB_INITIAL_MODE,
  FREEVERB_INITIAL_ROOM,
  FREEVERB_INITIAL_WET,
  FREEVERB_INITIAL_WIDTH,
  FREEVERB_MUTED,
  FREEVERB_NUM_ALLPASSES,
  FREEVERB_NUM_COMBS,
  FREEVERB_OFFSET_ROOM,
  FREEVERB_SCALE_DAMP,
  FREEVERB_SCALE_DRY,
  FREEVERB_SCALE_ROOM,
  FREEVERB_SCALE_WET,
  FREEVERB_TUNING_SAMPLE_RATE,
  scaleFreeverbTuningTable,
} from './audio_freeverb_tuning.js';

/** Freeverb revmodel: stereo parallel combs into series allpasses with mix. */
export class AudioFreeverbModel {
  private gain: number;
  private roomsize: number;
  private roomsize1: number;
  private damp: number;
  private damp1: number;
  private wet: number;
  private wet1: number;
  private wet2: number;
  private dry: number;
  private width: number;
  private mode: number;
  private readonly combTuningL: number[];
  private readonly combTuningR: number[];
  private readonly allpassTuningL: number[];
  private readonly allpassTuningR: number[];
  private readonly combL: AudioFreeverbComb[];
  private readonly combR: AudioFreeverbComb[];
  private readonly allpassL: AudioFreeverbAllpass[];
  private readonly allpassR: AudioFreeverbAllpass[];
  private readonly bufcombL: Float32Array[];
  private readonly bufcombR: Float32Array[];
  private readonly bufallpassL: Float32Array[];
  private readonly bufallpassR: Float32Array[];

  /**
   * Builds the Freeverb network for a sample rate and applies default
   * parameters.
   *
   * @param sampleRate Live sample rate in Hz (delay tables are scaled from 44.1
   *   kHz).
   */
  constructor(sampleRate: number = FREEVERB_TUNING_SAMPLE_RATE) {
    this.gain = FREEVERB_FIXED_GAIN;
    this.roomsize = 0;
    this.roomsize1 = 0;
    this.damp = 0;
    this.damp1 = 0;
    this.wet = 0;
    this.wet1 = 0;
    this.wet2 = 0;
    this.dry = 0;
    this.width = 0;
    this.mode = 0;
    this.combTuningL = scaleFreeverbTuningTable(FREEVERB_COMB_TUNING_L, sampleRate);
    this.combTuningR = scaleFreeverbTuningTable(FREEVERB_COMB_TUNING_R, sampleRate);
    this.allpassTuningL = scaleFreeverbTuningTable(FREEVERB_ALLPASS_TUNING_L, sampleRate);
    this.allpassTuningR = scaleFreeverbTuningTable(FREEVERB_ALLPASS_TUNING_R, sampleRate);
    this.combL = this.createCombArray();
    this.combR = this.createCombArray();
    this.allpassL = this.createAllpassArray();
    this.allpassR = this.createAllpassArray();
    this.bufcombL = this.createCombBuffers(this.combTuningL);
    this.bufcombR = this.createCombBuffers(this.combTuningR);
    this.bufallpassL = this.createAllpassBuffers(this.allpassTuningL);
    this.bufallpassR = this.createAllpassBuffers(this.allpassTuningR);
    this.finishConstruction();
  }

  /** Binds buffers, sets defaults, and mutes delay lines after field init. */
  private finishConstruction(): void {
    this.bindComponentBuffers();
    this.initialiseAllpassFeedback();
    this.applyInitialParameters();
    this.mute();
  }

  /** Clears every delay buffer unless freeze mode is active. */
  mute(): void {
    if (this.getMode() >= FREEVERB_FREEZE_MODE) {
      return;
    }
    this.muteCombArrays();
    this.muteAllpassArrays();
  }

  /**
   * Processes samples, replacing the output buffers with Freeverb mix.
   *
   * @param inputL Left input samples.
   * @param inputR Right input samples.
   * @param outputL Left output samples (replaced).
   * @param outputR Right output samples (replaced).
   * @param numsamples Number of frames to process.
   * @param skip Index stride between frames (1 for planar channels).
   */
  processReplace(
    inputL: ArrayLike<number>,
    inputR: ArrayLike<number>,
    outputL: { [index: number]: number },
    outputR: { [index: number]: number },
    numsamples: number,
    skip: number,
  ): void {
    let index = 0;
    let remaining = numsamples;
    while (remaining > 0) {
      this.processReplaceFrame(inputL, inputR, outputL, outputR, index);
      index += skip;
      remaining -= 1;
    }
  }

  /**
   * Processes samples, mixing Freeverb output into the output buffers.
   *
   * @param inputL Left input samples.
   * @param inputR Right input samples.
   * @param outputL Left output samples (accumulated).
   * @param outputR Right output samples (accumulated).
   * @param numsamples Number of frames to process.
   * @param skip Index stride between frames (1 for planar channels).
   */
  processMix(
    inputL: ArrayLike<number>,
    inputR: ArrayLike<number>,
    outputL: { [index: number]: number },
    outputR: { [index: number]: number },
    numsamples: number,
    skip: number,
  ): void {
    let index = 0;
    let remaining = numsamples;
    while (remaining > 0) {
      this.processMixFrame(inputL, inputR, outputL, outputR, index);
      index += skip;
      remaining -= 1;
    }
  }

  /**
   * Sets public room size 0–1 and updates comb feedback.
   *
   * @param value Public room-size parameter.
   */
  setRoomSize(value: number): void {
    this.roomsize = value * FREEVERB_SCALE_ROOM + FREEVERB_OFFSET_ROOM;
    this.update();
  }

  /**
   * Returns the public room-size parameter.
   *
   * @returns Room size in 0–1 Freeverb units.
   */
  getRoomSize(): number {
    return (this.roomsize - FREEVERB_OFFSET_ROOM) / FREEVERB_SCALE_ROOM;
  }

  /**
   * Sets public damp 0–1 and updates comb one-pole coefficients.
   *
   * @param value Public damp parameter.
   */
  setDamp(value: number): void {
    this.damp = value * FREEVERB_SCALE_DAMP;
    this.update();
  }

  /**
   * Returns the public damp parameter.
   *
   * @returns Damp in 0–1 Freeverb units.
   */
  getDamp(): number {
    return this.damp / FREEVERB_SCALE_DAMP;
  }

  /**
   * Sets public wet 0–1 and updates wet1/wet2 mix coefficients.
   *
   * @param value Public wet parameter.
   */
  setWet(value: number): void {
    this.wet = value * FREEVERB_SCALE_WET;
    this.update();
  }

  /**
   * Returns the public wet parameter.
   *
   * @returns Wet in 0–1 Freeverb units.
   */
  getWet(): number {
    return this.wet / FREEVERB_SCALE_WET;
  }

  /**
   * Sets public dry 0–1.
   *
   * @param value Public dry parameter.
   */
  setDry(value: number): void {
    this.dry = value * FREEVERB_SCALE_DRY;
  }

  /**
   * Returns the public dry parameter.
   *
   * @returns Dry in 0–1 Freeverb units.
   */
  getDry(): number {
    return this.dry / FREEVERB_SCALE_DRY;
  }

  /**
   * Sets stereo width 0–1 and updates wet1/wet2.
   *
   * @param value Width parameter.
   */
  setWidth(value: number): void {
    this.width = value;
    this.update();
  }

  /**
   * Returns the stereo width parameter.
   *
   * @returns Width last passed to setWidth.
   */
  getWidth(): number {
    return this.width;
  }

  /**
   * Sets freeze mode (values at or above freeze threshold enable freeze).
   *
   * @param value Mode parameter.
   */
  setMode(value: number): void {
    this.mode = value;
    this.update();
  }

  /**
   * Returns 1 when freeze is active, otherwise 0.
   *
   * @returns Freeze flag as Freeverb reports it.
   */
  getMode(): number {
    if (this.mode >= FREEVERB_FREEZE_MODE) {
      return 1;
    }
    return 0;
  }

  /**
   * Replaces one stereo frame at the given sample index.
   *
   * @param inputL Left input buffer.
   * @param inputR Right input buffer.
   * @param outputL Left output buffer.
   * @param outputR Right output buffer.
   * @param index Frame index into the buffers.
   */
  private processReplaceFrame(
    inputL: ArrayLike<number>,
    inputR: ArrayLike<number>,
    outputL: { [index: number]: number },
    outputR: { [index: number]: number },
    index: number,
  ): void {
    const monoInput = this.monoInputFromStereo(inputL, inputR, index);
    const outL = this.processLeftChannel(monoInput);
    const outR = this.processRightChannel(monoInput);
    outputL[index] = outL * this.wet1 + outR * this.wet2 + inputL[index]! * this.dry;
    outputR[index] = outR * this.wet1 + outL * this.wet2 + inputR[index]! * this.dry;
  }

  /**
   * Mixes one stereo frame into the given sample index.
   *
   * @param inputL Left input buffer.
   * @param inputR Right input buffer.
   * @param outputL Left output buffer.
   * @param outputR Right output buffer.
   * @param index Frame index into the buffers.
   */
  private processMixFrame(
    inputL: ArrayLike<number>,
    inputR: ArrayLike<number>,
    outputL: { [index: number]: number },
    outputR: { [index: number]: number },
    index: number,
  ): void {
    const monoInput = this.monoInputFromStereo(inputL, inputR, index);
    const outL = this.processLeftChannel(monoInput);
    const outR = this.processRightChannel(monoInput);
    outputL[index] = (outputL[index] ?? 0) + outL * this.wet1 + outR * this.wet2 + inputL[index]! * this.dry;
    outputR[index] = (outputR[index] ?? 0) + outR * this.wet1 + outL * this.wet2 + inputR[index]! * this.dry;
  }

  /**
   * Builds the mono comb input as (L + R) * gain.
   *
   * @param inputL Left input buffer.
   * @param inputR Right input buffer.
   * @param index Frame index.
   * @returns Scaled mono sum for the comb bank.
   */
  private monoInputFromStereo(inputL: ArrayLike<number>, inputR: ArrayLike<number>, index: number): number {
    return (inputL[index]! + inputR[index]!) * this.gain;
  }

  /**
   * Runs parallel left combs then series left allpasses.
   *
   * @param input Mono comb input sample.
   * @returns Left wet sample before width mix.
   */
  private processLeftChannel(input: number): number {
    const combSum = this.accumulateCombs(this.combL, input);
    return this.runAllpasses(this.allpassL, combSum);
  }

  /**
   * Runs parallel right combs then series right allpasses.
   *
   * @param input Mono comb input sample.
   * @returns Right wet sample before width mix.
   */
  private processRightChannel(input: number): number {
    const combSum = this.accumulateCombs(this.combR, input);
    return this.runAllpasses(this.allpassR, combSum);
  }

  /**
   * Sums parallel comb outputs for one channel.
   *
   * @param combs Comb filters for one channel.
   * @param input Mono input into every comb.
   * @returns Accumulated comb output.
   */
  private accumulateCombs(combs: readonly AudioFreeverbComb[], input: number): number {
    let sum = 0;
    for (let index = 0; index < FREEVERB_NUM_COMBS; index++) {
      sum += combs[index]!.process(input);
    }
    return sum;
  }

  /**
   * Feeds a sample through series allpasses for one channel.
   *
   * @param allpasses Allpass stages for one channel.
   * @param input Comb-sum input.
   * @returns Diffused sample.
   */
  private runAllpasses(allpasses: readonly AudioFreeverbAllpass[], input: number): number {
    let sample = input;
    for (let index = 0; index < FREEVERB_NUM_ALLPASSES; index++) {
      sample = allpasses[index]!.process(sample);
    }
    return sample;
  }

  /** Recalculates internal gains and pushes room/damp to every comb. */
  private update(): void {
    this.updateWetMixCoefficients();
    this.updateFreezeOrNormalState();
    this.pushFeedbackToCombs();
    this.pushDampToCombs();
  }

  /** Computes wet1 and wet2 from wet and width. */
  private updateWetMixCoefficients(): void {
    this.wet1 = this.wet * (this.width / 2 + 0.5);
    this.wet2 = this.wet * ((1 - this.width) / 2);
  }

  /** Applies freeze-mode overrides or normal room/damp/gain. */
  private updateFreezeOrNormalState(): void {
    if (this.mode >= FREEVERB_FREEZE_MODE) {
      this.roomsize1 = 1;
      this.damp1 = 0;
      this.gain = FREEVERB_MUTED;
      return;
    }
    this.roomsize1 = this.roomsize;
    this.damp1 = this.damp;
    this.gain = FREEVERB_FIXED_GAIN;
  }

  /** Writes roomsize1 feedback into every comb. */
  private pushFeedbackToCombs(): void {
    for (let index = 0; index < FREEVERB_NUM_COMBS; index++) {
      this.combL[index]!.setFeedback(this.roomsize1);
      this.combR[index]!.setFeedback(this.roomsize1);
    }
  }

  /** Writes damp1 into every comb. */
  private pushDampToCombs(): void {
    for (let index = 0; index < FREEVERB_NUM_COMBS; index++) {
      this.combL[index]!.setDamp(this.damp1);
      this.combR[index]!.setDamp(this.damp1);
    }
  }

  /**
   * Creates eight empty comb instances.
   *
   * @returns Comb array of Freeverb length.
   */
  private createCombArray(): AudioFreeverbComb[] {
    const combs: AudioFreeverbComb[] = [];
    for (let index = 0; index < FREEVERB_NUM_COMBS; index++) {
      combs.push(new AudioFreeverbComb());
    }
    return combs;
  }

  /**
   * Creates four empty allpass instances.
   *
   * @returns Allpass array of Freeverb length.
   */
  private createAllpassArray(): AudioFreeverbAllpass[] {
    const allpasses: AudioFreeverbAllpass[] = [];
    for (let index = 0; index < FREEVERB_NUM_ALLPASSES; index++) {
      allpasses.push(new AudioFreeverbAllpass());
    }
    return allpasses;
  }

  /**
   * Allocates comb delay buffers for the given tuning table.
   *
   * @param tunings Sample lengths per comb.
   * @returns Buffer array matching the tunings.
   */
  private createCombBuffers(tunings: readonly number[]): Float32Array[] {
    const buffers: Float32Array[] = [];
    for (let index = 0; index < FREEVERB_NUM_COMBS; index++) {
      buffers.push(new Float32Array(tunings[index]!));
    }
    return buffers;
  }

  /**
   * Allocates allpass delay buffers for the given tuning table.
   *
   * @param tunings Sample lengths per allpass.
   * @returns Buffer array matching the tunings.
   */
  private createAllpassBuffers(tunings: readonly number[]): Float32Array[] {
    const buffers: Float32Array[] = [];
    for (let index = 0; index < FREEVERB_NUM_ALLPASSES; index++) {
      buffers.push(new Float32Array(tunings[index]!));
    }
    return buffers;
  }

  /** Ties every comb and allpass to its dedicated delay buffer. */
  private bindComponentBuffers(): void {
    this.bindCombBuffers(this.combL, this.bufcombL, this.combTuningL);
    this.bindCombBuffers(this.combR, this.bufcombR, this.combTuningR);
    this.bindAllpassBuffers(this.allpassL, this.bufallpassL, this.allpassTuningL);
    this.bindAllpassBuffers(this.allpassR, this.bufallpassR, this.allpassTuningR);
  }

  /**
   * Binds comb instances to buffers with Freeverb tuning lengths.
   *
   * @param combs Comb filters.
   * @param buffers Delay storage.
   * @param tunings Sample lengths.
   */
  private bindCombBuffers(
    combs: readonly AudioFreeverbComb[],
    buffers: readonly Float32Array[],
    tunings: readonly number[],
  ): void {
    for (let index = 0; index < FREEVERB_NUM_COMBS; index++) {
      combs[index]!.setBuffer(buffers[index]!, tunings[index]!);
    }
  }

  /**
   * Binds allpass instances to buffers with Freeverb tuning lengths.
   *
   * @param allpasses Allpass filters.
   * @param buffers Delay storage.
   * @param tunings Sample lengths.
   */
  private bindAllpassBuffers(
    allpasses: readonly AudioFreeverbAllpass[],
    buffers: readonly Float32Array[],
    tunings: readonly number[],
  ): void {
    for (let index = 0; index < FREEVERB_NUM_ALLPASSES; index++) {
      allpasses[index]!.setBuffer(buffers[index]!, tunings[index]!);
    }
  }

  /** Sets every allpass feedback coefficient to Freeverb's 0.5. */
  private initialiseAllpassFeedback(): void {
    for (let index = 0; index < FREEVERB_NUM_ALLPASSES; index++) {
      this.allpassL[index]!.setFeedback(FREEVERB_ALLPASS_FEEDBACK);
      this.allpassR[index]!.setFeedback(FREEVERB_ALLPASS_FEEDBACK);
    }
  }

  /** Applies Freeverb's published default public parameters. */
  private applyInitialParameters(): void {
    this.setWet(FREEVERB_INITIAL_WET);
    this.setRoomSize(FREEVERB_INITIAL_ROOM);
    this.setDry(FREEVERB_INITIAL_DRY);
    this.setDamp(FREEVERB_INITIAL_DAMP);
    this.setWidth(FREEVERB_INITIAL_WIDTH);
    this.setMode(FREEVERB_INITIAL_MODE);
  }

  /** Mutes all comb delay lines. */
  private muteCombArrays(): void {
    for (let index = 0; index < FREEVERB_NUM_COMBS; index++) {
      this.combL[index]!.mute();
      this.combR[index]!.mute();
    }
  }

  /** Mutes all allpass delay lines. */
  private muteAllpassArrays(): void {
    for (let index = 0; index < FREEVERB_NUM_ALLPASSES; index++) {
      this.allpassL[index]!.mute();
      this.allpassR[index]!.mute();
    }
  }
}

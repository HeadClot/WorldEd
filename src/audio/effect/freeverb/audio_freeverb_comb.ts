import { freeverbUndenormalise } from './audio_freeverb_undenormalise.js';

/** Freeverb comb filter: delay with one-pole lowpass in the feedback path. */
export class AudioFreeverbComb {
  private feedback: number;
  private filterstore: number;
  private damp1: number;
  private damp2: number;
  private buffer: Float32Array;
  private bufsize: number;
  private bufidx: number;

  /** Creates a comb with empty buffer until setBuffer assigns storage. */
  constructor() {
    this.feedback = 0;
    this.filterstore = 0;
    this.damp1 = 0;
    this.damp2 = 1;
    this.buffer = new Float32Array(0);
    this.bufsize = 0;
    this.bufidx = 0;
  }

  /**
   * Binds this comb to a delay buffer of the given length.
   *
   * @param buffer Delay storage written and read by process.
   * @param size Number of samples in the buffer.
   */
  setBuffer(buffer: Float32Array, size: number): void {
    this.buffer = buffer;
    this.bufsize = size;
  }

  /** Clears the delay buffer to silence. */
  mute(): void {
    this.buffer.fill(0);
  }

  /**
   * Sets the one-pole damp coefficient (damp1) and its complement (damp2).
   *
   * @param value Damp amount in 0–1 used as damp1.
   */
  setDamp(value: number): void {
    this.damp1 = value;
    this.damp2 = 1 - value;
  }

  /**
   * Returns the current damp1 coefficient.
   *
   * @returns Damp amount last passed to setDamp.
   */
  getDamp(): number {
    return this.damp1;
  }

  /**
   * Sets the comb feedback gain applied after the one-pole filter.
   *
   * @param value Feedback coefficient.
   */
  setFeedback(value: number): void {
    this.feedback = value;
  }

  /**
   * Returns the current feedback coefficient.
   *
   * @returns Feedback last passed to setFeedback.
   */
  getFeedback(): number {
    return this.feedback;
  }

  /**
   * Processes one input sample and returns the undamped delay output.
   *
   * @param input Sample written into the feedback sum.
   * @returns Sample read from the current buffer index.
   */
  process(input: number): number {
    const output = this.bufferOutputRead();
    this.filterstoreUpdate(output);
    this.bufferInputWrite(input);
    this.bufferIndexAdvance();
    return output;
  }

  /**
   * Reads and undenormalises the sample at the current buffer index.
   *
   * @returns Delay output sample.
   */
  private bufferOutputRead(): number {
    return freeverbUndenormalise(this.buffer[this.bufidx]!);
  }

  /**
   * Updates the one-pole filterstore from a delay output sample.
   *
   * @param output Undamped sample from the delay buffer.
   */
  private filterstoreUpdate(output: number): void {
    const mixed = output * this.damp2 + this.filterstore * this.damp1;
    this.filterstore = freeverbUndenormalise(mixed);
  }

  /**
   * Writes input plus filtered feedback into the current buffer index.
   *
   * @param input Fresh input sample.
   */
  private bufferInputWrite(input: number): void {
    this.buffer[this.bufidx] = input + this.filterstore * this.feedback;
  }

  /** Advances the circular buffer index, wrapping at bufsize. */
  private bufferIndexAdvance(): void {
    this.bufidx += 1;
    if (this.bufidx >= this.bufsize) {
      this.bufidx = 0;
    }
  }
}

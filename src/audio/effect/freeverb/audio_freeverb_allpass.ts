import { freeverbUndenormalise } from './audio_freeverb_undenormalise.js';

/** Freeverb allpass diffuser used after the parallel comb bank. */
export class AudioFreeverbAllpass {
  private feedback: number;
  private buffer: Float32Array;
  private bufsize: number;
  private bufidx: number;

  /** Creates an allpass with empty buffer until setBuffer assigns storage. */
  constructor() {
    this.feedback = 0;
    this.buffer = new Float32Array(0);
    this.bufsize = 0;
    this.bufidx = 0;
  }

  /**
   * Binds this allpass to a delay buffer of the given length.
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
   * Sets the allpass feedback coefficient.
   *
   * @param value Feedback amount (Freeverb uses 0.5).
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
   * Processes one input sample through the Freeverb allpass.
   *
   * @param input Input sample.
   * @returns Diffused output sample.
   */
  process(input: number): number {
    const bufout = this.bufferOutputRead();
    const output = -input + bufout;
    this.bufferInputWrite(input, bufout);
    this.bufferIndexAdvance();
    return output;
  }

  /**
   * Reads and undenormalises the sample at the current buffer index.
   *
   * @returns Delayed sample.
   */
  private bufferOutputRead(): number {
    return freeverbUndenormalise(this.buffer[this.bufidx]!);
  }

  /**
   * Writes the Freeverb allpass state into the current buffer index.
   *
   * @param input Current input sample.
   * @param bufout Delayed sample already read for this step.
   */
  private bufferInputWrite(input: number, bufout: number): void {
    this.buffer[this.bufidx] = input + bufout * this.feedback;
  }

  /** Advances the circular buffer index, wrapping at bufsize. */
  private bufferIndexAdvance(): void {
    this.bufidx += 1;
    if (this.bufidx >= this.bufsize) {
      this.bufidx = 0;
    }
  }
}

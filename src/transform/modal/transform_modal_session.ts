import { TransformModalAxis } from './transform_modal_axis.js';
import { TransformModalNumericBuffer } from './transform_modal_numeric_buffer.js';

/** Mutable keyboard modal state for one transform drag (axis lock + number). */
export class TransformModalSession {
  private axis: TransformModalAxis;
  private readonly numericBuffer: TransformModalNumericBuffer;
  private active: boolean;

  /** Creates an idle modal session. */
  constructor() {
    this.axis = TransformModalAxis.None;
    this.numericBuffer = new TransformModalNumericBuffer();
    this.active = false;
  }

  /** Begins modal keyboard handling for a new drag. */
  begin(): void {
    this.active = true;
    this.axis = TransformModalAxis.None;
    this.numericBuffer.clear();
  }

  /** Ends modal keyboard handling and clears typed state. */
  end(): void {
    this.active = false;
    this.axis = TransformModalAxis.None;
    this.numericBuffer.clear();
  }

  /**
   * Returns whether the modal session is attached to an active drag.
   *
   * @returns True while a drag is in progress.
   */
  isActive(): boolean {
    return this.active;
  }

  /**
   * Returns the current keyboard axis lock.
   *
   * @returns Modal axis enum.
   */
  getAxis(): TransformModalAxis {
    return this.axis;
  }

  /**
   * Sets the keyboard axis lock.
   *
   * @param axis New modal axis lock.
   */
  setAxis(axis: TransformModalAxis): void {
    this.axis = axis;
  }

  /**
   * Returns the numeric typing buffer.
   *
   * @returns Shared buffer instance.
   */
  getNumericBuffer(): TransformModalNumericBuffer {
    return this.numericBuffer;
  }
}

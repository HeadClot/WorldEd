import type { AudioFreeverbParameters } from './audio_freeverb_parameters.js';
import {
  ensureAudioFreeverbWorkletRegistered,
  getAudioFreeverbWorkletProcessorName,
} from './audio_freeverb_worklet_register.js';

/**
 * Hosts sample-accurate Freeverb on an AudioWorklet (audio thread). Falls back
 * to a silent wet path when AudioWorklet is unavailable.
 */
export class AudioFreeverbNetwork {
  private readonly context: AudioContext;
  private readonly wetInput: GainNode;
  private readonly wetOutput: GainNode;
  private workletNode: AudioWorkletNode | null;
  private latestParameters: AudioFreeverbParameters | null;
  private readonly installPromise: Promise<void>;

  /**
   * Builds Freeverb routing for one audio context and starts worklet install.
   *
   * @param context Live audio context.
   */
  constructor(context: AudioContext) {
    this.context = context;
    this.wetInput = context.createGain();
    this.wetOutput = context.createGain();
    this.workletNode = null;
    this.latestParameters = null;
    this.wetInput.gain.value = 1;
    this.wetOutput.gain.value = 0;
    this.installPromise = this.installWorkletNode();
  }

  /**
   * Returns the wet-send input node.
   *
   * @returns Input gain feeding Freeverb.
   */
  getWetInput(): AudioNode {
    return this.wetInput;
  }

  /**
   * Returns the Freeverb wet output node.
   *
   * @returns Output gain after Freeverb stereo mix.
   */
  getWetOutput(): AudioNode {
    return this.wetOutput;
  }

  /**
   * Applies Freeverb public parameters to the running worklet model.
   *
   * @param parameters Room, damp, wet, dry, width, and mode in Freeverb units.
   */
  applyParameters(parameters: AudioFreeverbParameters): void {
    this.latestParameters = {
      roomSize: parameters.roomSize,
      damp: parameters.damp,
      wet: parameters.wet,
      dry: parameters.dry,
      width: parameters.width,
      mode: parameters.mode,
    };
    this.postParametersToWorklet();
  }

  /**
   * Enables or disables the Freeverb wet output bus (hard gate for 2D / dry).
   *
   * @param enabled When false, wet output is fully silent.
   */
  setWetOutputEnabled(enabled: boolean): void {
    this.wetOutput.gain.value = enabled ? 1 : 0;
  }

  /** Clears Freeverb delay lines on the worklet when available. */
  mute(): void {
    const node = this.workletNode;
    if (!node) {
      return;
    }
    node.port.postMessage({ mute: true });
  }

  /**
   * Returns the worklet install promise (for tests that need readiness).
   *
   * @returns Install promise.
   */
  whenReady(): Promise<void> {
    return this.installPromise;
  }

  /**
   * Registers the worklet, creates the node, and wires wet input to output.
   *
   * @returns Promise that settles when wiring is complete or has failed.
   */
  private async installWorkletNode(): Promise<void> {
    try {
      await ensureAudioFreeverbWorkletRegistered(this.context);
      this.createAndWireWorkletNode();
      this.postParametersToWorklet();
    } catch {
      this.workletNode = null;
    }
  }

  /** Constructs AudioWorkletNode and connects wetInput → worklet → wetOutput. */
  private createAndWireWorkletNode(): void {
    if (typeof AudioWorkletNode === 'undefined') {
      return;
    }
    const node = new AudioWorkletNode(this.context, getAudioFreeverbWorkletProcessorName(), {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers',
    });
    this.workletNode = node;
    this.wetInput.connect(node);
    node.connect(this.wetOutput);
  }

  /** Posts the latest Freeverb parameters to the worklet when present. */
  private postParametersToWorklet(): void {
    const node = this.workletNode;
    const parameters = this.latestParameters;
    if (!node || !parameters) {
      return;
    }
    node.port.postMessage({
      roomSize: parameters.roomSize,
      damp: parameters.damp,
      wet: parameters.wet,
      dry: parameters.dry,
      width: parameters.width,
      mode: parameters.mode,
    });
  }
}

import {
  AUDIO_FREEVERB_WORKLET_PROCESSOR_NAME,
  buildAudioFreeverbWorkletSource,
} from './audio_freeverb_worklet_source.js';

/** Contexts that have already loaded the Freeverb worklet module. */
const registeredContexts = new WeakSet<BaseAudioContext>();

/** In-flight registration promises keyed by context. */
const registrationPromises = new WeakMap<BaseAudioContext, Promise<void>>();

/**
 * Ensures the Freeverb AudioWorklet processor is registered on the context.
 *
 * @param context Audio context that will own Freeverb worklet nodes.
 * @returns Promise that resolves when the processor is ready to construct.
 */
export function ensureAudioFreeverbWorkletRegistered(context: BaseAudioContext): Promise<void> {
  if (registeredContexts.has(context)) {
    return Promise.resolve();
  }
  const existing = registrationPromises.get(context);
  if (existing) {
    return existing;
  }
  const pending = registerAudioFreeverbWorklet(context);
  registrationPromises.set(context, pending);
  return pending;
}

/**
 * Returns the Freeverb worklet processor name.
 *
 * @returns Processor name passed to AudioWorkletNode.
 */
export function getAudioFreeverbWorkletProcessorName(): string {
  return AUDIO_FREEVERB_WORKLET_PROCESSOR_NAME;
}

/**
 * Loads the Freeverb worklet module from a blob URL.
 *
 * @param context Target audio context.
 * @returns Promise that settles when addModule finishes.
 */
async function registerAudioFreeverbWorklet(context: BaseAudioContext): Promise<void> {
  if (!context.audioWorklet || typeof context.audioWorklet.addModule !== 'function') {
    throw new Error('AudioWorklet is not available on this audio context');
  }
  const source = buildAudioFreeverbWorkletSource();
  const blob = new Blob([source], { type: 'application/javascript' });
  const moduleUrl = URL.createObjectURL(blob);
  try {
    await context.audioWorklet.addModule(moduleUrl);
    registeredContexts.add(context);
  } finally {
    URL.revokeObjectURL(moduleUrl);
    registrationPromises.delete(context);
  }
}

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
} from './audio_freeverb_tuning.js';

/** Registered AudioWorklet processor name for Freeverb. */
export const AUDIO_FREEVERB_WORKLET_PROCESSOR_NAME = 'audio-freeverb-processor';

/**
 * Builds the Freeverb AudioWorklet module source (same math as
 * AudioFreeverbModel).
 *
 * @returns JavaScript source for audioWorklet.addModule.
 */
export function buildAudioFreeverbWorkletSource(): string {
  return `"use strict";
const TUNING_SR = ${FREEVERB_TUNING_SAMPLE_RATE};
const NUM_COMBS = ${FREEVERB_NUM_COMBS};
const NUM_ALLPASSES = ${FREEVERB_NUM_ALLPASSES};
const MUTED = ${FREEVERB_MUTED};
const FIXED_GAIN = ${FREEVERB_FIXED_GAIN};
const SCALE_WET = ${FREEVERB_SCALE_WET};
const SCALE_DRY = ${FREEVERB_SCALE_DRY};
const SCALE_DAMP = ${FREEVERB_SCALE_DAMP};
const SCALE_ROOM = ${FREEVERB_SCALE_ROOM};
const OFFSET_ROOM = ${FREEVERB_OFFSET_ROOM};
const INITIAL_ROOM = ${FREEVERB_INITIAL_ROOM};
const INITIAL_DAMP = ${FREEVERB_INITIAL_DAMP};
const INITIAL_WET = ${FREEVERB_INITIAL_WET};
const INITIAL_DRY = ${FREEVERB_INITIAL_DRY};
const INITIAL_WIDTH = ${FREEVERB_INITIAL_WIDTH};
const INITIAL_MODE = ${FREEVERB_INITIAL_MODE};
const FREEZE_MODE = ${FREEVERB_FREEZE_MODE};
const ALLPASS_FEEDBACK = ${FREEVERB_ALLPASS_FEEDBACK};
const COMB_L = ${JSON.stringify([...FREEVERB_COMB_TUNING_L])};
const COMB_R = ${JSON.stringify([...FREEVERB_COMB_TUNING_R])};
const ALLPASS_L = ${JSON.stringify([...FREEVERB_ALLPASS_TUNING_L])};
const ALLPASS_R = ${JSON.stringify([...FREEVERB_ALLPASS_TUNING_R])};

function scaleSamples(samplesAt44100, sampleRate) {
  if (sampleRate <= 0) return Math.max(1, samplesAt44100 | 0);
  const scaled = Math.round((samplesAt44100 * sampleRate) / TUNING_SR);
  return scaled < 1 ? 1 : scaled;
}

function scaleTable(table, sampleRate) {
  const out = new Array(table.length);
  for (let i = 0; i < table.length; i++) out[i] = scaleSamples(table[i], sampleRate);
  return out;
}

const DENORM_F32 = new Float32Array(1);
const DENORM_U32 = new Uint32Array(DENORM_F32.buffer);
function undenormalise(sample) {
  DENORM_F32[0] = sample;
  if ((DENORM_U32[0] & 0x7f800000) === 0) return 0;
  return sample;
}

function createComb() {
  return {
    feedback: 0,
    filterstore: 0,
    damp1: 0,
    damp2: 1,
    buffer: new Float32Array(0),
    bufsize: 0,
    bufidx: 0,
    setBuffer(buffer, size) {
      this.buffer = buffer;
      this.bufsize = size;
    },
    mute() {
      this.buffer.fill(0);
    },
    setDamp(value) {
      this.damp1 = value;
      this.damp2 = 1 - value;
    },
    setFeedback(value) {
      this.feedback = value;
    },
    process(input) {
      let output = this.buffer[this.bufidx];
      output = undenormalise(output);
      this.filterstore = undenormalise(output * this.damp2 + this.filterstore * this.damp1);
      this.buffer[this.bufidx] = input + this.filterstore * this.feedback;
      this.bufidx += 1;
      if (this.bufidx >= this.bufsize) this.bufidx = 0;
      return output;
    },
  };
}

function createAllpass() {
  return {
    feedback: 0,
    buffer: new Float32Array(0),
    bufsize: 0,
    bufidx: 0,
    setBuffer(buffer, size) {
      this.buffer = buffer;
      this.bufsize = size;
    },
    mute() {
      this.buffer.fill(0);
    },
    setFeedback(value) {
      this.feedback = value;
    },
    process(input) {
      let bufout = this.buffer[this.bufidx];
      bufout = undenormalise(bufout);
      const output = -input + bufout;
      this.buffer[this.bufidx] = input + bufout * this.feedback;
      this.bufidx += 1;
      if (this.bufidx >= this.bufsize) this.bufidx = 0;
      return output;
    },
  };
}

function createModel(sampleRate) {
  const combTuningL = scaleTable(COMB_L, sampleRate);
  const combTuningR = scaleTable(COMB_R, sampleRate);
  const allpassTuningL = scaleTable(ALLPASS_L, sampleRate);
  const allpassTuningR = scaleTable(ALLPASS_R, sampleRate);
  const combL = [];
  const combR = [];
  const allpassL = [];
  const allpassR = [];
  for (let i = 0; i < NUM_COMBS; i++) {
    combL.push(createComb());
    combR.push(createComb());
  }
  for (let i = 0; i < NUM_ALLPASSES; i++) {
    allpassL.push(createAllpass());
    allpassR.push(createAllpass());
  }
  const model = {
    gain: FIXED_GAIN,
    roomsize: 0,
    roomsize1: 0,
    damp: 0,
    damp1: 0,
    wet: 0,
    wet1: 0,
    wet2: 0,
    dry: 0,
    width: 0,
    mode: 0,
    combL,
    combR,
    allpassL,
    allpassR,
    update() {
      this.wet1 = this.wet * (this.width / 2 + 0.5);
      this.wet2 = this.wet * ((1 - this.width) / 2);
      if (this.mode >= FREEZE_MODE) {
        this.roomsize1 = 1;
        this.damp1 = 0;
        this.gain = MUTED;
      } else {
        this.roomsize1 = this.roomsize;
        this.damp1 = this.damp;
        this.gain = FIXED_GAIN;
      }
      for (let i = 0; i < NUM_COMBS; i++) {
        this.combL[i].setFeedback(this.roomsize1);
        this.combR[i].setFeedback(this.roomsize1);
        this.combL[i].setDamp(this.damp1);
        this.combR[i].setDamp(this.damp1);
      }
    },
    setRoomSize(value) {
      this.roomsize = value * SCALE_ROOM + OFFSET_ROOM;
      this.update();
    },
    setDamp(value) {
      this.damp = value * SCALE_DAMP;
      this.update();
    },
    setWet(value) {
      this.wet = value * SCALE_WET;
      this.update();
    },
    setDry(value) {
      this.dry = value * SCALE_DRY;
    },
    setWidth(value) {
      this.width = value;
      this.update();
    },
    setMode(value) {
      this.mode = value;
      this.update();
    },
    getMode() {
      return this.mode >= FREEZE_MODE ? 1 : 0;
    },
    mute() {
      if (this.getMode() >= FREEZE_MODE) return;
      for (let i = 0; i < NUM_COMBS; i++) {
        this.combL[i].mute();
        this.combR[i].mute();
      }
      for (let i = 0; i < NUM_ALLPASSES; i++) {
        this.allpassL[i].mute();
        this.allpassR[i].mute();
      }
    },
    processReplace(inputL, inputR, outputL, outputR, numsamples) {
      for (let n = 0; n < numsamples; n++) {
        const input = (inputL[n] + inputR[n]) * this.gain;
        let outL = 0;
        let outR = 0;
        for (let i = 0; i < NUM_COMBS; i++) {
          outL += this.combL[i].process(input);
          outR += this.combR[i].process(input);
        }
        for (let i = 0; i < NUM_ALLPASSES; i++) {
          outL = this.allpassL[i].process(outL);
          outR = this.allpassR[i].process(outR);
        }
        outputL[n] = outL * this.wet1 + outR * this.wet2 + inputL[n] * this.dry;
        outputR[n] = outR * this.wet1 + outL * this.wet2 + inputR[n] * this.dry;
      }
    },
  };
  for (let i = 0; i < NUM_COMBS; i++) {
    combL[i].setBuffer(new Float32Array(combTuningL[i]), combTuningL[i]);
    combR[i].setBuffer(new Float32Array(combTuningR[i]), combTuningR[i]);
  }
  for (let i = 0; i < NUM_ALLPASSES; i++) {
    allpassL[i].setBuffer(new Float32Array(allpassTuningL[i]), allpassTuningL[i]);
    allpassR[i].setBuffer(new Float32Array(allpassTuningR[i]), allpassTuningR[i]);
    allpassL[i].setFeedback(ALLPASS_FEEDBACK);
    allpassR[i].setFeedback(ALLPASS_FEEDBACK);
  }
  model.setWet(INITIAL_WET);
  model.setRoomSize(INITIAL_ROOM);
  model.setDry(INITIAL_DRY);
  model.setDamp(INITIAL_DAMP);
  model.setWidth(INITIAL_WIDTH);
  model.setMode(INITIAL_MODE);
  model.mute();
  return model;
}

class AudioFreeverbWorkletProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.model = createModel(sampleRate);
    this.silence = new Float32Array(128);
    this.port.onmessage = (event) => {
      const data = event.data || {};
      if (data.mute === true) {
        this.model.mute();
        return;
      }
      if (typeof data.roomSize === "number") this.model.setRoomSize(data.roomSize);
      if (typeof data.damp === "number") this.model.setDamp(data.damp);
      if (typeof data.wet === "number") this.model.setWet(data.wet);
      if (typeof data.dry === "number") this.model.setDry(data.dry);
      if (typeof data.width === "number") this.model.setWidth(data.width);
      if (typeof data.mode === "number") this.model.setMode(data.mode);
    };
  }

  ensureSilence(frames) {
    if (this.silence.length >= frames) return this.silence;
    this.silence = new Float32Array(frames);
    return this.silence;
  }

  resolveInputChannels(input, frames) {
    if (input && input[0] && input[0].length >= frames) {
      const inputL = input[0];
      const inputR = input[1] && input[1].length >= frames ? input[1] : input[0];
      return [inputL, inputR];
    }
    const silence = this.ensureSilence(frames);
    return [silence, silence];
  }

  process(inputs, outputs) {
    const output = outputs[0];
    if (!output || !output[0]) {
      return true;
    }
    const outputL = output[0];
    const outputR = output[1] || output[0];
    const frames = outputL.length;
    const channels = this.resolveInputChannels(inputs[0], frames);
    this.model.processReplace(channels[0], channels[1], outputL, outputR, frames);
    return true;
  }
}

registerProcessor("${AUDIO_FREEVERB_WORKLET_PROCESSOR_NAME}", AudioFreeverbWorkletProcessor);
`;
}

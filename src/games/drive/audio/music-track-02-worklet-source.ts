// Soundtrack 02: a new arrangement of the U.S. public-domain 1930 composition.
// No recording, modern arrangement, lyrics, or reference audio ships here.
import {
  SHADOWLINE_MELODY_EVENTS,
  SHADOWLINE_SCORE_KINDS,
  SHADOWLINE_SCORE_ROOTS,
} from "./music-track-02-score-data";

export const MUSIC_TRACK_02_WORKLET_SOURCE = String.raw`
class DrivingMusicTrack02Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samplesPerBeat = sampleRate * 60 / 114;
    this.scoreRoots = ${JSON.stringify(SHADOWLINE_SCORE_ROOTS)};
    this.scoreKinds = ${JSON.stringify(SHADOWLINE_SCORE_KINDS)};
    this.melodyEvents = ${JSON.stringify(SHADOWLINE_MELODY_EVENTS)};
    this.loopSamples = this.samplesPerBeat * 448;
    this.transport = 0;
    this.lastStep = -1;
    this.seed = 0x53484457;
    this.speed = 0;
    this.drift = 0;
    this.chaseTier = 0;
    this.running = false;
    this.paused = false;
    this.master = 0;
    this.duck = 1;
    this.kickEnv = 0;
    this.kickPhase = 0;
    this.snareEnv = 0;
    this.hatEnv = 0;
    this.synareEnv = 0;
    this.synarePhase = 0;
    this.bassEnv = 0;
    this.bassFrequency = 69.3;
    this.bassPhase = 0;
    this.bassFilter = 0;
    this.synthEnv = 0;
    this.synthAge = sampleRate;
    this.synthFilterL = 0;
    this.synthFilterR = 0;
    this.synthFilterBandL = 0;
    this.synthFilterBandR = 0;
    this.synthLfoPhase = 0;
    this.chorusBufferL = new Float32Array(2048);
    this.chorusBufferR = new Float32Array(2048);
    this.chorusIndex = 0;
    this.reverbBufferL = new Float32Array(32768);
    this.reverbBufferR = new Float32Array(32768);
    this.reverbIndex = 0;
    this.synthFrequencies = new Float64Array(5);
    this.synthPhaseA = new Float64Array(5);
    this.synthPhaseB = new Float64Array(5);
    this.leadPhase = 0;
    this.leadPhaseB = 0;
    this.leadFilter = 0;
    this.leadFrequency = 293.66;
    this.leadEnv = 0;
    this.guitarEnv = 0;
    this.guitarPhase = 0;
    this.guitarFrequency = 277.18;
    this.previousNoise = 0;
    this.kickSample = this.makeDrum('kick', 0.46);
    this.snareSample = this.makeDrum('snare', 0.32);
    this.hatSample = this.makeDrum('hat', 0.14);
    this.synareSample = this.makeDrum('synare', 0.38);
    this.kickPosition = -1;
    this.snarePosition = -1;
    this.hatPosition = -1;
    this.synarePosition = -1;
    this.drumVelocity = { kick: 1, snare: 1, hat: 1, synare: 1 };
    this.telemetryCountdown = 0;
    this.stemMix = { drums: 1, bass: 1, synth: 1, atmosphere: 1, guitar: 1 };
    this.port.onmessage = ({ data }) => {
      if (data.type === 'state') {
        this.speed = Math.max(0, Math.min(1, data.speed || 0));
        this.drift = Math.max(0, Math.min(1, data.drift || 0));
        this.chaseTier = Math.max(0, Math.min(3, data.chaseTier || 0));
        this.running = Boolean(data.running);
        this.paused = Boolean(data.paused);
      } else if (data.type === 'mix') this.stemMix = { ...this.stemMix, ...data.stems };
      else if (data.type === 'seek') {
        const bar = Math.max(0, Math.min(111, Math.floor(data.bar || 0)));
        this.transport = bar * this.samplesPerBeat * 4;
        this.lastStep = -1;
      } else if (data.type === 'collision') this.duck = 0.25;
      else if (data.type === 'cue') {
        this.synarePosition = 0;
        this.drumVelocity.synare = data.name === 'capture' ? 1.35 : 0.82;
      }
    };
  }

  random() {
    let value = this.seed | 0;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.seed = value >>> 0;
    return this.seed / 0x80000000 - 1;
  }

  midi(note) { return 440 * Math.pow(2, (note - 69) / 12); }

  polyBlep(phase, increment) {
    if (phase < increment) {
      const position = phase / increment;
      return position + position - position * position - 1;
    }
    if (phase > 1 - increment) {
      const position = (phase - 1) / increment;
      return position * position + position + position + 1;
    }
    return 0;
  }

  bandLimitedSaw(phase, increment) {
    return phase * 2 - 1 - this.polyBlep(phase, increment);
  }

  bandLimitedPulse(phase, increment, width) {
    const fallingPhase = (phase - width + 1) % 1;
    return (phase < width ? 1 : -1)
      + this.polyBlep(phase, increment) - this.polyBlep(fallingPhase, increment);
  }

  makeDrum(kind, duration) {
    const output = new Float32Array(Math.floor(sampleRate * duration));
    let seed = kind === 'kick' ? 101 : kind === 'snare' ? 211 : kind === 'hat' ? 307 : 401;
    let phase = 0;
    let previous = 0;
    for (let index = 0; index < output.length; index += 1) {
      const time = index / sampleRate;
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const noise = seed / 0x80000000 - 1;
      const bright = noise - previous * 0.93;
      previous = noise;
      if (kind === 'kick') {
        const frequency = 43 + 112 * Math.exp(-time * 24);
        phase += frequency / sampleRate;
        output[index] = Math.sin(phase * Math.PI * 2) * Math.exp(-time * 13) + bright * Math.exp(-time * 75) * 0.18;
      } else if (kind === 'snare') {
        phase += 194 / sampleRate;
        output[index] = (noise * 0.72 + Math.sin(phase * Math.PI * 2) * 0.28) * Math.exp(-time * 14);
      } else if (kind === 'hat') {
        output[index] = bright * Math.exp(-time * 38) * (0.78 + Math.sin(time * 9100) * 0.22);
      } else {
        const frequency = 128 + 390 * Math.exp(-time * 11);
        phase += frequency / sampleRate;
        output[index] = (Math.sin(phase * Math.PI * 2) * 0.86 + bright * 0.14) * Math.exp(-time * 10);
      }
    }
    return output;
  }

  harmonyAt(bar) {
    // Bar-for-bar harmonic map derived from the user-recorded public-domain piano performance.
    return { root: this.scoreRoots[bar], kind: this.scoreKinds[bar] };
  }

  intervalsFor(kind) {
    if (kind === 'major7') return [0, 7, 11, 16, 23];
    if (kind === 'major') return [0, 7, 12, 16, 19];
    if (kind === 'dominant') return [0, 7, 10, 16, 22];
    if (kind === 'minor7') return [0, 7, 10, 15, 22];
    if (kind === 'minor6') return [0, 9, 15, 19, 24];
    if (kind === 'diminished') return [0, 6, 9, 15, 18];
    return [0, 7, 12, 15, 19];
  }

  melodyAt(step) {
    return Object.prototype.hasOwnProperty.call(this.melodyEvents, step) ? this.melodyEvents[step] : null;
  }

  trigger(step) {
    const within = step % 8;
    const bar = Math.floor(step / 8) % 112;
    const phrase = Math.floor(bar / 8);
    const harmony = this.harmonyAt(bar);
    const root = harmony.root;
    const voicing = this.intervalsFor(harmony.kind);
    const velocity = 0.91 + Math.sin(step * 9.731 + 1.7) * 0.075;
    if (within === 0 || within === 4 || (phrase >= 2 && within === 7 && bar % 2 === 1)) {
      this.kickPosition = 0;
      this.drumVelocity.kick = (within === 0 ? 1 : 0.68) * velocity;
    }
    if (within === 2 || within === 6) {
      this.snarePosition = 0;
      this.drumVelocity.snare = (within === 6 ? 0.92 : 0.76) * velocity;
    }
    this.hatPosition = 0;
    this.drumVelocity.hat = (within % 2 ? 0.52 : 0.28) * velocity;
    if ((bar % 4 === 3 && within === 5) || (this.chaseTier > 0 && within === 7)) {
      this.synarePosition = 0;
      this.drumVelocity.synare = 0.55 + this.chaseTier * 0.12;
    }

    const bassTurns = [0, 7, 12, 9];
    if (within !== 1 && within !== 5) {
      const interval = within === 3 ? 12 : within === 6 ? 7 : within === 7 ? bassTurns[phrase % 4] : 0;
      this.bassFrequency = this.midi(root + interval);
      this.bassEnv = (within === 0 ? 1 : 0.68) * velocity;
    }

    // Chord stabs and a distinct two-note response, introduced after the opening eight bars.
    if (within === 0 || within === 3 || (bar >= 8 && (within === 5 || (phrase >= 3 && within === 7)))) {
      // Keep response stabs in the authored harmony; transposing the entire five-note
      // voicing made the upper pulse oscillators harsh and obscured the piano-derived line.
      for (let voice = 0; voice < 5; voice += 1) {
        this.synthFrequencies[voice] = this.midi(root + 24 + voicing[voice]);
      }
      this.synthEnv = within >= 5 ? 0.62 : 0.82;
      this.synthAge = 0;
    }
    if (bar >= 16 && bar < 104 && (within === 1 || within === 6)) {
      this.guitarFrequency = this.midi(root + (within === 1 ? 24 : 31));
      this.guitarEnv = 0.72 * velocity;
      this.guitarPhase = 0;
    }
    const leadNote = this.melodyAt(step);
    if (leadNote === -1) this.leadEnv = 0;
    else if (leadNote !== null) {
      this.leadFrequency = this.midi(leadNote);
      this.leadEnv = bar < 8 ? 0.28 : bar >= 72 && bar < 88 ? 0.48 : 0.7;
    }
  }

  process(_inputs, outputs) {
    const left = outputs[0][0];
    const right = outputs[0][1] || left;
    for (let index = 0; index < left.length; index += 1) {
      const step = Math.floor(this.transport / this.samplesPerBeat * 2) % 896;
      if (step !== this.lastStep) { this.lastStep = step; this.trigger(step); }
      const bar = Math.floor(step / 8) % 112;
      const noise = this.random();

      const kick = this.kickPosition >= 0
        ? (this.kickSample[this.kickPosition++] || 0) * this.drumVelocity.kick : 0;
      const snare = this.snarePosition >= 0
        ? (this.snareSample[this.snarePosition++] || 0) * this.drumVelocity.snare : 0;
      const hat = this.hatPosition >= 0
        ? (this.hatSample[this.hatPosition++] || 0) * this.drumVelocity.hat : 0;
      const synare = this.synarePosition >= 0
        ? (this.synareSample[this.synarePosition++] || 0) * this.drumVelocity.synare : 0;
      if (this.kickPosition >= this.kickSample.length) this.kickPosition = -1;
      if (this.snarePosition >= this.snareSample.length) this.snarePosition = -1;
      if (this.hatPosition >= this.hatSample.length) this.hatPosition = -1;
      if (this.synarePosition >= this.synareSample.length) this.synarePosition = -1;

      this.bassPhase = (this.bassPhase + this.bassFrequency / sampleRate) % 1;
      const bassRaw = Math.sin(this.bassPhase * Math.PI * 2) * 0.66 + (this.bassPhase * 2 - 1) * 0.34;
      this.bassFilter += (bassRaw - this.bassFilter) * 0.115;
      const bass = this.bassFilter * this.bassEnv;
      this.bassEnv *= 0.9998;

      // Thin dual-pulse Prophet voice: two detuned squares, a little saw, and slow pitch drift.
      let synthL = 0;
      let synthR = 0;
      this.synthLfoPhase = (this.synthLfoPhase + 0.31 / sampleRate) % 1;
      const lfo = Math.sin(this.synthLfoPhase * Math.PI * 2);
      const pitchMod = Math.pow(2, lfo * 1.35 / 1200);
      for (let voice = 0; voice < 5; voice += 1) {
        const frequency = (this.synthFrequencies[voice] || this.midi(61 + voice * 4)) * pitchMod;
        this.synthPhaseA[voice] = (this.synthPhaseA[voice] + frequency / sampleRate) % 1;
        this.synthPhaseB[voice] = (this.synthPhaseB[voice] + frequency * (0.9955 + voice * 0.0016) / sampleRate) % 1;
        const incrementA = Math.min(0.49, frequency / sampleRate);
        const incrementB = Math.min(0.49, frequency * (0.9955 + voice * 0.0016) / sampleRate);
        const saw = this.bandLimitedSaw(this.synthPhaseA[voice], incrementA);
        const pulseA = this.bandLimitedPulse(this.synthPhaseA[voice], incrementA, 0.205 + voice * 0.006);
        const pulseB = this.bandLimitedPulse(this.synthPhaseB[voice], incrementB, 0.315 - voice * 0.007);
        const voiceSample = (pulseA * 0.48 + pulseB * 0.36 + saw * 0.16) * 0.155;
        synthL += voiceSample * (voice % 2 ? 0.56 : 1);
        synthR += voiceSample * (voice % 2 ? 1 : 0.56);
      }
      // Resonant low-pass with a decaying filter envelope and a deliberately dark sustain.
      const cutoffHz = 720 + this.speed * 760 + this.chaseTier * 105 + this.synthEnv * 1180;
      const filterCoefficient = 2 * Math.sin(Math.PI * Math.min(0.22, cutoffHz / sampleRate));
      const damping = 0.58;
      this.synthFilterL += filterCoefficient * this.synthFilterBandL;
      this.synthFilterBandL += filterCoefficient * (synthL - this.synthFilterL - damping * this.synthFilterBandL);
      this.synthFilterR += filterCoefficient * this.synthFilterBandR;
      this.synthFilterBandR += filterCoefficient * (synthR - this.synthFilterR - damping * this.synthFilterBandR);
      this.synthEnv *= 0.99989;
      const decaySamples = sampleRate * 0.2;
      const releaseStart = sampleRate * 0.62;
      const synth = this.synthAge < decaySamples
        ? 0.22 + 0.78 * Math.exp(-this.synthAge / (sampleRate * 0.072))
        : this.synthAge < releaseStart ? 0.22
          : 0.22 * Math.exp(-(this.synthAge - releaseStart) / (sampleRate * 0.24));
      this.synthAge += 1;

      // Short modulated delay and cross-fed ambience stand in for chorus and plate reverb.
      const chorusMask = this.chorusBufferL.length - 1;
      const chorusDelayL = 690 + Math.floor((lfo + 1) * 82);
      const chorusDelayR = 790 + Math.floor((1 - lfo) * 96);
      const chorusWetL = this.chorusBufferR[(this.chorusIndex - chorusDelayL) & chorusMask];
      const chorusWetR = this.chorusBufferL[(this.chorusIndex - chorusDelayR) & chorusMask];
      const synthDryL = this.synthFilterL * synth;
      const synthDryR = this.synthFilterR * synth;
      this.chorusBufferL[this.chorusIndex] = synthDryL;
      this.chorusBufferR[this.chorusIndex] = synthDryR;
      this.chorusIndex = (this.chorusIndex + 1) & chorusMask;
      const chorusedL = synthDryL * 0.76 + chorusWetL * 0.24;
      const chorusedR = synthDryR * 0.76 + chorusWetR * 0.24;
      const reverbMask = this.reverbBufferL.length - 1;
      const reverbL = this.reverbBufferL[(this.reverbIndex - 10973) & reverbMask];
      const reverbR = this.reverbBufferR[(this.reverbIndex - 14731) & reverbMask];
      this.reverbBufferL[this.reverbIndex] = chorusedL + reverbR * 0.34;
      this.reverbBufferR[this.reverbIndex] = chorusedR + reverbL * 0.31;
      this.reverbIndex = (this.reverbIndex + 1) & reverbMask;
      const synthOutL = chorusedL + reverbL * 0.13;
      const synthOutR = chorusedR + reverbR * 0.13;

      this.leadPhase = (this.leadPhase + this.leadFrequency * pitchMod / sampleRate) % 1;
      this.leadPhaseB = (this.leadPhaseB + this.leadFrequency * pitchMod * 0.995 / sampleRate) % 1;
      const leadIncrementA = Math.min(0.49, this.leadFrequency * pitchMod / sampleRate);
      const leadIncrementB = Math.min(0.49, this.leadFrequency * pitchMod * 0.995 / sampleRate);
      const leadPulseA = this.bandLimitedPulse(this.leadPhase, leadIncrementA, 0.21);
      const leadPulseB = this.bandLimitedPulse(this.leadPhaseB, leadIncrementB, 0.31);
      const leadSaw = this.bandLimitedSaw(this.leadPhase, leadIncrementA);
      const leadRaw = leadPulseA * 0.47 + leadPulseB * 0.37 + leadSaw * 0.16;
      this.leadFilter += (leadRaw - this.leadFilter) * (0.075 + this.speed * 0.035);
      const lead = Math.tanh(this.leadFilter * 1.3) * this.leadEnv;
      this.leadEnv *= 0.999985;

      this.guitarPhase = (this.guitarPhase + this.guitarFrequency / sampleRate) % 1;
      const triangle = 1 - 4 * Math.abs(this.guitarPhase - 0.5);
      const guitar = (triangle * 0.7 + Math.sin(this.guitarPhase * Math.PI * 8) * 0.3) * this.guitarEnv;
      this.guitarEnv *= 0.99968;

      const intro = bar < 8;
      const contrast = bar >= 40 && bar < 56;
      const driving = bar >= 56 && bar < 72;
      const peak = bar >= 72 && bar < 88;
      const release = bar >= 88 && bar < 104;
      const outro = bar >= 104;
      const outroLevel = outro ? Math.max(0.12, (112 - bar) / 8) : 1;
      const sectionEnergy = intro ? 0.44 : contrast ? 0.62 : driving ? 1.04 : peak ? 1.24 : release ? 0.82 : outro ? outroLevel * 0.48 : 1;
      const drums = (kick * 0.8 + snare * 0.42 + hat * 0.135 + synare * 0.16)
        * sectionEnergy * this.stemMix.drums;
      const bassGain = (intro ? 0.105 : contrast ? 0.15 : peak ? 0.245 : release ? 0.18 : outro ? 0.11 * outroLevel : 0.205) * this.stemMix.bass;
      const synthGain = (intro ? 0.09 : contrast ? 0.11 : peak ? 0.27 : outro ? 0.1 * outroLevel : 0.21) * (1 - this.drift * 0.42) * this.stemMix.synth;
      const atmosphere = (Math.sin(this.transport / sampleRate * 55 * Math.PI * 2) * 0.026 + noise * 0.0025)
        * (intro || outro ? 1.3 : 1) * this.stemMix.atmosphere;
      const guitarGain = (peak ? 0.09 : release ? 0.045 : 0.062) * this.stemMix.guitar;
      const leadGain = (intro || outro ? 0.055 : peak ? 0.155 : contrast ? 0 : 0.125) * (1 - this.drift * 0.35) * this.stemMix.synth;
      const targetMaster = this.running ? (this.paused ? 0.12 : 1) : 0.16;
      this.master += (targetMaster - this.master) * 0.0009;
      this.duck += (1 - this.duck) * 0.00018;
      const center = drums * (0.24 + this.speed * 0.05) + bass * bassGain;
      const l = (center + synthOutL * synthGain + lead * leadGain * 0.86 + guitar * guitarGain * 0.64 + atmosphere) * this.master * this.duck;
      const r = (center + synthOutR * synthGain + lead * leadGain + guitar * guitarGain + atmosphere * 0.92) * this.master * this.duck;
      left[index] = Math.tanh(l * 3.5) * 0.88;
      right[index] = Math.tanh(r * 3.5) * 0.88;

      this.transport = (this.transport + 1) % this.loopSamples;
      this.telemetryCountdown -= 1;
      if (this.telemetryCountdown <= 0) {
        this.telemetryCountdown = sampleRate / 8;
        this.port.postMessage({ type: 'telemetry', bar: Math.floor(this.transport / this.samplesPerBeat / 4) % 112 });
      }
    }
    return true;
  }
}
registerProcessor('driving-music-02', DrivingMusicTrack02Processor);
`;

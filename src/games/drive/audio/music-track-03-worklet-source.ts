// Soundtrack 03: Bass Canyon, a procedural Web Audio composition.
// Compact note, harmony, and onset maps drive synthesis without media assets.
import {
  TRAP_BARS,
  TRAP_BASS_EVENTS,
  TRAP_BPM,
  TRAP_DRUM_EVENTS,
  TRAP_KINDS,
  TRAP_LEAD_EVENTS,
  TRAP_PLUCK_EVENTS,
  TRAP_ROOTS,
} from "./music-track-03-score-data";

export const MUSIC_TRACK_03_WORKLET_SOURCE = String.raw`
class DrivingMusicTrack03Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bpm = ${TRAP_BPM};
    this.bars = ${TRAP_BARS};
    this.samplesPerBeat = sampleRate * 60 / this.bpm;
    this.loopSamples = this.samplesPerBeat * this.bars * 4;
    this.drumEvents = ${JSON.stringify(TRAP_DRUM_EVENTS)};
    this.bassEvents = ${JSON.stringify(TRAP_BASS_EVENTS)};
    this.leadEvents = ${JSON.stringify(TRAP_LEAD_EVENTS)};
    this.pluckEvents = ${JSON.stringify(TRAP_PLUCK_EVENTS)};
    this.roots = ${JSON.stringify(TRAP_ROOTS)};
    this.kinds = ${JSON.stringify(TRAP_KINDS)};
    this.transport = 0;
    this.lastStep = -1;
    this.seed = 0x54524150;
    this.speed = 0;
    this.drift = 0;
    this.chaseTier = 0;
    this.running = false;
    this.paused = false;
    this.master = 0;
    this.duck = 1;
    this.kickPosition = -1;
    this.snarePosition = -1;
    this.hatPosition = -1;
    this.kickVelocity = 1;
    this.snareVelocity = 1;
    this.hatVelocity = 1;
    this.kickSample = this.makeDrum('kick', 0.72);
    this.snareSample = this.makeDrum('snare', 0.34);
    this.hatSample = this.makeDrum('hat', 0.13);
    this.bassPhase = 0;
    this.bassFrequency = 55;
    this.bassTarget = 55;
    this.bassEnv = 0;
    this.leadPhaseA = 0;
    this.leadPhaseB = 0;
    this.leadFrequency = 440;
    this.leadEnv = 0;
    this.leadFilter = 0;
    this.pluckPhase = 0;
    this.pluckModPhase = 0;
    this.pluckFrequency = 440;
    this.pluckEnv = 0;
    this.padPhases = new Float64Array(4);
    this.padFrequencies = new Float64Array(4);
    this.padFilterL = 0;
    this.padFilterR = 0;
    this.padEnv = 0;
    this.reverbL = new Float32Array(32768);
    this.reverbR = new Float32Array(32768);
    this.reverbIndex = 0;
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
        const bar = Math.max(0, Math.min(this.bars - 1, Math.floor(data.bar || 0)));
        this.transport = bar * this.samplesPerBeat * 4;
        this.lastStep = -1;
      } else if (data.type === 'collision') this.duck = 0.22;
      else if (data.type === 'cue') {
        this.snarePosition = 0;
        this.snareVelocity = data.name === 'capture' ? 1.3 : 0.86;
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

  makeDrum(kind, duration) {
    const output = new Float32Array(Math.floor(sampleRate * duration));
    let phase = 0;
    let seed = kind === 'kick' ? 317 : kind === 'snare' ? 521 : 733;
    let previous = 0;
    for (let index = 0; index < output.length; index += 1) {
      const time = index / sampleRate;
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const noise = seed / 0x80000000 - 1;
      const bright = noise - previous * 0.94;
      previous = noise;
      if (kind === 'kick') {
        const frequency = 43 + 122 * Math.exp(-time * 27);
        phase += frequency / sampleRate;
        output[index] = Math.tanh((Math.sin(phase * Math.PI * 2) * Math.exp(-time * 5.8) + bright * Math.exp(-time * 85) * 0.14) * 1.55);
      } else if (kind === 'snare') {
        phase += 178 / sampleRate;
        output[index] = (noise * 0.68 + bright * 0.2 + Math.sin(phase * Math.PI * 2) * 0.12) * Math.exp(-time * 13);
      } else output[index] = bright * Math.exp(-time * 42) * (0.78 + Math.sin(time * 12300) * 0.22);
    }
    return output;
  }

  hasEvent(events, step) { return Object.prototype.hasOwnProperty.call(events, step); }

  intervalsFor(kind) {
    if (kind === 'B') return [0, 3, 7, 12];
    if (kind === 'C') return [0, 4, 10, 16];
    if (kind === 'D') return [0, 3, 10, 15];
    if (kind === 'E') return [0, 3, 6, 9];
    return [0, 4, 7, 12];
  }

  trigger(step) {
    const within = step % 16;
    const bar = Math.floor(step / 16) % this.bars;
    const drumMask = this.drumEvents[step] || 0;
    const active = bar >= 17 && bar < 106;
    if (drumMask & 1) {
      this.kickPosition = 0;
      this.kickVelocity = 0.82 + Math.sin(step * 7.13) * 0.1;
    }
    if (drumMask & 2) {
      this.snarePosition = 0;
      this.snareVelocity = 0.7 + Math.sin(step * 5.31) * 0.08;
    }
    if ((drumMask & 4) || (active && within % 2 === 0) || (this.chaseTier > 1 && within % 3 === 0)) {
      this.hatPosition = 0;
      this.hatVelocity = drumMask & 4 ? 0.5 : 0.27;
    }
    if (this.hasEvent(this.bassEvents, step)) {
      this.bassTarget = this.midi(this.bassEvents[step]);
      this.bassEnv = 1;
    }
    if (this.hasEvent(this.leadEvents, step)) {
      this.leadFrequency = this.midi(this.leadEvents[step]);
      this.leadEnv = 0.85;
    }
    if (this.hasEvent(this.pluckEvents, step)) {
      this.pluckFrequency = this.midi(this.pluckEvents[step]);
      this.pluckEnv = 0.54;
    }
    if (within === 0) {
      const intervals = this.intervalsFor(this.kinds[bar]);
      for (let voice = 0; voice < 4; voice += 1) this.padFrequencies[voice] = this.midi(this.roots[bar] + 24 + intervals[voice]);
      this.padEnv = 0.72;
    }
  }

  process(_inputs, outputs) {
    const left = outputs[0][0];
    const right = outputs[0][1] || left;
    for (let index = 0; index < left.length; index += 1) {
      const step = Math.floor(this.transport / this.samplesPerBeat * 4) % (this.bars * 16);
      if (step !== this.lastStep) { this.lastStep = step; this.trigger(step); }
      const bar = Math.floor(step / 16) % this.bars;
      const kick = this.kickPosition >= 0 ? (this.kickSample[this.kickPosition++] || 0) * this.kickVelocity : 0;
      const snare = this.snarePosition >= 0 ? (this.snareSample[this.snarePosition++] || 0) * this.snareVelocity : 0;
      const hat = this.hatPosition >= 0 ? (this.hatSample[this.hatPosition++] || 0) * this.hatVelocity : 0;
      if (this.kickPosition >= this.kickSample.length) this.kickPosition = -1;
      if (this.snarePosition >= this.snareSample.length) this.snarePosition = -1;
      if (this.hatPosition >= this.hatSample.length) this.hatPosition = -1;

      this.bassFrequency += (this.bassTarget - this.bassFrequency) * 0.0015;
      this.bassPhase = (this.bassPhase + this.bassFrequency / sampleRate) % 1;
      const bassSine = Math.sin(this.bassPhase * Math.PI * 2);
      const bassTriangle = 1 - 4 * Math.abs(this.bassPhase - 0.5);
      const bass = Math.tanh((bassSine * 0.82 + bassTriangle * 0.18) * this.bassEnv * 1.65);
      this.bassEnv *= 0.999965;

      this.leadPhaseA = (this.leadPhaseA + this.leadFrequency / sampleRate) % 1;
      this.leadPhaseB = (this.leadPhaseB + this.leadFrequency * 1.006 / sampleRate) % 1;
      const leadIncrement = Math.min(0.49, this.leadFrequency / sampleRate);
      const leadSaw = this.leadPhaseA * 2 - 1 - this.polyBlep(this.leadPhaseA, leadIncrement);
      const leadSquare = (this.leadPhaseB < 0.48 ? 1 : -1) + this.polyBlep(this.leadPhaseB, leadIncrement)
        - this.polyBlep((this.leadPhaseB + 0.52) % 1, leadIncrement);
      const leadRaw = leadSaw * 0.46 + leadSquare * 0.54;
      this.leadFilter += (leadRaw - this.leadFilter) * (0.055 + this.speed * 0.05);
      const lead = this.leadFilter * this.leadEnv;
      this.leadEnv *= 0.99984;

      this.pluckPhase = (this.pluckPhase + this.pluckFrequency / sampleRate) % 1;
      this.pluckModPhase = (this.pluckModPhase + this.pluckFrequency * 2.01 / sampleRate) % 1;
      const pluck = Math.sin(this.pluckPhase * Math.PI * 2 + Math.sin(this.pluckModPhase * Math.PI * 2) * this.pluckEnv * 2.3) * this.pluckEnv;
      this.pluckEnv *= 0.9997;

      let padL = 0;
      let padR = 0;
      for (let voice = 0; voice < 4; voice += 1) {
        const frequency = this.padFrequencies[voice] || 110;
        this.padPhases[voice] = (this.padPhases[voice] + frequency * (0.998 + voice * 0.0014) / sampleRate) % 1;
        const wave = Math.sin(this.padPhases[voice] * Math.PI * 2) + Math.sin(this.padPhases[voice] * Math.PI * 4) * 0.18;
        padL += wave * (voice % 2 ? 0.45 : 0.72);
        padR += wave * (voice % 2 ? 0.72 : 0.45);
      }
      const padCutoff = 0.009 + this.speed * 0.012;
      this.padFilterL += (padL - this.padFilterL) * padCutoff;
      this.padFilterR += (padR - this.padFilterR) * padCutoff;
      this.padEnv += (0.2 - this.padEnv) * 0.00004;

      const intro = bar < 17;
      const entry = bar >= 17 && bar < 26;
      const breakOne = bar >= 54 && bar < 69;
      const peak = bar >= 78 && bar < 98;
      const outro = bar >= 98;
      const energy = intro ? 0.32 : entry ? 0.58 : breakOne ? 0.5 : peak ? 1.14 : outro ? Math.max(0.12, (108 - bar) / 10) : 0.92;
      const drums = (kick * 0.72 + snare * 0.28 + hat * 0.1) * energy * this.stemMix.drums;
      const bassGain = (intro ? 0.08 : breakOne ? 0.13 : peak ? 0.22 : 0.18) * this.stemMix.bass;
      const leadGain = (intro ? 0.06 : breakOne ? 0.08 : peak ? 0.135 : 0.11) * (1 - this.drift * 0.4) * this.stemMix.synth;
      const pluckGain = (intro ? 0.16 : peak ? 0.085 : 0.07) * this.stemMix.guitar;
      const padGain = (intro ? 0.2 : outro ? 0.23 : breakOne ? 0.055 : 0.032) * this.stemMix.synth;
      const noise = this.random() * 0.0018 * (intro || breakOne ? 1 : 0.45) * this.stemMix.atmosphere;
      const synthL = lead * leadGain * 0.72 + pluck * pluckGain + this.padFilterL * this.padEnv * padGain;
      const synthR = lead * leadGain + pluck * pluckGain * 0.62 + this.padFilterR * this.padEnv * padGain;
      const mask = this.reverbL.length - 1;
      const wetL = this.reverbL[(this.reverbIndex - 11939) & mask];
      const wetR = this.reverbR[(this.reverbIndex - 15803) & mask];
      this.reverbL[this.reverbIndex] = synthL + wetR * 0.29;
      this.reverbR[this.reverbIndex] = synthR + wetL * 0.27;
      this.reverbIndex = (this.reverbIndex + 1) & mask;
      const targetMaster = this.running ? (this.paused ? 0.12 : 1) : 0.16;
      this.master += (targetMaster - this.master) * 0.0009;
      this.duck += (1 - this.duck) * 0.00018;
      const center = drums + bass * bassGain;
      const outL = (center + synthL + wetL * 0.055 + noise) * this.master * this.duck;
      const outR = (center + synthR + wetR * 0.055 + noise * 0.83) * this.master * this.duck;
      left[index] = Math.tanh(outL * 3.15) * 0.78;
      right[index] = Math.tanh(outR * 3.15) * 0.78;

      this.transport = (this.transport + 1) % this.loopSamples;
      this.telemetryCountdown -= 1;
      if (this.telemetryCountdown <= 0) {
        this.telemetryCountdown = sampleRate / 8;
        this.port.postMessage({ type: 'telemetry', bar: Math.floor(this.transport / this.samplesPerBeat / 4) % this.bars });
      }
    }
    return true;
  }
}
registerProcessor('driving-music-03', DrivingMusicTrack03Processor);
`;

// Soundtrack 04: Midnight Vector, a procedural 100 BPM driving cue.
// The compact sequencer and all synthesis run inside the AudioWorklet; no media assets are used.
export const MUSIC_TRACK_04_WORKLET_SOURCE = String.raw`
class DrivingMusicTrack04Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bpm = 100;
    this.bars = 32;
    this.samplesPerBeat = sampleRate * 60 / this.bpm;
    this.loopSamples = this.samplesPerBeat * this.bars * 4;
    this.transport = 0;
    this.lastStep = -1;
    this.speed = 0;
    this.drift = 0;
    this.chaseTier = 0;
    this.running = false;
    this.paused = false;
    this.master = 0;
    this.duck = 1;
    this.seed = 0x4d564543;
    this.telemetryCountdown = 0;
    this.stemMix = { drums: 1, bass: 1, synth: 1, atmosphere: 1, guitar: 1 };

    this.kickSample = this.makeDrum('kick', 0.68);
    this.bodySample = this.makeDrum('body', 0.42);
    this.hatSample = this.makeDrum('hat', 0.12);
    this.kickPosition = -1;
    this.bodyPosition = -1;
    this.hatPosition = -1;
    this.kickVelocity = 1;
    this.bodyVelocity = 1;
    this.hatVelocity = 1;

    this.bassPhase = 0;
    this.bassFrequency = this.midi(26);
    this.bassTarget = this.bassFrequency;
    this.bassEnv = 0;
    this.bassAccent = 0;
    this.pulsePhase = 0;
    this.pulseFrequency = this.midi(62);
    this.pulseEnv = 0;
    this.pulseFilter = 0;
    this.padPhases = new Float64Array(4);
    this.padFrequencies = new Float64Array(4);
    this.padL = 0;
    this.padR = 0;
    this.padEnv = 0;
    this.airFilter = 0;
    this.delayL = new Float32Array(32768);
    this.delayR = new Float32Array(32768);
    this.delayIndex = 0;

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
      } else if (data.type === 'collision') this.duck = 0.2;
      else if (data.type === 'cue') {
        this.bodyPosition = 0;
        this.bodyVelocity = data.name === 'capture' ? 1.28 : 0.82;
      }
    };
  }

  midi(note) { return 440 * Math.pow(2, (note - 69) / 12); }

  random() {
    let value = this.seed | 0;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.seed = value >>> 0;
    return this.seed / 0x80000000 - 1;
  }

  polyBlep(phase, increment) {
    if (phase < increment) {
      const x = phase / increment;
      return x + x - x * x - 1;
    }
    if (phase > 1 - increment) {
      const x = (phase - 1) / increment;
      return x * x + x + x + 1;
    }
    return 0;
  }

  makeDrum(kind, duration) {
    const output = new Float32Array(Math.floor(sampleRate * duration));
    let phase = 0;
    let seed = kind === 'kick' ? 401 : kind === 'body' ? 607 : 809;
    let previous = 0;
    for (let index = 0; index < output.length; index += 1) {
      const time = index / sampleRate;
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const noise = seed / 0x80000000 - 1;
      const bright = noise - previous * 0.93;
      previous = noise;
      if (kind === 'kick') {
        const frequency = 47 + 108 * Math.exp(-time * 31);
        phase += frequency / sampleRate;
        output[index] = Math.tanh((Math.sin(phase * Math.PI * 2) * Math.exp(-time * 7.2) + bright * Math.exp(-time * 95) * 0.1) * 1.7);
      } else if (kind === 'body') {
        phase += 164 / sampleRate;
        const shell = Math.sin(phase * Math.PI * 2) * 0.38 + Math.sin(phase * Math.PI * 3.18) * 0.16;
        output[index] = (shell + noise * 0.54 + bright * 0.12) * Math.exp(-time * 11.5);
      } else output[index] = bright * Math.exp(-time * 48) * (0.82 + Math.sin(time * 10700) * 0.18);
    }
    return output;
  }

  trigger(step) {
    const bar = Math.floor(step / 16) % this.bars;
    const within = step % 16;
    const phraseBar = bar % 4;
    const drumsActive = bar >= 8 && bar < 30;
    const peak = bar >= 24 && bar < 30;

    // Main accents: 1a, 2, 4 and 4&, with alternating bass/kick space.
    const kickMaps = [0x5189, 0x118b, 0x51a1, 0x1989];
    const bodyMaps = [0x1019, 0x1111, 0x1091, 0x3011];
    const kickHit = drumsActive && ((kickMaps[phraseBar] >>> within) & 1);
    const bodyHit = drumsActive && ((bodyMaps[phraseBar] >>> within) & 1);
    if (kickHit) {
      this.kickPosition = 0;
      this.kickVelocity = (within === 3 || within === 12 ? 1 : 0.72) * (peak ? 1.08 : 1);
    }
    if (bodyHit) {
      this.bodyPosition = 0;
      this.bodyVelocity = within === 0 || within === 8 ? 0.9 : 0.52;
    }
    const hatDensity = bar < 16 ? 4 : peak || this.chaseTier > 1 ? 1 : 2;
    if (drumsActive && within % hatDensity === 0) {
      this.hatPosition = 0;
      this.hatVelocity = (within === 0 || within === 6 || within === 8 || within === 10) ? 0.5 : 0.24;
    }

    // D-minor contour: F1–D1–C1–D1 / F1–D1–G1–G1, rephrased across 16ths.
    const bassNotes = [29, 26, 24, 26, 29, 26, 31, 31];
    const bassSteps = [0, 2, 5, 7, 8, 10, 12, 14];
    const bassIndex = bassSteps.indexOf(within);
    if (bassIndex >= 0 && (bar >= 2 || within === 0)) {
      const variation = phraseBar === 3 && bassIndex === 7 ? -1 : 0;
      this.bassTarget = this.midi(bassNotes[bassIndex] + variation + (peak && bassIndex % 3 === 0 ? 12 : 0));
      this.bassEnv = bar < 8 ? 0.62 : 1;
      this.bassAccent = bassIndex === 0 || bassIndex === 3 ? 1 : 0.72;
    }

    // A narrow ostinato with a distinct contour from the reference melody.
    const pulsePattern = [62, -1, 65, 69, -1, 67, 65, -1, 74, -1, 69, 67, -1, 65, 62, -1];
    if (bar >= 16 && bar < 30 && pulsePattern[within] >= 0 && (within % 2 === 0 || peak)) {
      this.pulseFrequency = this.midi(pulsePattern[within] + (phraseBar === 2 ? 12 : 0));
      this.pulseEnv = 0.8;
    }

    if (within === 0) {
      const roots = [38, 38, 43, 36]; // D2 drone, G2 fifth, C2 cluster.
      const intervals = phraseBar === 2 ? [0, 7, 12, 17] : phraseBar === 3 ? [0, 2, 7, 14] : [0, 3, 7, 12];
      for (let voice = 0; voice < 4; voice += 1) this.padFrequencies[voice] = this.midi(roots[phraseBar] + 12 + intervals[voice]);
      this.padEnv = bar >= 16 || bar >= 30 ? 0.72 : 0.28;
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
      const body = this.bodyPosition >= 0 ? (this.bodySample[this.bodyPosition++] || 0) * this.bodyVelocity : 0;
      const hat = this.hatPosition >= 0 ? (this.hatSample[this.hatPosition++] || 0) * this.hatVelocity : 0;
      if (this.kickPosition >= this.kickSample.length) this.kickPosition = -1;
      if (this.bodyPosition >= this.bodySample.length) this.bodyPosition = -1;
      if (this.hatPosition >= this.hatSample.length) this.hatPosition = -1;

      const glide = this.bassTarget < this.bassFrequency ? 0.0011 : 0.0021;
      this.bassFrequency += (this.bassTarget - this.bassFrequency) * glide;
      this.bassPhase = (this.bassPhase + this.bassFrequency / sampleRate) % 1;
      const bassSine = Math.sin(this.bassPhase * Math.PI * 2);
      const bassTriangle = 1 - 4 * Math.abs(this.bassPhase - 0.5);
      const bass = Math.tanh((bassSine * 0.84 + bassTriangle * 0.16) * this.bassEnv * 1.55) * this.bassAccent;
      this.bassEnv *= 0.99994;

      this.pulsePhase = (this.pulsePhase + this.pulseFrequency / sampleRate) % 1;
      const pulseIncrement = Math.min(0.49, this.pulseFrequency / sampleRate);
      const pulseRaw = (this.pulsePhase < 0.29 ? 1 : -1) + this.polyBlep(this.pulsePhase, pulseIncrement)
        - this.polyBlep((this.pulsePhase + 0.71) % 1, pulseIncrement);
      this.pulseFilter += (pulseRaw - this.pulseFilter) * (0.035 + this.speed * 0.075);
      const pulse = this.pulseFilter * this.pulseEnv;
      this.pulseEnv *= 0.99956;

      let padRawL = 0;
      let padRawR = 0;
      for (let voice = 0; voice < 4; voice += 1) {
        const frequency = this.padFrequencies[voice] || 110;
        this.padPhases[voice] = (this.padPhases[voice] + frequency * (0.9986 + voice * 0.0009) / sampleRate) % 1;
        const wave = Math.sin(this.padPhases[voice] * Math.PI * 2) + Math.sin(this.padPhases[voice] * Math.PI * 4) * 0.13;
        padRawL += wave * (voice % 2 ? 0.42 : 0.7);
        padRawR += wave * (voice % 2 ? 0.7 : 0.42);
      }
      const padCutoff = 0.006 + this.speed * 0.012;
      this.padL += (padRawL - this.padL) * padCutoff;
      this.padR += (padRawR - this.padR) * padCutoff;
      this.padEnv += (0.2 - this.padEnv) * 0.000025;

      const intro = bar < 8;
      const beatEntry = bar >= 8 && bar < 16;
      const development = bar >= 16 && bar < 24;
      const peak = bar >= 24 && bar < 30;
      const outro = bar >= 30;
      const drums = (kick * 0.68 + body * 0.29 + hat * 0.085) * (beatEntry ? 0.74 : peak ? 1.04 : 0.9) * this.stemMix.drums;
      const bassGain = (intro ? 0.14 : peak ? 0.215 : 0.18) * this.stemMix.bass;
      const pulseGain = (development ? 0.105 : peak ? 0.14 : 0.025) * (1 - this.drift * 0.48) * this.stemMix.synth;
      const padGain = (intro ? 0.05 : development ? 0.055 : peak ? 0.072 : outro ? 0.13 : 0.025) * this.stemMix.synth;
      const air = this.random() * (intro || outro ? 0.0024 : 0.0011) * this.stemMix.atmosphere;
      this.airFilter += (air - this.airFilter) * 0.025;

      const synthL = pulse * pulseGain * 0.64 + this.padL * this.padEnv * padGain;
      const synthR = pulse * pulseGain + this.padR * this.padEnv * padGain;
      const mask = this.delayL.length - 1;
      const wetL = this.delayL[(this.delayIndex - 14461) & mask];
      const wetR = this.delayR[(this.delayIndex - 19183) & mask];
      this.delayL[this.delayIndex] = synthL + wetR * 0.25;
      this.delayR[this.delayIndex] = synthR + wetL * 0.23;
      this.delayIndex = (this.delayIndex + 1) & mask;

      const targetMaster = this.running ? (this.paused ? 0.12 : 1) : 0.16;
      this.master += (targetMaster - this.master) * 0.0009;
      this.duck += (1 - this.duck) * 0.00018;
      const center = drums + bass * bassGain;
      const outL = (center + synthL + wetL * 0.06 + this.airFilter) * this.master * this.duck;
      const outR = (center + synthR + wetR * 0.06 + this.airFilter * 0.76) * this.master * this.duck;
      left[index] = Math.tanh(outL * 3.05) * 0.77;
      right[index] = Math.tanh(outR * 3.05) * 0.77;

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
registerProcessor('driving-music-04', DrivingMusicTrack04Processor);
`;

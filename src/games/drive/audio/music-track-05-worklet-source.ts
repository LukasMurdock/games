// Soundtrack 05: Glass Circuit, a procedural 140 BPM melodic driving cue.
export const MUSIC_TRACK_05_WORKLET_SOURCE = String.raw`
class DrivingMusicTrack05Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bpm = 140;
    this.bars = 48;
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
    this.seed = 0x474c4153;
    this.telemetryCountdown = 0;
    this.stemMix = { drums: 1, bass: 1, synth: 1, atmosphere: 1, guitar: 1 };

    this.kickSample = this.makeDrum('kick', 0.48);
    this.snareSample = this.makeDrum('snare', 0.3);
    this.hatSample = this.makeDrum('hat', 0.09);
    this.kickPosition = -1;
    this.snarePosition = -1;
    this.hatPosition = -1;
    this.kickVelocity = 1;
    this.snareVelocity = 1;
    this.hatVelocity = 1;

    this.bassPhase = 0;
    this.bassFrequency = this.midi(34);
    this.bassTarget = this.bassFrequency;
    this.bassEnv = 0;
    this.leadPhase = 0;
    this.leadFrequency = this.midi(74);
    this.leadEnv = 0;
    this.leadFilter = 0;
    this.bellPhase = 0;
    this.bellModPhase = 0;
    this.bellFrequency = this.midi(70);
    this.bellEnv = 0;
    this.padPhases = new Float64Array(4);
    this.padFrequencies = new Float64Array(4);
    this.padL = 0;
    this.padR = 0;
    this.padEnv = 0;
    this.delayL = new Float32Array(32768);
    this.delayR = new Float32Array(32768);
    this.delayIndex = 0;
    this.airL = 0;
    this.airR = 0;

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
        this.snarePosition = 0;
        this.snareVelocity = data.name === 'capture' ? 1.25 : 0.78;
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
    let seed = kind === 'kick' ? 431 : kind === 'snare' ? 617 : 827;
    let previous = 0;
    for (let index = 0; index < output.length; index += 1) {
      const time = index / sampleRate;
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const noise = seed / 0x80000000 - 1;
      const bright = noise - previous * 0.95;
      previous = noise;
      if (kind === 'kick') {
        const frequency = 49 + 118 * Math.exp(-time * 34);
        phase += frequency / sampleRate;
        output[index] = Math.tanh((Math.sin(phase * Math.PI * 2) * Math.exp(-time * 8.7) + bright * Math.exp(-time * 110) * 0.09) * 1.8);
      } else if (kind === 'snare') {
        phase += 192 / sampleRate;
        const body = Math.sin(phase * Math.PI * 2) * 0.24 + Math.sin(phase * Math.PI * 3.7) * 0.1;
        output[index] = (noise * 0.58 + bright * 0.2 + body) * Math.exp(-time * 15);
      } else output[index] = bright * Math.exp(-time * 58) * (0.78 + Math.sin(time * 13100) * 0.22);
    }
    return output;
  }

  melodyFor(phraseBar, within) {
    // Four-bar G-minor/B-flat-major phrase derived from the analysis brief.
    const motif = [
      [0,74, 4,77, 6,75, 8,70, 12,72, 14,67],
      [0,70, 6,69, 8,67, 12,65, 14,69],
      [2,72, 6,75, 8,74, 10,70, 12,72, 14,69],
      [0,67, 4,70, 8,72, 12,69, 14,74],
    ][phraseBar];
    for (let index = 0; index < motif.length; index += 2) if (motif[index] === within) return motif[index + 1];
    return -1;
  }

  trigger(step) {
    const bar = Math.floor(step / 16) % this.bars;
    const within = step % 16;
    const phraseBar = bar % 4;
    const intro = bar < 8;
    const groove = bar >= 8 && bar < 24;
    const contrast = bar >= 24 && bar < 32;
    const peak = bar >= 32 && bar < 40;
    const release = bar >= 40 && bar < 46;
    const outro = bar >= 46;
    const drumsActive = bar >= 6 && !outro;

    const kickMaps = [0x1121, 0x5121, 0x10a1, 0x5129];
    const snareMap = 0x1010;
    if (drumsActive && ((kickMaps[phraseBar] >>> within) & 1)) {
      this.kickPosition = 0;
      this.kickVelocity = (within === 0 || within === 8 ? 0.94 : 0.67) * (peak ? 1.08 : 1);
    }
    if (drumsActive && ((snareMap >>> within) & 1)) {
      this.snarePosition = 0;
      this.snareVelocity = peak ? 0.93 : 0.78;
    }
    const hatRate = peak || this.chaseTier > 1 ? 1 : intro ? 4 : 2;
    if (drumsActive && within % hatRate === 0) {
      this.hatPosition = 0;
      this.hatVelocity = within % 4 === 0 ? 0.46 : 0.2 + (within % 3) * 0.035;
    }

    const roots = [34, 29, 31, 27]; // B-flat1, F1, G1, E-flat1.
    const bassOffsets = [0, 7, 12, 7, 0, 12, 7, 10];
    if (within % 2 === 0 && (bar >= 4 || within === 0)) {
      const slot = within / 2;
      let note = roots[phraseBar] + bassOffsets[slot];
      if (contrast && slot > 3) note = 31 + [0, 7, 3, 10][slot % 4];
      if (peak && slot === 6) note += 12;
      this.bassTarget = this.midi(note);
      this.bassEnv = intro ? 0.48 : 0.86;
    }

    let melody = this.melodyFor(phraseBar, within);
    const melodyActive = (bar >= 2 && bar < 16) || (bar >= 20 && bar < 30) || peak || release;
    if (melody >= 0 && melodyActive) {
      if (contrast) melody -= phraseBar % 2 ? 12 : 0;
      if (peak && phraseBar === 3) melody += 12;
      this.leadFrequency = this.midi(melody);
      this.leadEnv = intro ? 0.48 : 0.9;
      if (within === 0 || within === 8 || peak) {
        this.bellFrequency = this.midi(melody - (peak && within === 8 ? 0 : 12));
        this.bellEnv = peak ? 0.62 : 0.4;
      }
    }

    if (within === 0) {
      const chordIntervals = phraseBar === 0 ? [0,4,7,12] : phraseBar === 1 ? [0,4,7,14]
        : phraseBar === 2 ? [0,3,7,10] : [0,4,7,11];
      for (let voice = 0; voice < 4; voice += 1) this.padFrequencies[voice] = this.midi(roots[phraseBar] + 24 + chordIntervals[voice]);
      this.padEnv = contrast || release || outro ? 0.76 : 0.42;
    }
  }

  process(_inputs, outputs) {
    const left = outputs[0][0];
    const right = outputs[0][1] || left;
    for (let index = 0; index < left.length; index += 1) {
      const step = Math.floor(this.transport / this.samplesPerBeat * 4) % (this.bars * 16);
      if (step !== this.lastStep) { this.lastStep = step; this.trigger(step); }
      const bar = Math.floor(step / 16) % this.bars;
      const intro = bar < 8;
      const contrast = bar >= 24 && bar < 32;
      const peak = bar >= 32 && bar < 40;
      const release = bar >= 40 && bar < 46;
      const outro = bar >= 46;

      const kick = this.kickPosition >= 0 ? (this.kickSample[this.kickPosition++] || 0) * this.kickVelocity : 0;
      const snare = this.snarePosition >= 0 ? (this.snareSample[this.snarePosition++] || 0) * this.snareVelocity : 0;
      const hat = this.hatPosition >= 0 ? (this.hatSample[this.hatPosition++] || 0) * this.hatVelocity : 0;
      if (this.kickPosition >= this.kickSample.length) this.kickPosition = -1;
      if (this.snarePosition >= this.snareSample.length) this.snarePosition = -1;
      if (this.hatPosition >= this.hatSample.length) this.hatPosition = -1;

      this.bassFrequency += (this.bassTarget - this.bassFrequency) * 0.0028;
      this.bassPhase = (this.bassPhase + this.bassFrequency / sampleRate) % 1;
      const bassSine = Math.sin(this.bassPhase * Math.PI * 2);
      const bassTriangle = 1 - 4 * Math.abs(this.bassPhase - 0.5);
      const bass = Math.tanh((bassSine * 0.76 + bassTriangle * 0.24) * this.bassEnv * 1.45);
      this.bassEnv *= 0.99988;

      this.leadPhase = (this.leadPhase + this.leadFrequency / sampleRate) % 1;
      const leadIncrement = Math.min(0.49, this.leadFrequency / sampleRate);
      const leadPulse = (this.leadPhase < 0.38 ? 1 : -1) + this.polyBlep(this.leadPhase, leadIncrement)
        - this.polyBlep((this.leadPhase + 0.62) % 1, leadIncrement);
      this.leadFilter += (leadPulse - this.leadFilter) * (0.045 + this.speed * 0.095);
      const lead = this.leadFilter * this.leadEnv;
      this.leadEnv *= 0.9997;

      this.bellPhase = (this.bellPhase + this.bellFrequency / sampleRate) % 1;
      this.bellModPhase = (this.bellModPhase + this.bellFrequency * 2.007 / sampleRate) % 1;
      const bell = Math.sin(this.bellPhase * Math.PI * 2 + Math.sin(this.bellModPhase * Math.PI * 2) * this.bellEnv * 2.2) * this.bellEnv;
      this.bellEnv *= 0.99945;

      let rawL = 0;
      let rawR = 0;
      for (let voice = 0; voice < 4; voice += 1) {
        const frequency = this.padFrequencies[voice] || 110;
        this.padPhases[voice] = (this.padPhases[voice] + frequency * (0.9983 + voice * 0.0011) / sampleRate) % 1;
        const wave = Math.sin(this.padPhases[voice] * Math.PI * 2) + Math.sin(this.padPhases[voice] * Math.PI * 4) * 0.12;
        rawL += wave * (voice % 2 ? 0.4 : 0.68);
        rawR += wave * (voice % 2 ? 0.68 : 0.4);
      }
      const padCutoff = 0.006 + this.speed * 0.013;
      this.padL += (rawL - this.padL) * padCutoff;
      this.padR += (rawR - this.padR) * padCutoff;
      this.padEnv += (0.18 - this.padEnv) * 0.00003;

      const sectionEnergy = intro ? 0.42 : contrast ? 0.66 : peak ? 1.08 : release ? 0.7 : outro ? 0.24 : 0.88;
      const drums = (kick * 0.66 + snare * 0.27 + hat * 0.075) * sectionEnergy * this.stemMix.drums;
      const bassGain = (intro ? 0.105 : contrast ? 0.14 : peak ? 0.19 : outro ? 0.08 : 0.165) * this.stemMix.bass;
      const leadGain = (intro ? 0.07 : contrast ? 0.08 : peak ? 0.135 : 0.11) * (1 - this.drift * 0.48) * this.stemMix.synth;
      const bellGain = (intro ? 0.11 : peak ? 0.12 : 0.075) * this.stemMix.guitar;
      const padGain = (intro ? 0.045 : contrast ? 0.09 : release ? 0.085 : outro ? 0.13 : 0.035) * this.stemMix.synth;
      const noise = this.random() * (intro || outro ? 0.0022 : 0.001) * this.stemMix.atmosphere;
      this.airL += (noise - this.airL) * 0.018;
      this.airR += (-noise * 0.84 - this.airR) * 0.015;

      const synthL = lead * leadGain * 0.68 + bell * bellGain + this.padL * this.padEnv * padGain;
      const synthR = lead * leadGain + bell * bellGain * 0.62 + this.padR * this.padEnv * padGain;
      const mask = this.delayL.length - 1;
      const wetL = this.delayL[(this.delayIndex - 10103) & mask];
      const wetR = this.delayR[(this.delayIndex - 14731) & mask];
      this.delayL[this.delayIndex] = synthL + wetR * 0.27;
      this.delayR[this.delayIndex] = synthR + wetL * 0.24;
      this.delayIndex = (this.delayIndex + 1) & mask;

      const targetMaster = this.running ? (this.paused ? 0.12 : 1) : 0.16;
      this.master += (targetMaster - this.master) * 0.001;
      this.duck += (1 - this.duck) * 0.0002;
      const center = drums + bass * bassGain;
      const outL = (center + synthL + wetL * 0.055 + this.airL) * this.master * this.duck;
      const outR = (center + synthR + wetR * 0.055 + this.airR) * this.master * this.duck;
      left[index] = Math.tanh(outL * 3.1) * 0.76;
      right[index] = Math.tanh(outR * 3.1) * 0.76;

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
registerProcessor('driving-music-05', DrivingMusicTrack05Processor);
`;

// Kept as source so the soundtrack stays compact and starts without downloading media assets.
export const MUSIC_WORKLET_SOURCE = String.raw`
class DrivingMusicProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samplesPerBeat = sampleRate * 60 / 114;
    this.loopSamples = this.samplesPerBeat * 448;
    this.transport = 0;
    this.lastStep = -1;
    this.speed = 0;
    this.drift = 0;
    this.chaseTier = 0;
    this.paused = false;
    this.running = false;
    this.duck = 1;
    this.seed = 0x44524956;
    this.kickEnv = 0;
    this.kickPhase = 0;
    this.snareEnv = 0;
    this.hatEnv = 0;
    this.bassEnv = 0;
    this.bassPhase = 0;
    this.bassFrequency = 82.41;
    this.synthEnv = 0;
    this.synthPhases = new Float64Array(5);
    this.synthPhasesB = new Float64Array(5);
    this.synthFrequencies = new Float64Array(5);
    this.atmosPhases = new Float64Array(3);
    this.guitarPhase = 0;
    this.guitarFrequency = 164.81;
    this.guitarEnv = 0;
    this.driftSwell = 0;
    this.reinforcementCue = 0;
    this.captureCue = 0;
    this.resetCue = 0;
    this.cuePhase = 0;
    this.bassFilter = 0;
    this.synthFilterL = 0;
    this.synthFilterR = 0;
    this.noisePrevious = 0;
    this.master = 0;
    this.stemMix = { drums: 1, bass: 1, synth: 1, atmosphere: 1, guitar: 1 };
    this.telemetryCountdown = 0;
    this.sectionDrums = 0.08;
    this.sectionBass = 0.18;
    this.sectionSynth = 0.3;
    this.port.onmessage = ({ data }) => {
      if (data.type === 'state') {
        const nextDrift = Math.max(0, Math.min(1, data.drift || 0));
        const nextTier = Math.max(0, Math.min(3, data.chaseTier || 0));
        if (this.drift < 0.28 && nextDrift >= 0.48) this.driftSwell = 1;
        if (nextTier > this.chaseTier && this.chaseTier > 0) this.reinforcementCue = 1;
        this.speed = Math.max(0, Math.min(1, data.speed || 0));
        this.drift = nextDrift;
        this.chaseTier = nextTier;
        this.paused = Boolean(data.paused);
        this.running = Boolean(data.running);
      } else if (data.type === 'collision') {
        this.duck = Math.min(this.duck, 0.28);
      } else if (data.type === 'cue') {
        if (data.name === 'capture') this.captureCue = 1;
        else this.resetCue = 1;
        this.cuePhase = 0;
      } else if (data.type === 'mix') {
        this.stemMix = { ...this.stemMix, ...data.stems };
      } else if (data.type === 'seek') {
        const bar = Math.max(0, Math.min(111, Math.floor(data.bar || 0)));
        this.transport = bar * this.samplesPerBeat * 4;
        this.lastStep = -1;
      } else if (data.type === 'reset') {
        this.transport = 0;
        this.lastStep = -1;
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

  midi(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
  }

  triggerStep(step) {
    const withinBar = step % 8;
    const bar = Math.floor(step / 8) % 112;
    const chordIndex = bar % 8;
    const phrase = Math.floor(bar / 8);
    const roots = [40, 37, 35, 38, 36, 42, 33, 35];
    const chords = [
      [0, 7, 14, 19, 23], [0, 7, 9, 16, 21], [0, 7, 11, 16, 19], [0, 7, 9, 16, 21],
      [0, 6, 11, 18, 23], [0, 5, 10, 17, 22], [0, 9, 16, 21, 24], [0, 5, 10, 15, 22],
    ];

    const humanVelocity = 0.9 + Math.sin(step * 12.9898 + 4.37) * 0.08;
    if (
      withinBar === 0
      || (withinBar === 4 && !(phrase % 4 === 2 && chordIndex === 3))
      || (bar >= 56 && bar < 88 && withinBar === 7 && bar % 4 === 3)
    ) {
      this.kickEnv = (withinBar === 0 ? 1 : 0.72) * humanVelocity;
      this.kickPhase = 0;
    }
    if (withinBar === 2 || withinBar === 6) this.snareEnv = (withinBar === 6 ? 0.82 : 0.68) * humanVelocity;
    this.hatEnv = (withinBar % 2 === 0 ? 0.24 : 0.38) * (0.88 + Math.sin(step * 7.13) * 0.1);

    const phraseTurn = [0, 2, 5, 7][phrase % 4];
    const bassPattern = [0, 0, 12, 7, 0, phrase % 3 === 1 ? 7 : 12, 7, chordIndex === 7 ? 2 : phraseTurn];
    if (withinBar !== 1 && withinBar !== 5) {
      this.bassFrequency = this.midi(roots[chordIndex] + bassPattern[withinBar]);
      this.bassEnv = withinBar === 0 ? 1 : 0.62;
    }

    const motifStep = bar >= 16 && bar < 104 && (withinBar === 1 || withinBar === 4 || (bar >= 72 && withinBar === 6));
    if (withinBar === 0 || withinBar === 3 || motifStep) {
      const motifLift = motifStep
        ? (withinBar === 4 ? (phrase % 3 === 2 ? 5 : 12) : phrase % 2 === 0 ? 7 : 9)
        : 0;
      const chord = chords[chordIndex];
      for (let voice = 0; voice < 5; voice += 1) {
        this.synthFrequencies[voice] = this.midi(roots[chordIndex] + 12 + chord[voice] + motifLift);
      }
      this.synthEnv = motifStep ? 0.72 : 0.48;
    }

    // Restrained, muted guitar-like answers enter only after the core identity is established.
    if (bar >= 56 && bar < 104 && (withinBar === 2 || (bar >= 72 && withinBar === 5))) {
      const response = withinBar === 5 ? 19 : 12;
      this.guitarFrequency = this.midi(roots[chordIndex] + response);
      this.guitarEnv = 0.72 * humanVelocity;
      this.guitarPhase = 0;
    }
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    const left = output[0];
    const right = output[1] || left;
    const rootSequence = [40, 37, 35, 38, 36, 42, 33, 35];

    for (let index = 0; index < left.length; index += 1) {
      const step = Math.floor((this.transport / this.samplesPerBeat) * 2) % 896;
      if (step !== this.lastStep) {
        this.lastStep = step;
        this.triggerStep(step);
      }
      const bar = Math.floor(step / 8) % 112;
      const chordIndex = bar % 8;

      const noise = this.random();
      const highNoise = noise - this.noisePrevious * 0.88;
      this.noisePrevious = noise;

      this.kickPhase += (43 + this.kickEnv * 82) / sampleRate;
      const kick = Math.sin(this.kickPhase * Math.PI * 2) * this.kickEnv;
      this.kickEnv *= 0.99972;
      const snare = (noise * 0.82 + Math.sin(this.transport * 190 / sampleRate * Math.PI * 2) * 0.18) * this.snareEnv;
      this.snareEnv *= 0.99945;
      const hat = highNoise * this.hatEnv;
      this.hatEnv *= 0.9972;
      const electronicAccent = this.chaseTier > 0 && ((step % 16) === 5 || (step % 16) === 14)
        ? Math.sin((this.transport % (this.samplesPerBeat / 2)) / sampleRate * 620 * Math.PI * 2) * 0.12
        : 0;
      const drums = kick * 0.78 + snare * 0.36 + hat * 0.18 + electronicAccent * this.chaseTier;

      this.bassPhase = (this.bassPhase + this.bassFrequency / sampleRate) % 1;
      const bassRaw = (this.bassPhase * 2 - 1) * 0.42 + Math.sin(this.bassPhase * Math.PI * 2) * 0.58;
      this.bassFilter += (bassRaw - this.bassFilter) * 0.085;
      const bass = this.bassFilter * this.bassEnv;
      this.bassEnv *= 0.99982;

      let synthL = 0;
      let synthR = 0;
      for (let voice = 0; voice < 5; voice += 1) {
        const frequency = this.synthFrequencies[voice] || this.midi(52 + voice * 4);
        this.synthPhases[voice] = (this.synthPhases[voice] + frequency / sampleRate) % 1;
        this.synthPhasesB[voice] = (this.synthPhasesB[voice] + frequency * (1.003 + voice * 0.0004) / sampleRate) % 1;
        const saw = (this.synthPhases[voice] * 2 - 1) * 0.55;
        const pulse = this.synthPhasesB[voice] < (0.43 + voice * 0.018) ? 0.45 : -0.45;
        const voiceSample = (saw + pulse) * 0.2;
        synthL += voiceSample * (voice % 2 === 0 ? 1 : 0.62);
        synthR += voiceSample * (voice % 2 === 1 ? 1 : 0.62);
      }
      // Keep the poly synth dark but present; the previous filter range buried its
      // harmonic identity below the bass and left the long-form spectrum too empty.
      const synthCutoff = 0.07 + this.speed * 0.09 + this.chaseTier * 0.012;
      this.synthFilterL += (synthL - this.synthFilterL) * synthCutoff;
      this.synthFilterR += (synthR - this.synthFilterR) * synthCutoff;
      const synthEnvelope = this.synthEnv;
      this.synthEnv *= 0.9999;

      let atmosphere = 0;
      const atmosphereNotes = [rootSequence[chordIndex], rootSequence[chordIndex] + 7, rootSequence[chordIndex] + 14];
      for (let voice = 0; voice < 3; voice += 1) {
        const frequency = this.midi(atmosphereNotes[voice]);
        this.atmosPhases[voice] = (this.atmosPhases[voice] + frequency / sampleRate) % 1;
        atmosphere += Math.sin(this.atmosPhases[voice] * Math.PI * 2) * (0.52 - voice * 0.1);
      }
      atmosphere = atmosphere * 0.3 + noise * 0.018;

      this.guitarPhase = (this.guitarPhase + this.guitarFrequency / sampleRate) % 1;
      const guitarTriangle = 1 - 4 * Math.abs(this.guitarPhase - 0.5);
      const guitar = (guitarTriangle * 0.72 + Math.sin(this.guitarPhase * Math.PI * 6) * 0.28) * this.guitarEnv;
      this.guitarEnv *= 0.99972;

      this.cuePhase += (110 + this.reinforcementCue * 420 + this.captureCue * 90) / sampleRate;
      const driftCue = (Math.sin(this.cuePhase * Math.PI * 2) * 0.5 + highNoise * 0.25) * this.driftSwell;
      const reinforcement = Math.sin(this.cuePhase * Math.PI * 2) * this.reinforcementCue;
      const capture = Math.sin(this.cuePhase * Math.PI * 2) * this.captureCue;
      const reset = highNoise * this.resetCue;
      this.driftSwell *= 0.99998;
      this.reinforcementCue *= 0.99996;
      this.captureCue *= 0.99997;
      this.resetCue *= 0.99988;

      const intro = bar < 8;
      const contrast = bar >= 40 && bar < 56;
      const peak = bar >= 72 && bar < 88;
      const release = bar >= 88 && bar < 104;
      const outro = bar >= 104;
      const outroLevel = outro ? Math.max(0.08, (112 - bar) / 8) : 1;
      const targetSectionDrums = intro ? 0.08 : contrast ? 0.58 : peak ? 1.18 : release ? 0.72 : outro ? outroLevel * 0.42 : 1;
      const targetSectionBass = intro ? 0.18 : contrast ? 0.75 : peak ? 1.08 : outro ? outroLevel * 0.55 : 1;
      const targetSectionSynth = intro ? 0.3 : contrast ? 0.78 : peak ? 1.3 : outro ? 0.42 : 1;
      this.sectionDrums += (targetSectionDrums - this.sectionDrums) * 0.0005;
      this.sectionBass += (targetSectionBass - this.sectionBass) * 0.0005;
      this.sectionSynth += (targetSectionSynth - this.sectionSynth) * 0.0005;
      const drumGain = (0.22 + this.speed * 0.06 + this.chaseTier * 0.018) * this.sectionDrums * this.stemMix.drums;
      const bassGain = (0.19 + this.speed * 0.025) * this.sectionBass * this.stemMix.bass;
      const synthGain = (0.105 + this.speed * 0.025 + this.chaseTier * 0.012) * (1 - this.drift * 0.48) * this.sectionSynth * this.stemMix.synth;
      const atmosphereGain = (0.075 + this.drift * 0.035 + (intro || outro ? 0.035 : 0)) * this.stemMix.atmosphere;
      const guitarGain = (peak ? 0.085 : 0.052) * this.stemMix.guitar;
      const targetMaster = this.running ? (this.paused ? 0.12 : 1) : 0.16;
      this.master += (targetMaster - this.master) * 0.0009;
      this.duck += (1 - this.duck) * 0.00018;

      const cues = driftCue * 0.055 + reinforcement * 0.08 + capture * 0.13 + reset * 0.035;
      const center = drums * drumGain + bass * bassGain + cues;
      const l = (center + this.synthFilterL * synthEnvelope * synthGain + atmosphere * atmosphereGain + guitar * guitarGain * 0.7) * this.master * this.duck;
      const r = (center + this.synthFilterR * synthEnvelope * synthGain + atmosphere * atmosphereGain * 0.94 + guitar * guitarGain) * this.master * this.duck;
      // Drive the soft clipper enough to retain transient energy at gameplay level
      // while leaving several dB of headroom for the vehicle bus.
      left[index] = Math.tanh(l * 4) * 0.9;
      right[index] = Math.tanh(r * 4) * 0.9;
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
registerProcessor('driving-music-01', DrivingMusicProcessor);
`;

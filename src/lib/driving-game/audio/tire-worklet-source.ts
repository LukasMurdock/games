export const TIRE_WORKLET_SOURCE = String.raw`
const TIRE_PROFILES = {
  loaded: {
    frequencies: [830, 935, 1325, 1710],
    gains: [1, 0.42, 0.2, 0.24],
  },
  sustained: {
    frequencies: [960, 1000, 1325, 1550],
    gains: [1, 0.82, 0.36, 0.12],
  },
  distressed: {
    frequencies: [1065, 1185, 1360, 1560],
    gains: [1, 0.46, 0.3, 0.18],
  },
};

class DriftTireProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetSpeed = 0;
    this.targetSlip = 0;
    this.targetSteeringLoad = 0;
    this.targetSteerDirection = 0;
    this.onPavement = 1;
    this.phase = 'grip';
    this.speed = 0;
    this.slip = 0;
    this.steeringLoad = 0;
    this.steerDirection = 0;
    this.randomState = 0x71ac923d;
    this.slowWander = 0;
    this.fastWander = 0;
    this.slowPhase = 0;
    this.stickPhase = 0;
    this.chatterPhase = 0;
    this.scrubLow = 0;
    this.scrubHigh = 0;
    this.breakawayEnvelope = 0;
    this.correctionEnvelope = 0;
    this.hookupEnvelope = 0;
    this.transitionMute = 0;
    this.modes = Array.from({ length: 4 }, () => ({ y1: 0, y2: 0 }));

    this.port.onmessage = ({ data }) => {
      if (data.type === 'state') {
        this.targetSpeed = Math.max(0, Math.min(1, data.speed));
        this.targetSlip = Math.max(-60, Math.min(60, data.slip));
        this.targetSteeringLoad = Math.max(0, Math.min(1, data.steeringLoad));
        this.targetSteerDirection = Math.max(-1, Math.min(1, data.steerDirection));
        this.onPavement = data.onPavement ? 1 : 0;
        this.phase = data.phase;
      } else if (data.type === 'breakaway') {
        this.breakawayEnvelope = Math.max(this.breakawayEnvelope, data.strength || 0.7);
      } else if (data.type === 'transition') {
        this.transitionMute = 1;
        this.correctionEnvelope = Math.max(this.correctionEnvelope, 0.45);
      } else if (data.type === 'correction') {
        this.correctionEnvelope = Math.max(this.correctionEnvelope, data.strength || 0.4);
      } else if (data.type === 'hookup') {
        this.hookupEnvelope = 1;
      }
    };
  }

  random() {
    this.randomState = (1664525 * this.randomState + 1013904223) >>> 0;
    return this.randomState / 4294967296;
  }

  smoothstep(value, minimum, maximum) {
    const x = Math.max(0, Math.min(1, (value - minimum) / (maximum - minimum)));
    return x * x * (3 - 2 * x);
  }

  mix(a, b, amount) {
    return a + (b - a) * amount;
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    if (!output || !output[0]) return true;
    const left = output[0];
    const right = output[1] || left;
    const fastSmoothing = 1 - Math.exp(-1 / (sampleRate * 0.045));
    const loadSmoothing = 1 - Math.exp(-1 / (sampleRate * 0.08));

    for (let i = 0; i < left.length; i++) {
      this.speed += (this.targetSpeed - this.speed) * loadSmoothing;
      this.slip += (this.targetSlip - this.slip) * fastSmoothing;
      this.steeringLoad += (this.targetSteeringLoad - this.steeringLoad) * loadSmoothing;
      this.steerDirection += (this.targetSteerDirection - this.steerDirection) * loadSmoothing;

      const absoluteSlip = Math.abs(this.slip);
      const slipFactor = this.smoothstep(absoluteSlip, 5, 22);
      const contactLoad = Math.max(this.steeringLoad * 0.72, this.smoothstep(absoluteSlip, 8, 34));
      const rearEnergy = this.speed * slipFactor * (0.55 + contactLoad * 0.45) * (0.25 + this.onPavement * 0.75);
      const countersteering = Math.sign(this.steerDirection) === Math.sign(this.slip) && absoluteSlip > 10 ? 1 : 0;
      const frontEnergy = this.speed * this.steeringLoad * (0.22 + countersteering * 0.42);
      const distress = this.smoothstep(absoluteSlip, 36, 52);
      const sustainedBlend = this.smoothstep(absoluteSlip, 7, 25);

      const random = this.random() * 2 - 1;
      this.slowWander += (random - this.slowWander) * 0.0007;
      this.fastWander += (random - this.fastWander) * 0.012;
      this.slowPhase += Math.PI * 2 * (4.7 + contactLoad * 1.6) / sampleRate;
      this.stickPhase += Math.PI * 2 * (10.5 + contactLoad * 5.2) / sampleRate;
      this.chatterPhase += Math.PI * 2 * (24 + distress * 24) / sampleRate;
      if (this.slowPhase > Math.PI * 2) this.slowPhase -= Math.PI * 2;
      if (this.stickPhase > Math.PI * 2) this.stickPhase -= Math.PI * 2;
      if (this.chatterPhase > Math.PI * 2) this.chatterPhase -= Math.PI * 2;

      const slowContact = 0.91 + Math.sin(this.slowPhase) * 0.09;
      const stickSlip = 0.88 + Math.sin(this.stickPhase) * 0.12;
      const chatter = 1 - distress * (0.08 + (0.5 + Math.sin(this.chatterPhase) * 0.5) * 0.22);
      const microDropout = distress > 0.1 && this.fastWander < -0.72 ? 0.58 : 1;
      const modulation = slowContact * stickSlip * chatter * microDropout;

      this.breakawayEnvelope *= 0.99978;
      this.correctionEnvelope *= 0.99955;
      this.hookupEnvelope *= 0.99955;
      this.transitionMute *= 0.99965;
      const transitionGain = 1 - this.transitionMute * 0.88;
      const onsetEnergy = this.breakawayEnvelope * 0.32;

      let modalOutput = 0;
      for (let modeIndex = 0; modeIndex < this.modes.length; modeIndex++) {
        const loadedFrequency = TIRE_PROFILES.loaded.frequencies[modeIndex];
        const sustainedFrequency = TIRE_PROFILES.sustained.frequencies[modeIndex];
        const distressedFrequency = TIRE_PROFILES.distressed.frequencies[modeIndex];
        const loadedGain = TIRE_PROFILES.loaded.gains[modeIndex];
        const sustainedGain = TIRE_PROFILES.sustained.gains[modeIndex];
        const distressedGain = TIRE_PROFILES.distressed.gains[modeIndex];
        const cleanFrequency = this.mix(loadedFrequency, sustainedFrequency, sustainedBlend);
        const profileFrequency = this.mix(cleanFrequency, distressedFrequency, distress);
        const cleanGain = this.mix(loadedGain, sustainedGain, sustainedBlend);
        const profileGain = this.mix(cleanGain, distressedGain, distress);
        const speedInfluence = 0.96 + this.speed * 0.055;
        const wander = 1 + this.slowWander * 0.025 + this.fastWander * (0.006 + distress * 0.006);
        const frequency = profileFrequency * speedInfluence * wander;
        const quality = this.mix(34, 16, distress);
        const radius = Math.exp(-Math.PI * frequency / (quality * sampleRate));
        const excitation = (this.random() * 2 - 1) * (1 - radius) * profileGain;
        const mode = this.modes[modeIndex];
        const next = 2 * radius * Math.cos(Math.PI * 2 * frequency / sampleRate) * mode.y1
          - radius * radius * mode.y2
          + excitation;
        mode.y2 = mode.y1;
        mode.y1 = next;
        modalOutput += next * profileGain;
      }

      // Continually generated friction noise adds rubber body without becoming the primary sound.
      const scrubNoise = this.random() * 2 - 1;
      this.scrubLow += (scrubNoise - this.scrubLow) * 0.045;
      this.scrubHigh += (scrubNoise - this.scrubHigh) * 0.2;
      const rubberBand = this.scrubHigh - this.scrubLow;
      const rearScrub = rubberBand * (0.016 + distress * 0.045 + onsetEnergy * 0.08);
      const frontScrub = rubberBand * frontEnergy * 0.055;
      const correction = rubberBand * this.correctionEnvelope * 0.07;
      const tireBite = rubberBand * this.hookupEnvelope * 0.075;

      const cleanReduction = 1 - distress * 0.42;
      const rear = (
        modalOutput * (rearEnergy + onsetEnergy * 0.35) * modulation * transitionGain * cleanReduction * 0.18
        + rearScrub * rearEnergy
        + rubberBand * onsetEnergy * 0.08
        + correction
      );
      const front = frontScrub + tireBite;
      const pan = Math.max(-0.25, Math.min(0.25, this.slip / 45 * 0.25));
      const leftGain = Math.sqrt((1 - pan) * 0.5);
      const rightGain = Math.sqrt((1 + pan) * 0.5);
      const mixedLeft = rear * leftGain + front * 0.7;
      const mixedRight = rear * rightGain + front * 0.7;
      left[i] = Math.tanh(mixedLeft * 4.5) * 0.85;
      right[i] = Math.tanh(mixedRight * 4.5) * 0.85;
    }
    return true;
  }
}
registerProcessor('drift-tire-model', DriftTireProcessor);
`;

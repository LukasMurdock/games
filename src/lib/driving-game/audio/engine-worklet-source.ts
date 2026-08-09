// Generated from local reference analysis. The shipped data is 128 quantized order magnitudes,
// not source audio. Each index represents a 0.5x crank-speed engine order.
export const ENGINE_WORKLET_SOURCE = String.raw`
const ENGINE_DNA = [
  [0,0,0,0,76,255,59,72,57,35,59,127,58,47,49,27,57,102,59,40,40,36,54,85,28,21,41,36,48,75,29,31],
  [0,0,0,29,60,255,84,39,35,35,82,229,60,36,27,28,52,119,45,37,28,26,62,103,45,36,40,30,49,82,28,26],
  [0,0,5,42,78,237,76,57,54,45,116,255,100,35,49,60,63,92,50,53,57,43,80,108,56,29,37,39,52,78,59,76],
  [0,0,41,55,56,188,101,76,80,96,79,255,109,25,27,56,85,202,74,90,60,70,63,133,82,58,107,101,104,109,110,113],
];

class TurboI6OrderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetRpm = 900;
    this.rpm = 900;
    this.targetLoad = 0.45;
    this.load = 0.45;
    this.targetSpool = 0;
    this.spool = 0;
    this.phase = 0;
    this.turboPhase = 0;
    this.time = 0;
    this.releaseEnvelope = 0;
    this.mechanicalEnvelope = 0;
    this.downshiftEnvelope = 0;
    this.shiftGate = 1;
    this.shiftCutRemaining = 0;
    this.shiftRecoveryDuration = 0.045;
    this.shiftStrength = 0;
    this.limiterPhase = 0;
    this.limiterGate = 1;
    this.randomState = 0x2f6e2b1;
    this.noiseLow = 0;
    this.noiseMid = 0;
    this.timbreWander = 0;
    this.previousCylinder = -1;
    this.cylinderStrength = [1, 0.972, 1.026, 0.988, 1.017, 0.981];
    this.tableSize = 2048;
    this.tables = ENGINE_DNA.map((orders) => this.buildTable(orders));
    this.port.onmessage = ({ data }) => {
      if (data.type === 'state') {
        this.targetRpm = Math.max(850, Math.min(7900, data.rpm));
        this.targetLoad = Math.max(0, Math.min(1, data.load));
        this.targetSpool = Math.max(0, Math.min(1, data.spool));
      } else if (data.type === 'shift') {
        this.shiftCutRemaining = Math.max(0, data.cutDuration || 0);
        this.shiftRecoveryDuration = Math.max(0.01, data.recoveryDuration || 0.045);
        this.shiftStrength = Math.max(0, Math.min(0.95, data.strength || 0));
        this.shiftGate = Math.min(this.shiftGate, 1 - this.shiftStrength);
        if (data.release !== false) this.releaseEnvelope = 1;
      } else if (data.type === 'downshift') {
        this.downshiftEnvelope = 1;
        this.mechanicalEnvelope = Math.min(1, this.mechanicalEnvelope + 0.45);
      } else if (data.type === 'reset') {
        this.releaseEnvelope = 0;
        this.mechanicalEnvelope = 0;
        this.downshiftEnvelope = 0;
        this.shiftGate = 1;
        this.shiftCutRemaining = 0;
        this.shiftStrength = 0;
        this.limiterPhase = 0;
        this.limiterGate = 1;
      }
    };
  }

  buildTable(orders) {
    const table = new Float32Array(this.tableSize);
    let peak = 0;
    for (let sample = 0; sample < this.tableSize; sample++) {
      const phase = sample / this.tableSize * Math.PI * 2;
      let value = 0;
      for (let harmonic = 0; harmonic < orders.length; harmonic++) {
        const magnitude = Math.pow(orders[harmonic] / 255, 1.55);
        value += Math.cos(phase * (harmonic + 1)) * magnitude;
      }
      table[sample] = value;
      peak = Math.max(peak, Math.abs(value));
    }
    const scale = peak > 0 ? 1 / peak : 1;
    for (let i = 0; i < table.length; i++) table[i] *= scale;
    return table;
  }

  random() {
    this.randomState = (1664525 * this.randomState + 1013904223) >>> 0;
    return this.randomState / 4294967296;
  }

  tablePositionForRpm(rpm) {
    const centers = [2200, 3600, 5000, 6800];
    if (rpm <= centers[0]) return 0;
    if (rpm >= centers[3]) return 3;
    for (let i = 0; i < centers.length - 1; i++) {
      if (rpm <= centers[i + 1]) return i + (rpm - centers[i]) / (centers[i + 1] - centers[i]);
    }
    return 3;
  }

  readTable(table, phase) {
    const index = Math.floor(phase);
    const fraction = phase - index;
    const a = table[index % this.tableSize];
    const b = table[(index + 1) % this.tableSize];
    return a + (b - a) * fraction;
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    if (!output || !output[0]) return true;
    const left = output[0];
    const right = output[1] || left;
    const rpmAttack = 1 - Math.exp(-1 / (sampleRate * 0.055));
    const loadAttack = 1 - Math.exp(-1 / (sampleRate * 0.085));
    const spoolAttack = 1 - Math.exp(-1 / (sampleRate * 0.18));

    for (let i = 0; i < left.length; i++) {
      this.time += 1 / sampleRate;
      const idleHunt = Math.sin(this.time * Math.PI * 2 * 0.63) * 18 * Math.max(0, 1 - this.load * 1.7);
      this.rpm += (this.targetRpm + idleHunt - this.rpm) * rpmAttack;
      this.load += (this.targetLoad - this.load) * loadAttack;
      this.spool += (this.targetSpool - this.spool) * spoolAttack;
      if (this.shiftCutRemaining > 0) {
        this.shiftCutRemaining -= 1 / sampleRate;
        this.shiftGate = Math.min(this.shiftGate, 1 - this.shiftStrength);
      } else {
        const shiftRecovery = 1 - Math.exp(-1 / (sampleRate * this.shiftRecoveryDuration / 3));
        this.shiftGate += (1 - this.shiftGate) * shiftRecovery;
      }

      // The table spans two crank revolutions, so its fundamental is the 0.5x engine order.
      const crankHz = this.rpm / 60;
      const revolutionTexture = 1 + Math.sin(this.phase / this.tableSize * Math.PI * 12) * 0.0028;
      this.phase += crankHz * 0.5 * this.tableSize / sampleRate * revolutionTexture;
      if (this.phase >= this.tableSize) this.phase -= this.tableSize;

      this.timbreWander += ((this.random() * 2 - 1) - this.timbreWander) * 0.000025;
      const tablePosition = Math.max(0, Math.min(
        3,
        this.tablePositionForRpm(this.rpm)
          + this.timbreWander * 0.09
          + Math.sin(this.time * 0.71) * 0.025,
      ));
      const lowerTable = Math.floor(tablePosition);
      const upperTable = Math.min(3, lowerTable + 1);
      const tableBlend = tablePosition - lowerTable;
      const lowSample = this.readTable(this.tables[lowerTable], this.phase);
      const highSample = this.readTable(this.tables[upperTable], this.phase);
      let periodic = lowSample + (highSample - lowSample) * tableBlend;

      // Persistent cylinder differences add repeatable imperfection without randomizing the timbre.
      const cylinder = Math.floor(this.phase / this.tableSize * 6) % 6;
      periodic *= this.cylinderStrength[cylinder];
      if (cylinder !== this.previousCylinder) {
        this.previousCylinder = cylinder;
        this.mechanicalEnvelope = Math.min(1, this.mechanicalEnvelope + 0.34);
      }

      // A firing-cut limiter gates the same order spectrum instead of introducing a separate effect.
      let limiterTarget = 1;
      if (this.rpm > 7700) {
        const limiterPattern = [1, 1, 1, 0, 1, 0, 1, 1, 0];
        this.limiterPhase += 22 / sampleRate;
        if (this.limiterPhase >= 1) this.limiterPhase -= 1;
        limiterTarget = limiterPattern[Math.floor(this.limiterPhase * limiterPattern.length)];
      }
      this.limiterGate += (limiterTarget - this.limiterGate) * 0.018;
      periodic *= this.limiterGate;

      // Reference-shaped aperiodic energy: mostly low/mid exhaust body with restrained upper rasp.
      const rawNoise = this.random() * 2 - 1;
      this.noiseLow += (rawNoise - this.noiseLow) * 0.018;
      this.noiseMid += (rawNoise - this.noiseMid) * 0.11;
      const lowTurbulence = this.noiseLow;
      const midTurbulence = this.noiseMid - this.noiseLow;
      const highTurbulence = rawNoise - this.noiseMid;
      const rpmRatio = Math.max(0, Math.min(1, (this.rpm - 900) / 6900));
      const turbulence = (
        lowTurbulence * 0.11
        + midTurbulence * (0.038 + rpmRatio * 0.025)
        + highTurbulence * (0.004 + rpmRatio * 0.012)
      ) * this.load * this.load;

      this.mechanicalEnvelope *= 0.9945;
      const mechanics = highTurbulence * this.mechanicalEnvelope * 0.022;
      const turboFrequency = 1050 + this.spool * 4100;
      this.turboPhase += Math.PI * 2 * turboFrequency / sampleRate;
      if (this.turboPhase > Math.PI * 2) this.turboPhase -= Math.PI * 2;
      const turbo = (Math.sin(this.turboPhase) + Math.sin(this.turboPhase * 1.013) * 0.34)
        * this.spool * this.spool * 0.015;
      const wastegate = highTurbulence * Math.max(0, this.spool - 0.78) * this.load * 0.04;
      const release = highTurbulence * this.releaseEnvelope * 0.14;
      this.releaseEnvelope *= 0.9997;
      const downshiftBark = (
        periodic * 0.075
        + midTurbulence * 0.085
        + highTurbulence * 0.045
      ) * this.downshiftEnvelope;
      this.downshiftEnvelope *= 0.99955;

      const tonalLevel = 0.1 + this.load * 0.18;
      const drive = 1.35 + this.load * 1.25;
      const engineCore = periodic * tonalLevel + turbulence + mechanics + turbo + wastegate + downshiftBark;
      const sample = Math.tanh((engineCore * this.shiftGate + release) * drive) * 0.5;
      left[i] = sample;
      right[i] = sample * 0.985;
    }
    return true;
  }
}
registerProcessor('turbo-i6-engine', TurboI6OrderProcessor);
`;

// Generic order-synthesis processor. Engine identity and quantized order magnitudes arrive as
// structured-clone-safe processor options; no source audio or engine-specific table ships here.
export const ENGINE_WORKLET_SOURCE = String.raw`
class ConfigurableEngineOrderProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.definition = options.processorOptions.definition;
    this.targetRpm = this.definition.idleRpm;
    this.rpm = this.definition.idleRpm;
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
    this.cylinderStrength = this.definition.cylinderStrength;
    this.tableSize = 2048;
    this.tables = this.definition.orderTables.map((orders) => this.buildTable(orders));
    this.port.onmessage = ({ data }) => {
      if (data.type === 'state') {
        this.targetRpm = Math.max(this.definition.idleRpm, Math.min(this.definition.redlineRpm, data.rpm));
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
    const centers = this.definition.tableCentersRpm;
    if (rpm <= centers[0]) return 0;
    if (rpm >= centers[centers.length - 1]) return centers.length - 1;
    for (let i = 0; i < centers.length - 1; i++) {
      if (rpm <= centers[i + 1]) return i + (rpm - centers[i]) / (centers[i + 1] - centers[i]);
    }
    return centers.length - 1;
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
      const idleHunt = Math.sin(this.time * Math.PI * 2 * 0.63) * this.definition.idleHuntRpm * Math.max(0, 1 - this.load * 1.7);
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

      const crankHz = this.rpm / 60;
      const revolutionTexture = 1 + Math.sin(this.phase / this.tableSize * Math.PI * this.cylinderStrength.length * 2) * 0.0028;
      this.phase += crankHz * this.definition.orderFundamental * this.tableSize / sampleRate * revolutionTexture;
      if (this.phase >= this.tableSize) this.phase -= this.tableSize;

      this.timbreWander += ((this.random() * 2 - 1) - this.timbreWander) * 0.000025;
      const tablePosition = Math.max(0, Math.min(
        this.tables.length - 1,
        this.tablePositionForRpm(this.rpm)
          + this.timbreWander * 0.09
          + Math.sin(this.time * 0.71) * 0.025,
      ));
      const lowerTable = Math.floor(tablePosition);
      const upperTable = Math.min(this.tables.length - 1, lowerTable + 1);
      const tableBlend = tablePosition - lowerTable;
      const lowSample = this.readTable(this.tables[lowerTable], this.phase);
      const highSample = this.readTable(this.tables[upperTable], this.phase);
      let periodic = lowSample + (highSample - lowSample) * tableBlend;

      // Persistent cylinder differences add repeatable imperfection without randomizing the timbre.
      const cylinder = Math.floor(this.phase / this.tableSize * this.cylinderStrength.length) % this.cylinderStrength.length;
      periodic *= this.cylinderStrength[cylinder];
      if (cylinder !== this.previousCylinder) {
        this.previousCylinder = cylinder;
        this.mechanicalEnvelope = Math.min(1, this.mechanicalEnvelope + 0.34);
      }

      // A firing-cut limiter gates the same order spectrum instead of introducing a separate effect.
      let limiterTarget = 1;
      if (this.rpm > this.definition.limiterRpm) {
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
      const rpmRatio = Math.max(0, Math.min(1,
        (this.rpm - this.definition.idleRpm)
          / Math.max(1, this.definition.redlineRpm - this.definition.idleRpm)
      ));
      const turbulence = (
        lowTurbulence * 0.11
        + midTurbulence * (0.038 + rpmRatio * 0.025)
        + highTurbulence * (0.004 + rpmRatio * 0.012)
      ) * this.load * this.load * this.definition.turbulence;

      this.mechanicalEnvelope *= 0.9945;
      const mechanics = highTurbulence * this.mechanicalEnvelope * this.definition.mechanicalVolume;
      const induction = this.definition.induction;
      const turboFrequency = induction.whistleBaseHz + this.spool * induction.whistleRangeHz;
      this.turboPhase += Math.PI * 2 * turboFrequency / sampleRate;
      if (this.turboPhase > Math.PI * 2) this.turboPhase -= Math.PI * 2;
      const turbo = (Math.sin(this.turboPhase) + Math.sin(this.turboPhase * 1.013) * 0.34)
        * this.spool * this.spool * induction.whistleVolume;
      const wastegate = highTurbulence * Math.max(0, this.spool - 0.78) * this.load * induction.wastegateVolume;
      const release = highTurbulence * this.releaseEnvelope * 0.14;
      this.releaseEnvelope *= 0.9997;
      const downshiftBark = (
        periodic * 0.075
        + midTurbulence * 0.085
        + highTurbulence * 0.045
      ) * this.downshiftEnvelope;
      this.downshiftEnvelope *= 0.99955;

      const tonalLevel = this.definition.tonalBase + this.load * this.definition.tonalLoad;
      const drive = this.definition.driveBase + this.load * this.definition.driveLoad;
      const engineCore = periodic * tonalLevel + turbulence + mechanics + turbo + wastegate + downshiftBark;
      const sample = Math.tanh((engineCore * this.shiftGate + release) * drive) * this.definition.outputGain;
      left[i] = sample;
      right[i] = sample * this.definition.stereoWidth;
    }
    return true;
  }
}
registerProcessor('configurable-engine-order', ConfigurableEngineOrderProcessor);
`;

import { createCarAudio, type CarAudioParameters } from "../games/drive/audio/car-audio";
import { DRIVING_PROFILES } from "../games/drive/driving-profiles";

export type DemoAudio = {
  whenReady: () => Promise<void>;
  /** Reschedule from frame zero and return the small audio scheduling lead in seconds. */
  restart: () => number;
  setMuted: (muted: boolean) => void;
  update: (time: number, vehicle: CarAudioParameters, signalPan: number) => void;
  destroy: () => void;
};

/** A compact, deterministic score in which the opening signal grows into the car. */
export function createDemoAudio(): DemoAudio | null {
  const AudioContextClass = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;

  const context = new AudioContextClass();
  const master = context.createGain();
  master.gain.value = 0.0001;
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -15;
  compressor.knee.value = 14;
  compressor.ratio.value = 3.5;
  compressor.attack.value = 0.008;
  compressor.release.value = 0.28;
  master.connect(compressor).connect(context.destination);

  const scoreBus = context.createGain();
  scoreBus.gain.value = 0.72;
  scoreBus.connect(master);
  const vehicleBus = context.createGain();
  vehicleBus.gain.value = 0.0001;
  vehicleBus.connect(master);

  const signalPanner = context.createStereoPanner();
  signalPanner.connect(scoreBus);
  const delay = context.createDelay(0.8);
  delay.delayTime.value = 0.285;
  const feedback = context.createGain();
  feedback.gain.value = 0.27;
  signalPanner.connect(delay);
  delay.connect(feedback).connect(delay);
  delay.connect(scoreBus);

  const car = createCarAudio(DRIVING_PROFILES.aggressive, {
    context,
    destination: vehicleBus,
  });
  if (!car) {
    void context.close();
    return null;
  }
  const activeCar = car;

  const noiseBuffer = createSeededNoise(context, 0x44524956);
  let sources: AudioScheduledSourceNode[] = [];
  let muted = true;
  let destroyed = false;

  function keep<T extends AudioScheduledSourceNode>(source: T) {
    sources.push(source);
    return source;
  }

  function stopScore() {
    for (const source of sources) {
      try { source.stop(); } catch { /* It may already have ended. */ }
    }
    sources = [];
  }

  function tone(
    origin: number,
    start: number,
    duration: number,
    frequency: number,
    endFrequency: number,
    level: number,
    pan = 0,
    destination: AudioNode = scoreBus,
  ) {
    const oscillator = keep(context.createOscillator());
    const gain = context.createGain();
    const panner = context.createStereoPanner();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, origin + start);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, origin + start + duration);
    panner.pan.value = pan;
    gain.gain.setValueAtTime(0.0001, origin + start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), origin + start + Math.min(0.045, duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, origin + start + duration);
    oscillator.connect(gain).connect(panner).connect(destination);
    oscillator.start(origin + start);
    oscillator.stop(origin + start + duration + 0.02);
  }

  function noise(
    origin: number,
    start: number,
    duration: number,
    frequency: number,
    level: number,
    filterType: BiquadFilterType = "bandpass",
  ) {
    const source = keep(context.createBufferSource());
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = noiseBuffer;
    source.loop = duration > noiseBuffer.duration;
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = filterType === "bandpass" ? 1.4 : 0.7;
    gain.gain.setValueAtTime(0.0001, origin + start);
    gain.gain.exponentialRampToValueAtTime(level, origin + start + Math.min(0.08, duration * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, origin + start + duration);
    source.connect(filter).connect(gain).connect(scoreBus);
    source.start(origin + start);
    source.stop(origin + start + duration + 0.02);
  }

  function sustainedTone(
    origin: number,
    start: number,
    end: number,
    frequency: number,
    peak: number,
    destination: AudioNode = scoreBus,
  ) {
    const oscillator = keep(context.createOscillator());
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, origin + start);
    gain.gain.exponentialRampToValueAtTime(peak, origin + start + 0.8);
    gain.gain.setValueAtTime(peak, origin + end - 2.5);
    gain.gain.exponentialRampToValueAtTime(0.0001, origin + end);
    oscillator.connect(gain).connect(destination);
    oscillator.start(origin + start);
    oscillator.stop(origin + end + 0.02);
  }

  function scheduleScore() {
    stopScore();
    activeCar.reset();
    const schedulingLead = 0.075;
    const origin = context.currentTime + schedulingLead;

    // Ignition and the spatial signal. Its octave/fifth partials anticipate engine orders.
    noise(origin, 0, 0.16, 3200, 0.12, "highpass");
    tone(origin, 0, 0.34, 54, 31, 0.19);
    tone(origin, 0.04, 3.1, 220, 660, 0.055, 0, signalPanner);
    tone(origin, 0.18, 3.3, 330, 990, 0.027, 0, signalPanner);
    for (let time = 2.2; time < 4.9; time += 0.34) {
      tone(origin, time, 0.11, 720 + (time % 0.7) * 480, 410, 0.018, time % 0.68 < 0.34 ? -0.55 : 0.55);
    }

    // Chrome and material revelation: sparse resonances, not a conventional synth arpeggio.
    [293.66, 440, 659.25, 880].forEach((frequency, index) => {
      tone(origin, 4.35 + index * 0.42, 2.7, frequency, frequency * 0.985, 0.026 - index * 0.003, index % 2 ? 0.32 : -0.32);
    });
    tone(origin, 7.35, 1.4, 73.42, 55, 0.14);

    // Road extrusion establishes a restrained half-second pulse and increasing momentum.
    tone(origin, 8.3, 0.7, 46, 30, 0.22);
    noise(origin, 8.3, 0.35, 1150, 0.055);
    for (let time = 8.55, beat = 0; time < 22.15; time += 0.5, beat += 1) {
      const accent = beat % 4 === 0;
      tone(origin, time, accent ? 0.28 : 0.18, accent ? 58 : 78, 38, accent ? 0.105 : 0.047, beat % 2 ? 0.18 : -0.18);
      if (beat % 2 === 1) noise(origin, time + 0.24, 0.09, 2100, 0.018, "highpass");
    }
    tone(origin, 11.2, 0.8, 65, 34, 0.2);
    noise(origin, 11.2, 0.45, 900, 0.08);

    // Police colors enter as an alternating dyad before their source is visible.
    for (let time = 16.5, pulse = 0; time < 20.45; time += 0.267, pulse += 1) {
      const red = pulse % 2 === 0;
      tone(origin, time, 0.2, red ? 466.16 : 622.25, red ? 440 : 587.33, 0.022, red ? -0.72 : 0.72);
    }

    // The tunnel is pulled into a low impact and a spacious D6/9 title harmony.
    noise(origin, 20, 2.55, 1300, 0.04);
    tone(origin, 22.35, 1.15, 52, 29, 0.24);
    [73.42, 110, 146.83, 164.81, 220].forEach((frequency, index) => {
      sustainedTone(origin, 22.15 + index * 0.055, 39.7, frequency, index === 0 ? 0.047 : 0.018);
    });
    noise(origin, 22.25, 17.45, 2600, 0.008, "highpass");

    // Contract the hold back to the opening pitch so the 40 second loop has no hard seam.
    tone(origin, 37.1, 2.75, 440, 220, 0.025, 0, signalPanner);

    vehicleBus.gain.cancelScheduledValues(origin);
    vehicleBus.gain.setValueAtTime(0.0001, origin);
    vehicleBus.gain.setValueAtTime(0.0001, origin + 10.85);
    vehicleBus.gain.exponentialRampToValueAtTime(0.9, origin + 11.35);
    vehicleBus.gain.setValueAtTime(0.9, origin + 20);
    vehicleBus.gain.exponentialRampToValueAtTime(0.0001, origin + 22.75);
    return schedulingLead;
  }

  return {
    async whenReady() {
      await context.resume();
      await activeCar.whenReady();
    },
    restart() {
      return destroyed ? 0 : scheduleScore();
    },
    setMuted(nextMuted) {
      muted = nextMuted;
      const target = muted ? 0.0001 : 0.78;
      master.gain.setTargetAtTime(target, context.currentTime, muted ? 0.025 : 0.08);
      activeCar.setPaused(muted);
    },
    update(_time, vehicle, signalPan) {
      if (destroyed) return;
      signalPanner.pan.setTargetAtTime(Math.max(-1, Math.min(1, signalPan)), context.currentTime, 0.06);
      activeCar.update(vehicle);
    },
    destroy() {
      destroyed = true;
      stopScore();
      activeCar.destroy();
      void context.close();
    },
  };
}

function createSeededNoise(context: AudioContext, seed: number) {
  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const samples = buffer.getChannelData(0);
  let state = seed >>> 0;
  for (let index = 0; index < samples.length; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    samples[index] = ((state >>> 0) / 0x80000000) - 1;
  }
  return buffer;
}

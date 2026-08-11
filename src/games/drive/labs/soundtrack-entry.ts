import { createCarAudio, type CarAudio } from "../audio/car-audio";
import {
  createDrivingAudioMixer,
  type DrivingMusicStem,
} from "../audio/driving-audio-mixer";
import { SOUNDTRACKS, type SoundtrackId } from "../audio/soundtrack-registry";
import { DRIVING_PROFILES } from "../driving-profiles";
import {
  buildManeuverTrace,
  sampleManeuverTrace,
  type ManeuverId,
} from "./maneuver-scenarios";

const mixer = createDrivingAudioMixer({ trackId: "night-signal", rotateSession: false });
const startButton = element<HTMLButtonElement>("#start-audio");
const pauseButton = element<HTMLButtonElement>("#pause-music");
const recordButton = element<HTMLButtonElement>("#record-mix");
const status = element<HTMLOutputElement>("#status");
const bar = element<HTMLInputElement>("#bar");
const barOutput = element<HTMLOutputElement>("#bar-output");
const speed = element<HTMLInputElement>("#speed");
const speedOutput = element<HTMLOutputElement>("#speed-output");
const drift = element<HTMLInputElement>("#drift");
const driftOutput = element<HTMLOutputElement>("#drift-output");
const chaseTier = element<HTMLSelectElement>("#chase-tier");
const vehicleScenario = element<HTMLSelectElement>("#vehicle-scenario");
const mixIsolation = element<HTMLSelectElement>("#mix-isolation");
const soundtrack = element<HTMLSelectElement>("#soundtrack");
const speakerProfile = element<HTMLSelectElement>("#speaker-profile");
const stemsRoot = element<HTMLElement>("#stems");
const spectrum = element<HTMLCanvasElement>("#spectrum");
const level = element<HTMLOutputElement>("#level");

const stemNames: DrivingMusicStem[] = ["drums", "bass", "synth", "atmosphere", "guitar"];
const muted = new Set<DrivingMusicStem>();
const soloed = new Set<DrivingMusicStem>();
let started = false;
let paused = false;
let animationFrame = 0;
let recorder: MediaRecorder | null = null;
let recordingChunks: Blob[] = [];
let carAudio: CarAudio | null = mixer ? createCarAudio(DRIVING_PROFILES.aggressive, {
  context: mixer.context,
  destination: mixer.vehicleDestination,
}) : null;
let vehicleTrace = buildManeuverTrace("idle", "aggressive");
let vehiclePlayhead = 0;
let previousMeterTime = performance.now();

for (const stem of stemNames) {
  const row = document.createElement("div");
  row.className = "stem-row";
  row.innerHTML = `<strong>${stem}</strong><button type="button" data-action="mute">Mute</button><button type="button" data-action="solo">Solo</button>`;
  row.querySelector<HTMLButtonElement>("[data-action='mute']")?.addEventListener("click", (event) => {
    toggleSet(muted, stem);
    (event.currentTarget as HTMLButtonElement).setAttribute("aria-pressed", String(muted.has(stem)));
    applyStemMix();
  });
  row.querySelector<HTMLButtonElement>("[data-action='solo']")?.addEventListener("click", (event) => {
    toggleSet(soloed, stem);
    (event.currentTarget as HTMLButtonElement).setAttribute("aria-pressed", String(soloed.has(stem)));
    applyStemMix();
  });
  stemsRoot.append(row);
}

function toggleSet(set: Set<DrivingMusicStem>, stem: DrivingMusicStem) {
  if (set.has(stem)) set.delete(stem);
  else set.add(stem);
}

function applyStemMix() {
  mixer?.setStemMix(Object.fromEntries(stemNames.map((stem) => [
    stem,
    muted.has(stem) || (soloed.size > 0 && !soloed.has(stem)) ? 0 : 1,
  ])));
}

function updateState() {
  const speedValue = Number(speed.value) / 100;
  const driftValue = Number(drift.value) / 100;
  speedOutput.value = `${Math.round(speedValue * 100)}%`;
  driftOutput.value = `${Math.round(driftValue * 100)}%`;
  mixer?.updateMusic({
    running: started,
    paused,
    speed: speedValue,
    drift: driftValue,
    chaseTier: Number(chaseTier.value),
  });
}

startButton.addEventListener("click", async () => {
  if (!mixer) {
    status.value = "Web Audio unavailable";
    startButton.disabled = true;
    return;
  }
  startButton.disabled = true;
  startButton.textContent = "Starting…";
  await Promise.all([mixer.start(), carAudio?.whenReady()]);
  started = true;
  mixer.setMusicVolume(0.72);
  carAudio?.setPaused(false);
  updateMixIsolation();
  updateState();
  status.value = "Soundtrack running · 114 BPM";
  startButton.textContent = "Soundtrack running";
});

pauseButton.addEventListener("click", () => {
  paused = !paused;
  pauseButton.setAttribute("aria-pressed", String(paused));
  pauseButton.textContent = paused ? "Resume mix" : "Pause mix";
  carAudio?.setPaused(paused);
  updateState();
});

for (const control of [speed, drift, chaseTier]) control.addEventListener("input", updateState);
soundtrack.addEventListener("change", () => {
  const trackId = soundtrack.value as SoundtrackId;
  const definition = SOUNDTRACKS[trackId];
  mixer?.setTrack(trackId, "immediate");
  bar.max = String(definition.bars - 1);
  bar.value = "0";
  barOutput.value = `1 / ${definition.bars}`;
  status.value = `${definition.title} · ${definition.bpm} BPM`;
});
speakerProfile.addEventListener("change", () => {
  mixer?.setPlaybackProfile(speakerProfile.value === "mobile" ? "mobile" : "full");
});
vehicleScenario.addEventListener("change", () => {
  const scenario = vehicleScenario.value as ManeuverId;
  vehicleTrace = buildManeuverTrace(scenario, "aggressive");
  vehiclePlayhead = 0;
  carAudio?.reset();
});
mixIsolation.addEventListener("change", updateMixIsolation);

function updateMixIsolation() {
  const isolation = mixIsolation.value;
  mixer?.setMusicMuted(isolation === "vehicle");
  mixer?.setVehicleVolume(isolation === "music" ? 0 : 1);
}
bar.addEventListener("input", () => {
  const selectedBar = Number(bar.value);
  barOutput.value = `${selectedBar + 1} / ${SOUNDTRACKS[mixer?.getCurrentTrack() ?? "night-signal"].bars}`;
  mixer?.seekToBar(selectedBar);
});

element("#clear-solos").addEventListener("click", () => {
  soloed.clear();
  stemsRoot.querySelectorAll<HTMLButtonElement>("[data-action='solo']").forEach((button) => {
    button.setAttribute("aria-pressed", "false");
  });
  applyStemMix();
});

document.querySelectorAll<HTMLButtonElement>("[data-cue]").forEach((button) => {
  button.addEventListener("click", () => {
    const cue = button.dataset.cue;
    if (cue === "collision") {
      mixer?.collision();
      carAudio?.impact(0.72);
    }
    else if (cue === "capture" || cue === "reset") {
      mixer?.cue(cue);
      if (cue === "capture") carAudio?.impact(1);
      else carAudio?.reset();
    }
    else if (cue === "drift") {
      drift.value = "0";
      updateState();
      window.setTimeout(() => { drift.value = "72"; updateState(); }, 80);
    } else if (cue === "reinforcement") {
      chaseTier.value = String(Math.min(3, Math.max(1, Number(chaseTier.value)) + 1));
      updateState();
    }
  });
});

recordButton.addEventListener("click", () => {
  if (!mixer || typeof MediaRecorder === "undefined") {
    status.value = "Recording unavailable";
    return;
  }
  if (recorder?.state === "recording") {
    recorder.stop();
    return;
  }
  recordingChunks = [];
  recorder = new MediaRecorder(mixer.getRecordingStream());
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) recordingChunks.push(event.data);
  });
  recorder.addEventListener("stop", () => {
    const recording = new Blob(recordingChunks, { type: recorder?.mimeType || "audio/webm" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(recording);
    link.download = `drive-soundtrack-bar-${mixer.getCurrentBar() + 1}.webm`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1_000);
    recordButton.textContent = "Record mix";
    recordButton.setAttribute("aria-pressed", "false");
    status.value = "Recording downloaded";
  });
  recorder.start();
  recordButton.textContent = "Stop recording";
  recordButton.setAttribute("aria-pressed", "true");
  status.value = "Recording mix…";
});

const context = spectrum.getContext("2d");
const analyser = mixer?.getMasterAnalyser();
const frequencies = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
const waveform = analyser ? new Uint8Array(analyser.fftSize) : null;
function drawMeters(now: number) {
  const dt = Math.min(0.05, Math.max(0, (now - previousMeterTime) / 1000));
  previousMeterTime = now;
  if (started && !paused && carAudio) {
    vehiclePlayhead += dt;
    const duration = vehicleTrace.at(-1)?.time ?? 1;
    if (vehiclePlayhead >= duration) {
      vehiclePlayhead %= duration;
      carAudio.reset();
    }
    const sample = sampleManeuverTrace(vehicleTrace, vehiclePlayhead);
    carAudio.update({
      dt,
      speed: sample.speed,
      forwardSpeed: sample.forwardSpeed,
      signedSlipDegrees: sample.signedSlipDegrees,
      steeringLoad: sample.steeringLoad,
      steerDirection: sample.steering,
      phase: sample.phase,
      onPavement: sample.onPavement,
      boosting: sample.boosting,
      throttle: sample.throttle,
      braking: sample.braking || sample.handbrake,
      reversing: sample.forwardSpeed < -0.35,
    });
  }
  if (context && analyser && frequencies && waveform) {
    analyser.getByteFrequencyData(frequencies);
    analyser.getByteTimeDomainData(waveform);
    const width = spectrum.width;
    const height = spectrum.height;
    context.fillStyle = "#0b1111";
    context.fillRect(0, 0, width, height);
    const bins = 96;
    for (let index = 0; index < bins; index += 1) {
      const bin = Math.floor(Math.pow(index / bins, 2) * (frequencies.length - 1));
      const magnitude = frequencies[bin] / 255;
      const barWidth = width / bins;
      context.fillStyle = `hsl(${164 + magnitude * 28} 72% ${34 + magnitude * 34}%)`;
      context.fillRect(index * barWidth, height * (1 - magnitude), Math.max(1, barWidth - 2), height * magnitude);
    }
    let sum = 0;
    for (const sample of waveform) {
      const centered = (sample - 128) / 128;
      sum += centered * centered;
    }
    const rms = Math.sqrt(sum / waveform.length);
    level.value = rms > 0.00001 ? `${(20 * Math.log10(rms)).toFixed(1)} dBFS` : "−∞ dBFS";
  }
  if (mixer && document.activeElement !== bar) {
    const currentBar = mixer.getCurrentBar();
    bar.value = String(currentBar);
    barOutput.value = `${currentBar + 1} / ${SOUNDTRACKS[mixer.getCurrentTrack()].bars}`;
  }
  animationFrame = requestAnimationFrame(drawMeters);
}
animationFrame = requestAnimationFrame(drawMeters);

window.addEventListener("pagehide", () => {
  cancelAnimationFrame(animationFrame);
  if (recorder?.state === "recording") recorder.stop();
  carAudio?.destroy();
  carAudio = null;
  mixer?.destroy();
}, { once: true });

function element<T extends HTMLElement = HTMLElement>(selector: string) {
  const match = document.querySelector<T>(selector);
  if (!match) throw new Error(`Missing soundtrack lab element: ${selector}`);
  return match;
}

import "../styles/dyno.css";
import { createCarAudio, type CarAudio } from "../audio/car-audio";
import {
  cloneTransmissionTuning,
  DEFAULT_TRANSMISSION_TUNING,
  type TransmissionCharacterTuning,
  type TransmissionTuning,
} from "../audio/transmission-tuning";
import { DRIVING_PROFILES } from "../driving-profiles";
import type { DriftPhase } from "../types";

const STORAGE_KEY = "driving-game:dyno-tuning:v2";
const element = <T extends HTMLElement>(selector: string) => {
  const match = document.querySelector<T>(selector);
  if (!match) throw new Error(`Missing dyno control: ${selector}`);
  return match;
};

const profileSelect = element<HTMLSelectElement>("#profile");
const speedInput = element<HTMLInputElement>("#speed");
const throttleInput = element<HTMLInputElement>("#throttle");
const accelerationInput = element<HTMLInputElement>("#acceleration");
const slipInput = element<HTMLInputElement>("#slip");
const autoPullInput = element<HTMLInputElement>("#auto-pull");
const driftInput = element<HTMLInputElement>("#drift");
const brakingInput = element<HTMLInputElement>("#braking");
const reverseInput = element<HTMLInputElement>("#reverse");
const boostInput = element<HTMLInputElement>("#boost");
const jsonOutput = element<HTMLTextAreaElement>("#tuning-json");
const status = element<HTMLElement>("#exchange-status");
const eventLog = element<HTMLOListElement>("#event-log");
const canvas = element<HTMLCanvasElement>("#spectrogram");
function getCanvasContext(canvasElement: HTMLCanvasElement) {
  const context = canvasElement.getContext("2d");
  if (!context) throw new Error("Canvas 2D is required for the dyno spectrogram.");
  return context;
}
const canvasContext = getCanvasContext(canvas);

let tuning = readStoredTuning();
let audio: CarAudio | null = null;
let speed = 0;
let runningPull = false;
let phase: DriftPhase = "grip";
let phaseTime = 0;
let previousGear = 1;
let sessionTime = 0;
let lastFrame = performance.now();
let spectrum: Uint8Array<ArrayBuffer> | null = null;
const events: string[] = [];

function normalizeCharacter(
  value: Partial<TransmissionCharacterTuning>,
  defaults: TransmissionCharacterTuning,
): TransmissionCharacterTuning {
  let ratios = [...defaults.ratios];
  if (
    Array.isArray(value.ratios)
    && value.ratios.length >= 4
    && value.ratios[0] === 0
    && value.ratios[value.ratios.length - 1] === 1
  ) ratios = value.ratios.map(Number);

  let rpmFloors = [...defaults.rpmFloors];
  if (Array.isArray(value.rpmFloors) && value.rpmFloors.length === ratios.length - 1) {
    rpmFloors = value.rpmFloors.map(Number);
  }

  let audibleUpshifts = [...defaults.audibleUpshifts];
  if (
    Array.isArray(value.audibleUpshifts)
    && value.audibleUpshifts.length === ratios.length - 2
  ) audibleUpshifts = value.audibleUpshifts.map(Boolean);

  return {
    ...defaults,
    ...value,
    ratios,
    rpmFloors,
    audibleUpshifts,
  };
}

function normalizeTuning(value: unknown): TransmissionTuning {
  const defaults = cloneTransmissionTuning();
  if (!value || typeof value !== "object") return defaults;
  const supplied = value as Partial<TransmissionTuning>;
  return {
    ...defaults,
    ...supplied,
    cruise: normalizeCharacter(supplied.cruise ?? {}, defaults.cruise),
    aggressive: normalizeCharacter(supplied.aggressive ?? {}, defaults.aggressive),
  };
}

function readStoredTuning() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return normalizeTuning(JSON.parse(stored));
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return cloneTransmissionTuning();
}

function selectedProfileName() {
  return profileSelect.value === "aggressive" ? "aggressive" : "loose";
}

function selectedCharacter() {
  return selectedProfileName() === "aggressive" ? tuning.aggressive : tuning.cruise;
}

function recreateAudio() {
  const wasStarted = audio !== null;
  audio?.destroy();
  audio = null;
  if (!wasStarted) return;
  audio = createCarAudio(DRIVING_PROFILES[selectedProfileName()], { transmission: tuning });
  audio?.reset();
  spectrum = audio ? new Uint8Array(audio.getAnalyser().frequencyBinCount) : null;
}

function startAudio() {
  if (!audio) {
    audio = createCarAudio(DRIVING_PROFILES[selectedProfileName()], { transmission: tuning });
    spectrum = audio ? new Uint8Array(audio.getAnalyser().frequencyBinCount) : null;
  }
  element<HTMLButtonElement>("#start-audio").textContent = "Audio running";
}

function resetRun() {
  speed = 0;
  speedInput.value = "0";
  runningPull = false;
  autoPullInput.checked = false;
  driftInput.checked = false;
  brakingInput.checked = false;
  reverseInput.checked = false;
  boostInput.checked = false;
  phase = "grip";
  phaseTime = 0;
  sessionTime = 0;
  previousGear = 1;
  audio?.reset();
  clearSpectrogram();
  updateRunOutputs();
}

function runPull() {
  startAudio();
  resetRun();
  autoPullInput.checked = true;
  runningPull = true;
  logEvent("Pull started");
}

function setPhaseFromControls(dt: number) {
  phaseTime += dt;
  if (driftInput.checked) {
    if (phase === "grip" || phase === "recover") {
      phase = "breakaway";
      phaseTime = 0;
      logEvent("Drift initiated");
    } else if (phase === "breakaway" && phaseTime >= 0.18) {
      phase = "sustain";
      phaseTime = 0;
    }
    return;
  }
  if (phase === "breakaway" || phase === "sustain" || phase === "transition") {
    phase = "recover";
    phaseTime = 0;
    logEvent("Recovery started");
  } else if (phase === "recover" && phaseTime >= 0.4) {
    phase = "grip";
    phaseTime = 0;
  }
}

function updateSimulation(dt: number) {
  const profile = DRIVING_PROFILES[selectedProfileName()];
  const throttle = Number(throttleInput.value);
  if (autoPullInput.checked || runningPull) {
    if (reverseInput.checked) {
      speed += profile.manual.reverseAcceleration * throttle * dt;
      speed = Math.min(speed, profile.manual.maximumReverseSpeed);
    } else if (brakingInput.checked) {
      speed = Math.max(0, speed - profile.manual.brakeDeceleration * dt);
    } else {
      const acceleration = Number(accelerationInput.value) * throttle;
      speed = (speed + acceleration * dt) * Math.exp(-profile.grip.drag * dt);
      const maximum = boostInput.checked ? profile.boostedMaximumSpeed : profile.maximumSpeed;
      speed = Math.min(speed, maximum);
    }
    speedInput.value = speed.toFixed(2);
    if (!reverseInput.checked && speed >= profile.maximumSpeed - 0.01) runningPull = false;
    const speedOutput = document.querySelector<HTMLOutputElement>("[data-output-for=\"speed\"]");
    if (speedOutput) speedOutput.value = speed.toFixed(1);
  } else {
    speed = Number(speedInput.value);
  }
  setPhaseFromControls(dt);

  const slipDegrees = driftInput.checked || phase === "recover" ? Number(slipInput.value) : 0;
  const forwardMagnitude = speed * Math.cos(slipDegrees * Math.PI / 180);
  audio?.update({
    dt,
    speed,
    forwardSpeed: reverseInput.checked ? -forwardMagnitude : forwardMagnitude,
    signedSlipDegrees: driftInput.checked ? slipDegrees : 0,
    steeringLoad: driftInput.checked ? 0.72 : 0,
    steerDirection: driftInput.checked ? 1 : 0,
    phase,
    onPavement: true,
    boosting: boostInput.checked,
    throttle,
    braking: brakingInput.checked,
    reversing: reverseInput.checked,
  });
}

function updateTelemetry() {
  const telemetry = audio?.getTelemetry();
  element("#speed-readout").textContent = speed.toFixed(1);
  element("#gear-readout").textContent = String(telemetry?.gear ?? 1);
  element("#rpm-readout").textContent = String(Math.round(telemetry?.rpm ?? 900));
  element("#load-readout").textContent = `${Math.round((telemetry?.load ?? 0) * 100)}%`;
  element("#spool-readout").textContent = `${Math.round((telemetry?.spool ?? 0) * 100)}%`;
  element("#phase-readout").textContent = phase[0].toUpperCase() + phase.slice(1);
  if (telemetry && telemetry.gear !== previousGear) {
    let character = "downshift";
    if (telemetry.gear > previousGear) {
      const transitionIndex = telemetry.gear - 2;
      character = selectedCharacter().audibleUpshifts[transitionIndex]
        ? "full shift"
        : "absorbed";
    }
    logEvent(
      `Gear ${previousGear} → ${telemetry.gear} · ${character} · ${Math.round(telemetry.rpm)} RPM`,
    );
    previousGear = telemetry.gear;
  }
}

function drawSpectrogram() {
  if (!audio || !spectrum) return;
  const analyser = audio.getAnalyser();
  analyser.getByteFrequencyData(spectrum);
  canvasContext.drawImage(canvas, -1, 0);
  const x = canvas.width - 1;
  const minimumFrequency = 50;
  const maximumFrequency = 10_000;
  for (let y = 0; y < canvas.height; y++) {
    const normalized = 1 - y / (canvas.height - 1);
    const frequency = minimumFrequency * (maximumFrequency / minimumFrequency) ** normalized;
    const bin = Math.min(
      spectrum.length - 1,
      Math.round(frequency / (analyser.context.sampleRate / 2) * spectrum.length),
    );
    const value = spectrum[bin] / 255;
    const red = Math.round(18 + value * 232);
    const green = Math.round(25 + value * value * 188);
    const blue = Math.round(29 + Math.max(0, value - 0.58) * 260);
    canvasContext.fillStyle = `rgb(${red} ${green} ${blue})`;
    canvasContext.fillRect(x, y, 1, 1);
  }
}

function clearSpectrogram() {
  canvasContext.fillStyle = "#101714";
  canvasContext.fillRect(0, 0, canvas.width, canvas.height);
}

function logEvent(message: string) {
  const line = `${sessionTime.toFixed(2)}s — ${message}`;
  events.push(line);
  const item = document.createElement("li");
  item.textContent = line;
  eventLog.prepend(item);
}

function formatValue(value: number, format: ControlFormat) {
  if (format === "percent") return `${Math.round(value * 100)}%`;
  if (format === "milliseconds") return `${Math.round(value * 1000)} ms`;
  if (format === "rpm") return `${Math.round(value)} RPM`;
  return value.toFixed(value < 1 ? 2 : 1);
}

type ControlFormat = "number" | "percent" | "milliseconds" | "rpm";
type SliderDefinition = {
  label: string;
  min: number;
  max: number;
  step: number;
  value: () => number;
  set: (value: number) => void;
  format?: ControlFormat;
};

function renderSlider(root: HTMLElement, definition: SliderDefinition) {
  const label = document.createElement("label");
  label.className = "range-control";
  const heading = document.createElement("span");
  const output = document.createElement("output");
  const input = document.createElement("input");
  heading.textContent = definition.label;
  output.textContent = formatValue(definition.value(), definition.format ?? "number");
  heading.append(output);
  input.type = "range";
  input.min = String(definition.min);
  input.max = String(definition.max);
  input.step = String(definition.step);
  input.value = String(definition.value());
  input.addEventListener("input", () => {
    definition.set(Number(input.value));
    output.textContent = formatValue(definition.value(), definition.format ?? "number");
    applyTuning();
  });
  label.append(heading, input);
  root.append(label);
  return label;
}

function characterControls(character: TransmissionCharacterTuning) {
  const ratioRoot = element("#ratio-controls");
  const rpmRoot = element("#rpm-controls");
  ratioRoot.replaceChildren();
  rpmRoot.replaceChildren();
  for (let index = 1; index < character.ratios.length - 1; index++) {
    renderSlider(ratioRoot, {
      label: index === 1 ? "Launch transition" : `Shift into gear ${index + 1}`,
      min: 0.08,
      max: 0.98,
      step: 0.005,
      value: () => character.ratios[index],
      set(value) {
        const minimum = character.ratios[index - 1] + 0.01;
        const maximum = character.ratios[index + 1] - 0.01;
        character.ratios[index] = Math.max(minimum, Math.min(maximum, value));
      },
      format: "percent",
    });
    const punctuation = document.createElement("label");
    punctuation.className = "punctuation-toggle";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = character.audibleUpshifts[index - 1];
    checkbox.addEventListener("change", () => {
      character.audibleUpshifts[index - 1] = checkbox.checked;
      applyTuning();
    });
    punctuation.append(checkbox, " Full shift transient");
    ratioRoot.append(punctuation);
  }
  character.rpmFloors.forEach((_, index) => renderSlider(rpmRoot, {
    label: `Gear ${index + 1} RPM floor`,
    min: 1200,
    max: 7200,
    step: 100,
    value: () => character.rpmFloors[index],
    set: (value) => (character.rpmFloors[index] = value),
    format: "rpm",
  }));
  renderSlider(rpmRoot, {
    label: "Shift-point RPM",
    min: 5500,
    max: 7900,
    step: 50,
    value: () => character.shiftPeakRpm,
    set: (value) => (character.shiftPeakRpm = value),
    format: "rpm",
  });
  renderSlider(rpmRoot, {
    label: "Top-speed RPM",
    min: 4000,
    max: 7900,
    step: 50,
    value: () => character.topRpm,
    set: (value) => (character.topRpm = value),
    format: "rpm",
  });
}

function renderCommonControls() {
  const shiftRoot = element("#shift-controls");
  const driftRoot = element("#drift-controls");
  shiftRoot.replaceChildren();
  driftRoot.replaceChildren();
  const character = selectedCharacter();
  [
    { label: "Torque cut", min: 0.02, max: 0.16, step: 0.005, value: () => character.shiftCutDuration, set: (value: number) => (character.shiftCutDuration = value), format: "milliseconds" as const },
    { label: "Cut strength", min: 0, max: 0.95, step: 0.01, value: () => character.shiftStrength, set: (value: number) => (character.shiftStrength = value), format: "percent" as const },
    { label: "Recovery", min: 0.015, max: 0.14, step: 0.005, value: () => tuning.shiftRecoveryDuration, set: (value: number) => (tuning.shiftRecoveryDuration = value), format: "milliseconds" as const },
    { label: "Shift re-arm", min: 0.15, max: 0.8, step: 0.01, value: () => tuning.shiftRearmDuration, set: (value: number) => (tuning.shiftRearmDuration = value), format: "milliseconds" as const },
    { label: "Shift noise", min: 0, max: 0.14, step: 0.002, value: () => character.shiftNoiseVolume, set: (value: number) => (character.shiftNoiseVolume = value) },
    { label: "Shift thump", min: 0, max: 0.14, step: 0.002, value: () => character.shiftThumpVolume, set: (value: number) => (character.shiftThumpVolume = value) },
    { label: "Downshift hysteresis", min: 0, max: 0.15, step: 0.005, value: () => tuning.downshiftHysteresis, set: (value: number) => (tuning.downshiftHysteresis = value), format: "percent" as const },
  ].forEach((definition) => renderSlider(shiftRoot, definition));

  const downshiftToggle = document.createElement("label");
  downshiftToggle.className = "toggle-row";
  downshiftToggle.innerHTML = `<span>Downshift on drift initiation</span><input type="checkbox" ${tuning.driftDownshift ? "checked" : ""}>`;
  downshiftToggle.querySelector("input")?.addEventListener("change", (event) => {
    tuning.driftDownshift = (event.currentTarget as HTMLInputElement).checked;
    applyTuning();
  });
  driftRoot.append(downshiftToggle);
  [
    { label: "Drift speed blend", min: 0, max: 1, step: 0.01, value: () => tuning.driftSpeedBlend, set: (value: number) => (tuning.driftSpeedBlend = value), format: "percent" as const },
    { label: "Recovery inhibit", min: 0, max: 0.7, step: 0.01, value: () => tuning.recoveryShiftInhibit, set: (value: number) => (tuning.recoveryShiftInhibit = value), format: "milliseconds" as const },
    { label: "Downshift load punch", min: 0, max: 1.5, step: 0.02, value: () => tuning.downshiftPunch, set: (value: number) => (tuning.downshiftPunch = value) },
    { label: "Downshift bark", min: 0, max: 0.15, step: 0.002, value: () => tuning.downshiftNoiseVolume, set: (value: number) => (tuning.downshiftNoiseVolume = value) },
    { label: "Downshift thump", min: 0, max: 0.15, step: 0.002, value: () => tuning.downshiftThumpVolume, set: (value: number) => (tuning.downshiftThumpVolume = value) },
  ].forEach((definition) => renderSlider(driftRoot, definition));
}

function renderTuningControls() {
  characterControls(selectedCharacter());
  renderCommonControls();
  jsonOutput.value = JSON.stringify(tuning, null, 2);
}

function applyTuning() {
  audio?.setTransmissionTuning(tuning);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tuning));
  jsonOutput.value = JSON.stringify(tuning, null, 2);
}

function updateRunOutputs() {
  const values: Record<string, string> = {
    speed: Number(speedInput.value).toFixed(1),
    throttle: `${Math.round(Number(throttleInput.value) * 100)}%`,
    acceleration: Number(accelerationInput.value).toFixed(1),
    slip: `${Math.round(Number(slipInput.value))}°`,
  };
  Object.entries(values).forEach(([name, value]) => {
    const output = document.querySelector<HTMLOutputElement>(`[data-output-for="${name}"]`);
    if (output) output.value = value;
  });
}

element("#start-audio").addEventListener("click", startAudio);
element("#run-pull").addEventListener("click", runPull);
element("#reset-run").addEventListener("click", resetRun);
element("#restore-defaults").addEventListener("click", () => {
  tuning = cloneTransmissionTuning(DEFAULT_TRANSMISSION_TUNING);
  applyTuning();
  renderTuningControls();
  status.textContent = "Defaults restored.";
});
element("#apply-json").addEventListener("click", () => {
  try {
    tuning = normalizeTuning(JSON.parse(jsonOutput.value));
    applyTuning();
    renderTuningControls();
    status.textContent = "JSON applied.";
  } catch {
    status.textContent = "That JSON could not be parsed.";
  }
});
element("#copy-json").addEventListener("click", async () => {
  await navigator.clipboard.writeText(JSON.stringify(tuning, null, 2));
  status.textContent = "Settings copied.";
});
element("#copy-session").addEventListener("click", async () => {
  await navigator.clipboard.writeText(JSON.stringify({ tuning, events }, null, 2));
  status.textContent = "Settings and event log copied.";
});
element("#clear-events").addEventListener("click", () => {
  events.length = 0;
  eventLog.replaceChildren();
});
profileSelect.addEventListener("change", () => {
  accelerationInput.value = String(DRIVING_PROFILES[selectedProfileName()].acceleration);
  recreateAudio();
  resetRun();
  renderTuningControls();
  updateRunOutputs();
});
[speedInput, throttleInput, accelerationInput, slipInput].forEach((input) => {
  input.addEventListener("input", updateRunOutputs);
});

function frame(time: number) {
  const dt = Math.min(0.05, (time - lastFrame) / 1000);
  lastFrame = time;
  sessionTime += dt;
  updateSimulation(dt);
  updateTelemetry();
  drawSpectrogram();
  requestAnimationFrame(frame);
}

clearSpectrogram();
renderTuningControls();
updateRunOutputs();
requestAnimationFrame(frame);

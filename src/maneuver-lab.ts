import "./styles/maneuver-lab.css";
import {
  createCarAudio,
  type CarAudio,
  type CarAudioIsolation,
} from "./lib/driving-game/audio/car-audio";
import {
  DEFAULT_ENGINE_TYPE,
  ENGINE_TYPES,
  type EngineTypeId,
} from "./lib/driving-game/audio/engine-types";
import {
  cloneTransmissionTuning,
  type TransmissionTuning,
} from "./lib/driving-game/audio/transmission-tuning";
import { DRIVING_PROFILES, type DrivingProfileName } from "./lib/driving-game/driving-profiles";
import {
  buildManeuverTrace,
  maneuverSegmentAt,
  maneuverSegmentsForTrace,
  MANEUVER_SCENARIOS,
  sampleManeuverTrace,
  type ManeuverId,
  type ManeuverTraceSample,
} from "./lib/driving-game/labs/maneuver-scenarios";

const STORAGE_KEY = "driving-game:dyno-tuning:v2";
const element = <T extends HTMLElement>(selector: string) => {
  const match = document.querySelector<T>(selector);
  if (!match) throw new Error(`Missing Maneuver Lab element: ${selector}`);
  return match;
};
const context2d = (canvas: HTMLCanvasElement) => {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Maneuver Lab requires Canvas 2D.");
  return context;
};

const engineSelect = element<HTMLSelectElement>("#engine");
const profileSelect = element<HTMLSelectElement>("#profile");
const scenarioList = element("#scenario-list");
const description = element("#scenario-description");
const timeline = element<HTMLInputElement>("#timeline");
const timelineOutput = element<HTMLOutputElement>("#timeline-output");
const playButton = element<HTMLButtonElement>("#play-pause");
const audioButton = element<HTMLButtonElement>("#start-audio");
const loopInput = element<HTMLInputElement>("#loop");
const eventLog = element<HTMLOListElement>("#event-log");
const pathCanvas = element<HTMLCanvasElement>("#path-canvas");
const pathContext = context2d(pathCanvas);
const chartCanvas = element<HTMLCanvasElement>("#telemetry-chart");
const chartContext = context2d(chartCanvas);
const spectrogram = element<HTMLCanvasElement>("#spectrogram");
const spectrumContext = context2d(spectrogram);

let scenarioId: ManeuverId = "launch";
let engineId: EngineTypeId = DEFAULT_ENGINE_TYPE;
let audioIsolation: CarAudioIsolation = "mix";
let trace = buildManeuverTrace(scenarioId);
let segments = maneuverSegmentsForTrace(MANEUVER_SCENARIOS[scenarioId], trace);
let playhead = 0;
let playing = false;
let audio: CarAudio | null = null;
let spectrum: Uint8Array<ArrayBuffer> | null = null;
let lastFrame = performance.now();
let previousSegment = "";
let previousPhase = trace[0].phase;
let previousGear = 1;
let spectrumCursor = 0;
let tuning = readDynoTuning();

function selectedProfile(): DrivingProfileName {
  return profileSelect.value === "loose" ? "loose" : "aggressive";
}

function selectedEngine() {
  return ENGINE_TYPES[engineId];
}

function populateEngineSelect() {
  engineSelect.replaceChildren(...Object.entries(ENGINE_TYPES).map(([id, definition]) => {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = definition.shortTitle;
    return option;
  }));
  engineSelect.value = engineId;
}

function readDynoTuning(): TransmissionTuning {
  element("#tuning-source").textContent = "Dyno defaults";
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      element("#tuning-source").textContent = "Saved Dyno settings";
      return JSON.parse(stored) as TransmissionTuning;
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return cloneTransmissionTuning();
}

function effectiveTransmissionTuning() {
  if (engineId === "turboI6") return readDynoTuning();
  element("#tuning-source").textContent = "Engine defaults";
  return cloneTransmissionTuning(selectedEngine().defaultTransmission);
}

function ensureAudio() {
  if (!audio) {
    tuning = effectiveTransmissionTuning();
    audio = createCarAudio(DRIVING_PROFILES[selectedProfile()], {
      engine: selectedEngine(),
      transmission: tuning,
    });
    spectrum = audio ? new Uint8Array(audio.getAnalyser().frequencyBinCount) : null;
    audio?.setIsolation(audioIsolation);
  }
  audio?.setPaused(false);
  audioButton.textContent = audio ? "Sound running" : "Audio unavailable";
  return audio;
}

function recreateAudio() {
  const enabled = audio !== null;
  audio?.destroy();
  audio = null;
  spectrum = null;
  if (enabled) ensureAudio();
}

function renderScenarioButtons() {
  scenarioList.replaceChildren();
  for (const scenario of Object.values(MANEUVER_SCENARIOS)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "scenario-option";
    button.dataset.scenario = scenario.id;
    button.setAttribute("aria-pressed", String(scenario.id === scenarioId));
    button.innerHTML = `<strong>${scenario.shortTitle}</strong><small>${scenario.duration.toFixed(0)} seconds · production inputs</small>`;
    button.addEventListener("click", () => selectScenario(scenario.id));
    scenarioList.append(button);
  }
}

function selectScenario(nextId: ManeuverId) {
  scenarioId = nextId;
  trace = buildManeuverTrace(scenarioId, selectedProfile());
  segments = maneuverSegmentsForTrace(MANEUVER_SCENARIOS[scenarioId], trace);
  playing = false;
  playhead = 0;
  audio?.reset();
  audio?.setPaused(true);
  resetLandmarks();
  clearSpectrogram();
  renderScenarioButtons();
  renderScenarioMetadata();
  renderFrame(trace[0]);
}

function renderScenarioMetadata() {
  const scenario = MANEUVER_SCENARIOS[scenarioId];
  const engine = selectedEngine();
  description.textContent = `${scenario.description} ${engine.description}`;
  element("#engine-model").textContent = engine.shortTitle;
  element("#engine-provenance").textContent = engine.provenance === "reference-derived"
    ? "Reference-derived"
    : "Procedural prototype";
  timeline.max = String(scenario.duration);
  timeline.value = String(playhead);
  element("#segment-track").replaceChildren(...segments.map((segment, index) => {
    const marker = document.createElement("span");
    const nextStart = segments[index + 1]?.start ?? scenario.duration;
    marker.style.left = `${segment.start / scenario.duration * 100}%`;
    marker.style.width = `${(nextStart - segment.start) / scenario.duration * 100}%`;
    marker.textContent = segment.label;
    return marker;
  }));
  updatePlayButton();
}

async function setPlaying(nextPlaying: boolean) {
  if (nextPlaying && playhead >= MANEUVER_SCENARIOS[scenarioId].duration) playhead = 0;
  if (nextPlaying) {
    const requestedAudio = ensureAudio();
    if (requestedAudio) {
      playButton.textContent = "Loading sound…";
      playButton.disabled = true;
      await requestedAudio.whenReady();
      playButton.disabled = false;
      if (audio !== requestedAudio) return;
    }
  }
  playing = nextPlaying;
  if (playing) audio?.setPaused(false);
  else audio?.setPaused(true);
  updatePlayButton();
}

function updatePlayButton() {
  playButton.textContent = playing ? "Pause" : "Play";
  playButton.setAttribute("aria-pressed", String(playing));
}

async function replay() {
  playhead = 0;
  resetLandmarks();
  clearSpectrogram();
  ensureAudio();
  audio?.reset();
  await setPlaying(true);
  logEvent("Run started");
}

function updateAudio(sample: ManeuverTraceSample, dt: number) {
  audio?.update({
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

function updateLandmarks(sample: ManeuverTraceSample) {
  const segment = maneuverSegmentAt(segments, sample.time).label;
  if (segment !== previousSegment) {
    previousSegment = segment;
    logEvent(segment);
  }
  if (sample.phase !== previousPhase) {
    logEvent(`Drift phase: ${previousPhase} → ${sample.phase}`);
    previousPhase = sample.phase;
  }
  const gear = audio?.getTelemetry().gear ?? 1;
  if (gear !== previousGear) {
    logEvent(`Gear ${previousGear} → ${gear} · ${Math.round(audio?.getTelemetry().rpm ?? 0)} RPM`);
    previousGear = gear;
  }
}

function resetLandmarks() {
  previousSegment = "";
  previousPhase = trace[0].phase;
  previousGear = 1;
}

function logEvent(message: string) {
  const item = document.createElement("li");
  item.textContent = `${playhead.toFixed(2)}s — ${message}`;
  eventLog.prepend(item);
}

function renderFrame(sample: ManeuverTraceSample) {
  timeline.value = String(playhead);
  timelineOutput.value = `${playhead.toFixed(2)} / ${MANEUVER_SCENARIOS[scenarioId].duration.toFixed(2)}`;
  const telemetry = audio?.getTelemetry();
  element("#time-readout").textContent = playhead.toFixed(2);
  element("#segment-readout").textContent = maneuverSegmentAt(segments, playhead).label;
  element("#speed-readout").textContent = sample.speed.toFixed(1);
  element("#gear-readout").textContent = String(telemetry?.gear ?? 1);
  element("#rpm-readout").textContent = String(Math.round(telemetry?.rpm ?? 900));
  element("#slip-readout").textContent = `${sample.signedSlipDegrees.toFixed(1)}°`;
  element("#load-readout").textContent = `${Math.round((telemetry?.load ?? 0) * 100)}%`;
  element("#phase-readout").textContent = titleCase(sample.phase);
  drawPath(sample);
  drawTelemetryChart(sample.time);
}

function traceBounds() {
  let minimumX = Infinity;
  let maximumX = -Infinity;
  let minimumZ = Infinity;
  let maximumZ = -Infinity;
  for (const sample of trace) {
    minimumX = Math.min(minimumX, sample.position.x);
    maximumX = Math.max(maximumX, sample.position.x);
    minimumZ = Math.min(minimumZ, sample.position.z);
    maximumZ = Math.max(maximumZ, sample.position.z);
  }
  const width = Math.max(18, maximumX - minimumX);
  const height = Math.max(18, maximumZ - minimumZ);
  return {
    centerX: (minimumX + maximumX) / 2,
    centerZ: (minimumZ + maximumZ) / 2,
    scale: Math.min((pathCanvas.width - 100) / width, (pathCanvas.height - 100) / height),
  };
}

function drawPath(current: ManeuverTraceSample) {
  const { width, height } = pathCanvas;
  pathContext.fillStyle = "#09120e";
  pathContext.fillRect(0, 0, width, height);
  pathContext.strokeStyle = "rgba(139, 166, 147, 0.09)";
  pathContext.lineWidth = 1;
  for (let x = 40; x < width; x += 60) { pathContext.beginPath(); pathContext.moveTo(x, 0); pathContext.lineTo(x, height); pathContext.stroke(); }
  for (let y = 40; y < height; y += 60) { pathContext.beginPath(); pathContext.moveTo(0, y); pathContext.lineTo(width, y); pathContext.stroke(); }
  const bounds = traceBounds();
  const point = (sample: ManeuverTraceSample) => ({
    x: width / 2 + (sample.position.x - bounds.centerX) * bounds.scale,
    y: height / 2 - (sample.position.z - bounds.centerZ) * bounds.scale,
  });
  pathContext.lineWidth = 4;
  pathContext.lineCap = "round";
  for (let index = 1; index < trace.length; index++) {
    const from = point(trace[index - 1]);
    const to = point(trace[index]);
    pathContext.strokeStyle = phaseColor(trace[index].phase, 0.72);
    pathContext.beginPath();
    pathContext.moveTo(from.x, from.y);
    pathContext.lineTo(to.x, to.y);
    pathContext.stroke();
  }
  const marker = point(current);
  const vectorScale = Math.max(18, Math.min(55, current.speed * 1.7));
  pathContext.strokeStyle = "#62cbd2";
  pathContext.lineWidth = 3;
  pathContext.beginPath();
  pathContext.moveTo(marker.x, marker.y);
  pathContext.lineTo(marker.x + Math.sin(current.heading) * vectorScale, marker.y - Math.cos(current.heading) * vectorScale);
  pathContext.stroke();
  const velocityHeading = Math.atan2(current.velocity.x, current.velocity.z);
  pathContext.strokeStyle = "#f3b45f";
  pathContext.beginPath();
  pathContext.moveTo(marker.x, marker.y);
  pathContext.lineTo(marker.x + Math.sin(velocityHeading) * vectorScale, marker.y - Math.cos(velocityHeading) * vectorScale);
  pathContext.stroke();
  pathContext.save();
  pathContext.translate(marker.x, marker.y);
  pathContext.rotate(current.heading);
  pathContext.fillStyle = "#ec583f";
  pathContext.strokeStyle = "#f8e8dc";
  pathContext.lineWidth = 2;
  pathContext.beginPath();
  pathContext.roundRect(-10, -18, 20, 36, 5);
  pathContext.fill();
  pathContext.stroke();
  pathContext.fillStyle = "#f8e8dc";
  pathContext.fillRect(-6, -14, 12, 3);
  pathContext.restore();
  pathContext.fillStyle = "rgba(225, 237, 226, 0.75)";
  pathContext.font = "700 16px ui-monospace, monospace";
  pathContext.fillText(`${current.speed.toFixed(1)} m/s`, 24, 30);
}

function drawTelemetryChart(time: number) {
  const { width, height } = chartCanvas;
  chartContext.fillStyle = "#09120e";
  chartContext.fillRect(0, 0, width, height);
  chartContext.strokeStyle = "rgba(139, 166, 147, 0.12)";
  chartContext.lineWidth = 1;
  for (let y = 35; y < height; y += 48) { chartContext.beginPath(); chartContext.moveTo(0, y); chartContext.lineTo(width, y); chartContext.stroke(); }
  drawTraceLine("#a8e17d", (sample) => 1 - sample.speed / 35);
  drawTraceLine("#f4b867", (sample) => 0.5 - sample.signedSlipDegrees / 110);
  drawTraceLine("#65c4d0", (sample) => 0.5 - sample.steering / 2.2);
  const x = time / MANEUVER_SCENARIOS[scenarioId].duration * width;
  chartContext.strokeStyle = "rgba(255,255,255,.78)";
  chartContext.lineWidth = 2;
  chartContext.beginPath(); chartContext.moveTo(x, 0); chartContext.lineTo(x, height); chartContext.stroke();
}

function drawTraceLine(color: string, valueAt: (sample: ManeuverTraceSample) => number) {
  chartContext.strokeStyle = color;
  chartContext.lineWidth = 2.5;
  chartContext.beginPath();
  trace.forEach((sample, index) => {
    const x = sample.time / MANEUVER_SCENARIOS[scenarioId].duration * chartCanvas.width;
    const y = Math.max(8, Math.min(chartCanvas.height - 8, valueAt(sample) * chartCanvas.height));
    if (index === 0) chartContext.moveTo(x, y); else chartContext.lineTo(x, y);
  });
  chartContext.stroke();
}

function drawSpectrogram(time: number) {
  if (!audio || !spectrum) return;
  const analyser = audio.getAnalyser();
  analyser.getByteFrequencyData(spectrum);
  const targetX = Math.max(
    spectrumCursor + 1,
    Math.round(time / MANEUVER_SCENARIOS[scenarioId].duration * spectrogram.width),
  );
  const columnWidth = Math.max(1, targetX - spectrumCursor);
  for (let y = 0; y < spectrogram.height; y++) {
    const normalized = 1 - y / (spectrogram.height - 1);
    const frequency = 50 * (10_000 / 50) ** normalized;
    const bin = Math.min(spectrum.length - 1, Math.round(frequency / (analyser.context.sampleRate / 2) * spectrum.length));
    const value = spectrum[bin] / 255;
    spectrumContext.fillStyle = `rgb(${Math.round(13 + value * 230)} ${Math.round(22 + value * value * 185)} ${Math.round(19 + Math.max(0, value - 0.5) * 170)})`;
    spectrumContext.fillRect(spectrumCursor, y, columnWidth, 1);
  }
  spectrumCursor = Math.min(spectrogram.width, targetX);
}

function clearSpectrogram() {
  spectrumCursor = 0;
  spectrumContext.fillStyle = "#09120e";
  spectrumContext.fillRect(0, 0, spectrogram.width, spectrogram.height);
}

function phaseColor(phase: ManeuverTraceSample["phase"], alpha: number) {
  const colors = { grip: `rgba(154, 199, 127, ${alpha})`, breakaway: `rgba(245, 174, 84, ${alpha})`, sustain: `rgba(238, 83, 59, ${alpha})`, transition: `rgba(96, 198, 210, ${alpha})`, recover: `rgba(183, 135, 220, ${alpha})` };
  return colors[phase];
}
function titleCase(value: string) { return value[0].toUpperCase() + value.slice(1); }

function copyTrace() {
  const payload = {
    scenario: { ...MANEUVER_SCENARIOS[scenarioId], segments },
    profile: selectedProfile(),
    engine: selectedEngine(),
    audioIsolation,
    sampleRate: 120,
    transmissionTuning: tuning,
    samples: trace,
  };
  void navigator.clipboard.writeText(JSON.stringify(payload)).then(() => {
    element<HTMLButtonElement>("#copy-trace").textContent = "Trace copied";
    setTimeout(() => { element<HTMLButtonElement>("#copy-trace").textContent = "Copy trace JSON"; }, 1300);
  });
}

audioButton.addEventListener("click", ensureAudio);
document.querySelectorAll<HTMLButtonElement>("[data-audio-isolation]").forEach((button) => {
  button.addEventListener("click", () => {
    const requested = button.dataset.audioIsolation;
    if (requested !== "mix" && requested !== "engine" && requested !== "tires") return;
    audioIsolation = requested;
    audio?.setIsolation(audioIsolation);
    document.querySelectorAll<HTMLButtonElement>("[data-audio-isolation]").forEach((option) => {
      option.setAttribute("aria-pressed", String(option.dataset.audioIsolation === audioIsolation));
    });
    logEvent(`Audio isolation: ${button.textContent?.trim() ?? audioIsolation}`);
  });
});
element("#reload-tuning").addEventListener("click", () => {
  tuning = effectiveTransmissionTuning();
  recreateAudio();
  audio?.reset();
  logEvent("Dyno tuning reloaded");
});
playButton.addEventListener("click", () => { void setPlaying(!playing); });
element("#replay").addEventListener("click", () => { void replay(); });
element("#copy-trace").addEventListener("click", copyTrace);
element("#clear-events").addEventListener("click", () => eventLog.replaceChildren());
engineSelect.addEventListener("change", () => {
  engineId = engineSelect.value as EngineTypeId;
  recreateAudio();
  selectScenario(scenarioId);
});
profileSelect.addEventListener("change", () => {
  recreateAudio();
  selectScenario(scenarioId);
});
timeline.addEventListener("input", () => {
  setPlaying(false);
  playhead = Number(timeline.value);
  resetLandmarks();
  audio?.reset();
  clearSpectrogram();
  spectrumCursor = playhead / MANEUVER_SCENARIOS[scenarioId].duration * spectrogram.width;
  renderFrame(sampleManeuverTrace(trace, playhead));
});

function frame(now: number) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  if (playing) {
    playhead += dt;
    const duration = MANEUVER_SCENARIOS[scenarioId].duration;
    if (playhead >= duration) {
      if (loopInput.checked) {
        playhead %= duration;
        audio?.reset();
        resetLandmarks();
        logEvent("Loop restarted");
      } else {
        playhead = duration;
        setPlaying(false);
        logEvent("Run complete");
      }
    }
    const sample = sampleManeuverTrace(trace, playhead);
    updateAudio(sample, dt);
    updateLandmarks(sample);
    renderFrame(sample);
    drawSpectrogram(playhead);
  }
  requestAnimationFrame(frame);
}

clearSpectrogram();
populateEngineSelect();
renderScenarioButtons();
renderScenarioMetadata();
renderFrame(trace[0]);
requestAnimationFrame(frame);

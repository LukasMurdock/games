import * as THREE from "three";

export type ChaseHud = {
  showWaiting: () => void;
  showActive: (status: {
    survivalTime: number;
    nearestDistance: number;
    reinforcements: boolean;
  }) => void;
  showCaptured: (survivalTime: number) => void;
  destroy: () => void;
};

export function createChaseHud(root: HTMLElement): ChaseHud {
  const hud = document.createElement("div");
  hud.className = "chase-status";
  hud.hidden = true;
  const label = document.createElement("span");
  label.className = "chase-status__label";
  const timer = document.createElement("strong");
  timer.className = "chase-status__timer";
  timer.setAttribute("aria-hidden", "true");
  const message = document.createElement("span");
  message.className = "chase-status__message";
  const meter = document.createElement("span");
  meter.className = "chase-status__meter";
  meter.setAttribute("aria-hidden", "true");
  const meterFill = document.createElement("span");
  meter.append(meterFill);
  hud.append(label, timer, message, meter);
  root.append(hud);

  let currentLabel = "";
  let currentMessage = "";
  let currentTimer = "";
  let currentMeter = "";

  // The HUD updates every frame; only touch the DOM when a visible value actually changes.
  function setTimer(seconds: number) {
    const nextTimer = formatTime(seconds);
    if (nextTimer === currentTimer) return;
    currentTimer = nextTimer;
    timer.textContent = nextTimer;
  }

  function setMeter(pressure: number) {
    const nextMeter = `scaleX(${pressure.toFixed(2)})`;
    if (nextMeter === currentMeter) return;
    currentMeter = nextMeter;
    meterFill.style.transform = nextMeter;
  }

  function setState(hidden: boolean, state: string, pressure?: string) {
    if (hud.hidden !== hidden) hud.hidden = hidden;
    if (hud.dataset.state !== state) hud.dataset.state = state;
    if (pressure !== undefined && hud.dataset.pressure !== pressure) hud.dataset.pressure = pressure;
  }

  function setLabel(nextLabel: string) {
    if (nextLabel === currentLabel) return;
    currentLabel = nextLabel;
    label.textContent = nextLabel;
  }

  function setMessage(nextMessage: string) {
    if (nextMessage === currentMessage) return;
    currentMessage = nextMessage;
    message.textContent = nextMessage;
  }

  return {
    showWaiting() {
      setState(true, "waiting");
    },
    showActive({ survivalTime, nearestDistance, reinforcements }) {
      setState(false, "active", getPressureLevel(nearestDistance));
      setLabel("Pursuit");
      setTimer(survivalTime);
      setMeter(1 - THREE.MathUtils.smoothstep(nearestDistance, 7, 45));
      setMessage(getPursuitMessage(reinforcements, nearestDistance));
    },
    showCaptured(survivalTime) {
      setState(false, "captured", "danger");
      setLabel("Pursuit ended");
      setTimer(survivalTime);
      setMessage("Caught");
      setMeter(1);
    },
    destroy() {
      hud.remove();
    },
  };
}

function getPursuitMessage(reinforcements: boolean, nearestDistance: number) {
  if (reinforcements) return "More units joining";
  if (nearestDistance < 8) return "Right behind you";
  if (nearestDistance < 18) return "Closing in";
  if (nearestDistance < 36) return "Keep moving";
  return "Pulling away";
}

function getPressureLevel(nearestDistance: number) {
  if (nearestDistance < 8) return "danger";
  if (nearestDistance < 18) return "close";
  return "open";
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.max(0, seconds - minutes * 60);
  return `${minutes}:${remainder.toFixed(1).padStart(4, "0")}`;
}

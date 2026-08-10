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
      hud.hidden = true;
      hud.dataset.state = "waiting";
    },
    showActive({ survivalTime, nearestDistance, reinforcements }) {
      hud.hidden = false;
      hud.dataset.state = "active";
      setLabel("Pursuit");
      timer.textContent = formatTime(survivalTime);
      const pressure = 1 - THREE.MathUtils.smoothstep(nearestDistance, 7, 45);
      meterFill.style.transform = `scaleX(${pressure.toFixed(3)})`;
      setMessage(getPursuitMessage(reinforcements, nearestDistance));
      hud.dataset.pressure = getPressureLevel(nearestDistance);
    },
    showCaptured(survivalTime) {
      hud.hidden = false;
      hud.dataset.state = "captured";
      hud.dataset.pressure = "danger";
      setLabel("Pursuit ended");
      timer.textContent = formatTime(survivalTime);
      setMessage("Caught");
      meterFill.style.transform = "scaleX(1)";
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

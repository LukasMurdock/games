import * as THREE from "three";
import { createDriftSmoke, createSkidMarks } from "../vehicle/effects";
import { createVehicleView, type VehicleView } from "../vehicle/vehicle-view";
import type { AuthoritativeDrivingSnapshot } from "./simulation";

export type AuthoritativeVehicleFleet = {
  readonly size: number;
  update(snapshot: AuthoritativeDrivingSnapshot, dt: number): void;
  destroy(): void;
};

type VehicleNameTag = {
  sprite: THREE.Sprite;
  setLabel(label: string): void;
  destroy(): void;
};

type VehiclePresentation = {
  view: VehicleView;
  smoke: ReturnType<typeof createDriftSmoke>;
  skidMarks: ReturnType<typeof createSkidMarks>;
  nameTag?: VehicleNameTag;
  previousPosition: THREE.Vector3;
};

export type AuthoritativeVehicleFleetOptions = {
  getPlayerLabel?: (playerId: string) => string;
};

/** Owns one render-only car, nameplate, and effects presentation per authoritative player. */
export function createAuthoritativeVehicleFleet(
  scene: THREE.Scene,
  options: AuthoritativeVehicleFleetOptions = {},
): AuthoritativeVehicleFleet {
  const presentations = new Map<string, VehiclePresentation>();

  function destroyPresentation(presentation: VehiclePresentation) {
    presentation.view.destroy();
    presentation.smoke.destroy();
    presentation.skidMarks.destroy();
    presentation.nameTag?.destroy();
  }

  return {
    get size() {
      return presentations.size;
    },
    update(snapshot, dt) {
      const active = new Set<string>();
      const paused = snapshot.paused === true;
      for (const player of snapshot.players) {
        active.add(player.playerId);
        const position = new THREE.Vector3(player.position[0], 0.06, player.position[1]);
        let presentation = presentations.get(player.playerId);
        if (!presentation) {
          const view = createVehicleView(scene);
          view.reset({ x: player.position[0], z: player.position[1] }, player.heading);
          presentation = {
            view,
            smoke: createDriftSmoke(scene),
            skidMarks: createSkidMarks(scene),
            ...(options.getPlayerLabel
              ? { nameTag: createVehicleNameTag(scene, options.getPlayerLabel(player.playerId)) }
              : {}),
            previousPosition: position.clone(),
          };
          presentations.set(player.playerId, presentation);
        }
        presentation.view.applyAuthoritativeSnapshot(player, dt, paused);
        if (presentation.nameTag) {
          presentation.nameTag.setLabel(options.getPlayerLabel?.(player.playerId) ?? player.playerId);
          presentation.nameTag.sprite.position.set(player.position[0], 2.35, player.position[1]);
        }
        const distance = paused ? 0 : position.distanceTo(presentation.previousPosition);
        const slipDegrees = Math.abs(THREE.MathUtils.radToDeg(player.visualSlip));
        const slipIntensity = paused
          ? 0
          : THREE.MathUtils.clamp((slipDegrees - 5) / 30, 0, 1)
            * THREE.MathUtils.clamp(player.speed / 10, 0, 1);
        presentation.smoke.update(paused ? 0 : dt, position, player.heading, slipIntensity, player.speed);
        presentation.skidMarks.update(position, player.heading, slipIntensity, distance);
        presentation.previousPosition.copy(position);
      }
      for (const [playerId, presentation] of presentations) {
        if (active.has(playerId)) continue;
        destroyPresentation(presentation);
        presentations.delete(playerId);
      }
    },
    destroy() {
      for (const presentation of presentations.values()) destroyPresentation(presentation);
      presentations.clear();
    },
  };
}

function createVehicleNameTag(scene: THREE.Scene, initialLabel: string): VehicleNameTag {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Vehicle nameplate canvas is unavailable.");
  const drawingContext = context;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.8, 0.7, 1);
  sprite.renderOrder = 4;
  scene.add(sprite);
  let currentLabel = "";

  function setLabel(label: string) {
    const normalized = label.trim().slice(0, 24) || "Player";
    if (normalized === currentLabel) return;
    currentLabel = normalized;
    drawingContext.clearRect(0, 0, canvas.width, canvas.height);
    drawingContext.fillStyle = "rgba(12, 18, 14, 0.78)";
    drawingContext.fillRect(20, 18, 472, 92);
    drawingContext.strokeStyle = "rgba(231, 245, 217, 0.48)";
    drawingContext.lineWidth = 4;
    drawingContext.strokeRect(20, 18, 472, 92);
    drawingContext.fillStyle = "#f4f8ef";
    drawingContext.font = "700 44px system-ui, sans-serif";
    drawingContext.textAlign = "center";
    drawingContext.textBaseline = "middle";
    drawingContext.fillText(normalized, 256, 65, 430);
    texture.needsUpdate = true;
  }

  setLabel(initialLabel);
  return {
    sprite,
    setLabel,
    destroy() {
      scene.remove(sprite);
      texture.dispose();
      material.dispose();
    },
  };
}

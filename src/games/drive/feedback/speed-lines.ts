type SpeedLineSeed = {
  angle: number;
  width: number;
  inset: number;
  brightness: number;
  pulseRate: number;
  phase: number;
};

type SpeedLineFrame = {
  dt: number;
  enabled: boolean;
  intensity: number;
  focusX: number;
  focusY: number;
  boosting: boolean;
};

export type SpeedLines = {
  resize: (width: number, height: number) => void;
  update: (frame: SpeedLineFrame) => void;
  destroy: () => void;
};

const LINE_COLOR = "#f3e7bd";
const LINE_COUNT = 30;
const PATTERN_INTERVAL = 1 / 24;

function patternNoise(line: number, revision: number, channel: number) {
  let value = Math.imul(line + 1, 0x45d9f3b)
    ^ Math.imul(revision + 1, 0x27d4eb2d)
    ^ Math.imul(channel + 1, 0x165667b1);
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

export function createSpeedLines(canvas: HTMLCanvasElement): SpeedLines {
  const context = canvas.getContext("2d", { alpha: true });
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let width = 1;
  let height = 1;
  let intensity = 0;
  let time = 0;
  let patternAccumulator = 0;
  let patternRevision = 0;
  let randomState = 0x8d31a47f;
  const random = () => {
    randomState = (1664525 * randomState + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  const seeds: SpeedLineSeed[] = Array.from({ length: LINE_COUNT }, (_, index) => ({
    angle: (index / LINE_COUNT) * Math.PI * 2 + (random() - 0.5) * 0.15,
    width: 1.5 + random() * 5.5,
    inset: random(),
    brightness: 0.55 + random() * 0.45,
    pulseRate: 3.5 + random() * 5,
    phase: random() * Math.PI * 2,
  }));

  return {
    resize(nextWidth, nextHeight) {
      width = Math.max(1, Math.round(nextWidth));
      height = Math.max(1, Math.round(nextHeight));
      // Deliberately render at CSS-pixel resolution: the graphic effect stays cheap and slightly crisp/pixel-like.
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
    },
    update(frame) {
      if (!context) return;
      if (!frame.enabled || reducedMotion.matches) {
        intensity = 0;
        context.clearRect(0, 0, width, height);
        return;
      }
      const target = Math.max(0, Math.min(1, frame.intensity));
      const response = target > intensity ? 0.08 : 0.22;
      intensity += (target - intensity) * (1 - Math.exp(-frame.dt / response));
      time += frame.dt;
      patternAccumulator += frame.dt;
      if (patternAccumulator >= PATTERN_INTERVAL) {
        const revisions = Math.floor(patternAccumulator / PATTERN_INTERVAL);
        patternRevision += revisions;
        patternAccumulator -= revisions * PATTERN_INTERVAL;
      }
      context.clearRect(0, 0, width, height);
      if (intensity < 0.005) return;

      const minimumDimension = Math.min(width, height);
      const clearRadius = minimumDimension * 0.18;
      const diagonal = Math.hypot(width, height);
      const boostExtension = frame.boosting ? 0.16 : 0;
      context.fillStyle = LINE_COLOR;

      for (let lineIndex = 0; lineIndex < seeds.length; lineIndex++) {
        const seed = seeds[lineIndex];
        const angleJitter = (patternNoise(lineIndex, patternRevision, 0) - 0.5) * 0.055;
        const widthJitter = 0.68 + patternNoise(lineIndex, patternRevision, 1) * 0.74;
        const radialJitter = patternNoise(lineIndex, patternRevision, 2);
        const frameBrightness = 0.72 + patternNoise(lineIndex, patternRevision, 3) * 0.28;
        const pulse = 0.68 + Math.sin(time * seed.pulseRate + seed.phase) * 0.32;
        if (patternNoise(lineIndex, patternRevision, 4) < 0.1 || (pulse < 0.48 && intensity < 0.75)) continue;
        const directionX = Math.cos(seed.angle + angleJitter);
        const directionY = Math.sin(seed.angle + angleJitter);
        const perpendicularX = -directionY;
        const perpendicularY = directionX;
        const inwardRetreat = (1 - intensity) * minimumDimension * 0.27;
        const innerRadius = clearRadius
          + inwardRetreat
          + (seed.inset * 0.82 + radialJitter * 0.18)
            * minimumDimension
            * (0.09 + (1 - intensity) * 0.08);
        const outerRadius = diagonal
          * (0.66 + seed.inset * 0.18 + radialJitter * 0.08 + boostExtension);
        const innerWidth = seed.width * widthJitter * (0.22 + intensity * 0.18);
        const outerWidth = seed.width * widthJitter * (1.1 + intensity * 0.65);
        const innerX = frame.focusX + directionX * innerRadius;
        const innerY = frame.focusY + directionY * innerRadius;
        const outerX = frame.focusX + directionX * outerRadius;
        const outerY = frame.focusY + directionY * outerRadius;

        context.globalAlpha = intensity * 0.24 * seed.brightness * pulse * frameBrightness;
        context.beginPath();
        context.moveTo(innerX + perpendicularX * innerWidth, innerY + perpendicularY * innerWidth);
        context.lineTo(outerX + perpendicularX * outerWidth, outerY + perpendicularY * outerWidth);
        context.lineTo(outerX - perpendicularX * outerWidth, outerY - perpendicularY * outerWidth);
        context.lineTo(innerX - perpendicularX * innerWidth, innerY - perpendicularY * innerWidth);
        context.closePath();
        context.fill();
      }
      context.globalAlpha = 1;
    },
    destroy() {
      if (context) context.clearRect(0, 0, width, height);
      canvas.width = 1;
      canvas.height = 1;
    },
  };
}

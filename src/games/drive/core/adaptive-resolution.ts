export type AdaptiveResolutionOptions = {
  minimumScale?: number;
  /** Frames per evaluation window. */
  windowSize?: number;
  /** Median frame interval above which the scale steps down. */
  slowFrameMilliseconds?: number;
  /** Median frame interval below which the scale may step back up. */
  smoothFrameMilliseconds?: number;
  /** Minimum time between an adjustment and the next increase. */
  increaseCooldownMilliseconds?: number;
};

/**
 * Chooses a render-resolution multiplier from observed frame pacing.
 *
 * Sustained slow frames step the scale down quickly; consistently smooth frames let it
 * recover slowly toward the highest scale that last held up. When the main thread itself
 * consumes most of each frame, lowering the pixel count cannot help, so the scale is left alone.
 */
export class AdaptiveResolution {
  scale = 1;
  private ceiling = 1;
  private lastChange = Number.NEGATIVE_INFINITY;
  private lastIncrease = Number.NEGATIVE_INFINITY;
  private readonly intervals: number[] = [];
  private readonly workTimes: number[] = [];
  private readonly minimumScale: number;
  private readonly windowSize: number;
  private readonly slowFrame: number;
  private readonly smoothFrame: number;
  private readonly increaseCooldown: number;

  constructor(options: AdaptiveResolutionOptions = {}) {
    this.minimumScale = options.minimumScale ?? 0.6;
    this.windowSize = options.windowSize ?? 90;
    this.slowFrame = options.slowFrameMilliseconds ?? 20;
    this.smoothFrame = options.smoothFrameMilliseconds ?? 17.5;
    this.increaseCooldown = options.increaseCooldownMilliseconds ?? 5000;
  }

  /** Discards a partial window, e.g. while paused or after a tab switch. */
  interrupt() {
    this.intervals.length = 0;
    this.workTimes.length = 0;
  }

  /**
   * Records one frame and returns true when `scale` changed.
   * @param intervalMilliseconds time since the previous frame started
   * @param workMilliseconds main-thread time spent producing the previous frame
   */
  sample(now: number, intervalMilliseconds: number, workMilliseconds: number) {
    if (intervalMilliseconds > 1000) {
      this.interrupt();
      return false;
    }
    this.intervals.push(intervalMilliseconds);
    this.workTimes.push(workMilliseconds);
    if (this.intervals.length < this.windowSize) return false;
    const interval = median(this.intervals);
    const work = median(this.workTimes);
    this.interrupt();

    let nextScale = this.scale;
    const mainThreadBound = work > interval * 0.7;
    if (interval > this.slowFrame && !mainThreadBound && this.scale > this.minimumScale) {
      // Falling behind right after an increase means that step was too ambitious.
      if (now - this.lastIncrease < this.increaseCooldown) this.ceiling = Math.max(this.minimumScale, this.scale - 0.1);
      nextScale = Math.max(this.minimumScale, this.scale - 0.15);
    } else if (
      interval < this.smoothFrame
      && this.scale < this.ceiling
      && now - this.lastChange > this.increaseCooldown
    ) {
      nextScale = Math.min(this.ceiling, this.scale + 0.1);
      this.lastIncrease = now;
    }
    if (nextScale === this.scale) return false;
    this.scale = nextScale;
    this.lastChange = now;
    return true;
  }
}

function median(values: number[]) {
  values.sort((left, right) => left - right);
  return values[values.length >> 1];
}

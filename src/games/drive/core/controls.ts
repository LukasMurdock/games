export type DrivingControlName = "left" | "right" | "handbrake" | "accelerate" | "brake";

export type DrivingControls = Readonly<Record<DrivingControlName, boolean>>;

export type DrivingControlChange = {
  hardDriftDoubleTap: boolean;
};

export type DrivingControlState = {
  readonly pressed: DrivingControls;
  set(name: DrivingControlName, pressed: boolean): DrivingControlChange;
  clear(): void;
  advance(dt: number): void;
  setDoubleTapWindow(seconds: number): void;
};

export function createDrivingControlState(initialDoubleTapWindow: number): DrivingControlState {
  const pressed: Record<DrivingControlName, boolean> = {
    left: false,
    right: false,
    handbrake: false,
    accelerate: false,
    brake: false,
  };
  let simulationTime = 0;
  let doubleTapWindow = initialDoubleTapWindow;
  let lastSteerTapTime = Number.NEGATIVE_INFINITY;
  let lastSteerTapDirection = 0;

  return {
    pressed,
    set(name, nextPressed) {
      let hardDriftDoubleTap = false;
      if ((name === "left" || name === "right") && nextPressed && !pressed[name]) {
        const tapDirection = name === "left" ? 1 : -1;
        hardDriftDoubleTap = simulationTime - lastSteerTapTime <= doubleTapWindow
          && tapDirection === lastSteerTapDirection;
        lastSteerTapTime = simulationTime;
        lastSteerTapDirection = tapDirection;
      }
      pressed[name] = nextPressed;
      return { hardDriftDoubleTap };
    },
    clear() {
      for (const name of Object.keys(pressed) as DrivingControlName[]) pressed[name] = false;
      lastSteerTapTime = Number.NEGATIVE_INFINITY;
      lastSteerTapDirection = 0;
    },
    advance(dt) {
      if (Number.isFinite(dt) && dt > 0) simulationTime += dt;
    },
    setDoubleTapWindow(seconds) {
      if (Number.isFinite(seconds) && seconds >= 0) doubleTapWindow = seconds;
    },
  };
}

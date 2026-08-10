export type TransmissionCharacterTuning = {
  ratios: number[];
  rpmFloors: number[];
  audibleUpshifts: boolean[];
  shiftPeakRpm: number;
  topRpm: number;
  shiftCutDuration: number;
  shiftStrength: number;
  shiftNoiseVolume: number;
  shiftThumpVolume: number;
};

export type TransmissionTuning = {
  cruise: TransmissionCharacterTuning;
  aggressive: TransmissionCharacterTuning;
  launchCutDuration: number;
  launchCutStrength: number;
  shiftRecoveryDuration: number;
  shiftNoiseDuration: number;
  shiftThumpDuration: number;
  shiftRearmDuration: number;
  downshiftHysteresis: number;
  recoveryShiftInhibit: number;
  recoveryConfirmation: number;
  driftSpeedBlend: number;
  driftDownshift: boolean;
  downshiftPunch: number;
  downshiftNoiseVolume: number;
  downshiftNoiseDuration: number;
  downshiftThumpVolume: number;
  downshiftThumpDuration: number;
  topGearWanderScale: number;
};

export const DEFAULT_TRANSMISSION_TUNING: TransmissionTuning = {
  cruise: {
    ratios: [0, 0.46, 0.71, 0.88, 1],
    rpmFloors: [2200, 5200, 5700, 5600],
    audibleUpshifts: [true, true, true],
    shiftPeakRpm: 7600,
    topRpm: 6800,
    shiftCutDuration: 0.08,
    shiftStrength: 0.64,
    shiftNoiseVolume: 0.052,
    shiftThumpVolume: 0.06,
  },
  aggressive: {
    ratios: [0, 0.44, 0.69, 0.86, 1],
    rpmFloors: [2200, 5200, 5700, 5600],
    audibleUpshifts: [true, true, true],
    shiftPeakRpm: 7800,
    topRpm: 7800,
    shiftCutDuration: 0.065,
    shiftStrength: 0.76,
    shiftNoiseVolume: 0.065,
    shiftThumpVolume: 0.075,
  },
  launchCutDuration: 0.025,
  launchCutStrength: 0.14,
  shiftRecoveryDuration: 0.045,
  shiftNoiseDuration: 0.05,
  shiftThumpDuration: 0.09,
  shiftRearmDuration: 0.32,
  downshiftHysteresis: 0.06,
  recoveryShiftInhibit: 0.24,
  recoveryConfirmation: 0.18,
  driftSpeedBlend: 0.3,
  driftDownshift: true,
  downshiftPunch: 0.9,
  downshiftNoiseVolume: 0.052,
  downshiftNoiseDuration: 0.06,
  downshiftThumpVolume: 0.065,
  downshiftThumpDuration: 0.1,
  topGearWanderScale: 1.8,
};

export function cloneTransmissionTuning(tuning = DEFAULT_TRANSMISSION_TUNING): TransmissionTuning {
  return structuredClone(tuning);
}

import {
  cloneTransmissionTuning,
  type TransmissionTuning,
} from "./transmission-tuning";

export type EngineInductionDefinition = {
  type: "naturally-aspirated" | "turbo" | "supercharged";
  spoolStartRpm: number;
  spoolFullRpm: number;
  whistleBaseHz: number;
  whistleRangeHz: number;
  whistleVolume: number;
  wastegateVolume: number;
};

/** Structured-clone-safe data passed into the generic order-synthesis AudioWorklet. */
export type EngineSynthesisDefinition = {
  idleRpm: number;
  redlineRpm: number;
  limiterRpm: number;
  orderFundamental: number;
  tableCentersRpm: number[];
  orderTables: number[][];
  cylinderStrength: number[];
  idleHuntRpm: number;
  tonalBase: number;
  tonalLoad: number;
  turbulence: number;
  mechanicalVolume: number;
  driveBase: number;
  driveLoad: number;
  outputGain: number;
  stereoWidth: number;
  induction: EngineInductionDefinition;
};

export type EngineDefinition = {
  id: string;
  title: string;
  shortTitle: string;
  description: string;
  provenance: "reference-derived" | "procedural-prototype";
  synthesis: EngineSynthesisDefinition;
  defaultTransmission: TransmissionTuning;
  outputEq: {
    midFrequencyHz: number;
    midQ: number;
  };
};

const TURBO_I6_ORDER_TABLES = [
  [0,0,0,0,76,255,59,72,57,35,59,127,58,47,49,27,57,102,59,40,40,36,54,85,28,21,41,36,48,75,29,31],
  [0,0,0,29,60,255,84,39,35,35,82,229,60,36,27,28,52,119,45,37,28,26,62,103,45,36,40,30,49,82,28,26],
  [0,0,5,42,78,237,76,57,54,45,116,255,100,35,49,60,63,92,50,53,57,43,80,108,56,29,37,39,52,78,59,76],
  [0,0,41,55,56,188,101,76,80,96,79,255,109,25,27,56,85,202,74,90,60,70,63,133,82,58,107,101,104,109,110,113],
];

function transmission(
  rpmFloors: number[],
  shiftPeakRpm: number,
  topRpm: number,
): TransmissionTuning {
  const tuning = cloneTransmissionTuning();
  tuning.cruise.rpmFloors = [...rpmFloors];
  tuning.aggressive.rpmFloors = [...rpmFloors];
  tuning.cruise.shiftPeakRpm = shiftPeakRpm - 200;
  tuning.aggressive.shiftPeakRpm = shiftPeakRpm;
  tuning.cruise.topRpm = topRpm - 250;
  tuning.aggressive.topRpm = topRpm;
  return tuning;
}

function proceduralOrderTables(
  dominantHarmonic: number,
  brightness: number,
): number[][] {
  return [0.72, 0.86, 1, 1.12].map((rpmEnergy, tableIndex) => (
    Array.from({ length: 32 }, (_, index) => {
      const harmonic = index + 1;
      const multiple = harmonic / dominantHarmonic;
      const firingOrder = Number.isInteger(multiple)
        ? 235 / Math.max(1, multiple ** (1.05 - brightness * 0.2))
        : 0;
      const subharmonic = harmonic === Math.round(dominantHarmonic / 2) ? 48 : 0;
      const texture = ((harmonic * 17 + tableIndex * 29) % 23) * brightness * rpmEnergy;
      const upperGrowth = harmonic > dominantHarmonic
        ? tableIndex * brightness * harmonic * 0.58
        : 0;
      return Math.round(Math.min(255, (firingOrder + subharmonic + texture + upperGrowth) * rpmEnergy));
    })
  ));
}

export const ENGINE_TYPES = {
  turboI6: {
    id: "turbo-i6",
    title: "Reference-derived turbo inline-six",
    shortTitle: "Turbo I6",
    description: "The current Garrett/2JZ-informed order spectrum, cylinder texture, turbo, and limiter model.",
    provenance: "reference-derived",
    synthesis: {
      idleRpm: 900,
      redlineRpm: 7_900,
      limiterRpm: 7_700,
      orderFundamental: 0.5,
      tableCentersRpm: [2_200, 3_600, 5_000, 6_800],
      orderTables: TURBO_I6_ORDER_TABLES,
      cylinderStrength: [1, 0.972, 1.026, 0.988, 1.017, 0.981],
      idleHuntRpm: 18,
      tonalBase: 0.1,
      tonalLoad: 0.18,
      turbulence: 1,
      mechanicalVolume: 0.022,
      driveBase: 1.35,
      driveLoad: 1.25,
      outputGain: 0.5,
      stereoWidth: 0.985,
      induction: {
        type: "turbo",
        spoolStartRpm: 2_700,
        spoolFullRpm: 3_400,
        whistleBaseHz: 1_050,
        whistleRangeHz: 4_100,
        whistleVolume: 0.015,
        wastegateVolume: 0.04,
      },
    },
    defaultTransmission: cloneTransmissionTuning(),
    outputEq: { midFrequencyHz: 1_200, midQ: 1.05 },
  },
  naturallyAspiratedV8: {
    id: "na-v8-prototype",
    title: "Naturally aspirated cross-plane V8 prototype",
    shortTitle: "NA V8 prototype",
    description: "A data-only prototype proving lower-revving V8 firing order, induction, and transmission seams.",
    provenance: "procedural-prototype",
    synthesis: {
      idleRpm: 760,
      redlineRpm: 7_000,
      limiterRpm: 6_850,
      orderFundamental: 0.5,
      tableCentersRpm: [1_600, 3_000, 4_500, 6_200],
      orderTables: proceduralOrderTables(8, 0.7),
      cylinderStrength: [1, 0.94, 1.035, 0.975, 1.02, 0.955, 1.028, 0.97],
      idleHuntRpm: 34,
      tonalBase: 0.13,
      tonalLoad: 0.22,
      turbulence: 1.18,
      mechanicalVolume: 0.018,
      driveBase: 1.5,
      driveLoad: 1.2,
      outputGain: 0.48,
      stereoWidth: 0.978,
      induction: {
        type: "naturally-aspirated",
        spoolStartRpm: 0,
        spoolFullRpm: 1,
        whistleBaseHz: 0,
        whistleRangeHz: 0,
        whistleVolume: 0,
        wastegateVolume: 0,
      },
    },
    defaultTransmission: transmission([1_700, 4_100, 4_700, 4_500], 6_750, 6_400),
    outputEq: { midFrequencyHz: 920, midQ: 0.85 },
  },
  naturallyAspiratedI4: {
    id: "na-i4-prototype",
    title: "High-revving naturally aspirated inline-four prototype",
    shortTitle: "High-rev I4 prototype",
    description: "A data-only prototype with a 2× firing order, high redline, sparse low orders, and no forced induction.",
    provenance: "procedural-prototype",
    synthesis: {
      idleRpm: 1_050,
      redlineRpm: 9_500,
      limiterRpm: 9_300,
      orderFundamental: 0.5,
      tableCentersRpm: [2_800, 4_800, 6_800, 8_800],
      orderTables: proceduralOrderTables(4, 1.15),
      cylinderStrength: [1, 0.965, 1.025, 0.98],
      idleHuntRpm: 12,
      tonalBase: 0.085,
      tonalLoad: 0.16,
      turbulence: 0.72,
      mechanicalVolume: 0.03,
      driveBase: 1.28,
      driveLoad: 1.05,
      outputGain: 0.46,
      stereoWidth: 0.99,
      induction: {
        type: "naturally-aspirated",
        spoolStartRpm: 0,
        spoolFullRpm: 1,
        whistleBaseHz: 0,
        whistleRangeHz: 0,
        whistleVolume: 0,
        wastegateVolume: 0,
      },
    },
    defaultTransmission: transmission([2_800, 6_300, 7_100, 6_900], 9_250, 8_900),
    outputEq: { midFrequencyHz: 1_650, midQ: 1.15 },
  },
} as const satisfies Record<string, EngineDefinition>;

export type EngineTypeId = keyof typeof ENGINE_TYPES;
export const DEFAULT_ENGINE_TYPE: EngineTypeId = "turboI6";

export function getEngineDefinition(id: string): EngineDefinition {
  return ENGINE_TYPES[id as EngineTypeId] ?? ENGINE_TYPES[DEFAULT_ENGINE_TYPE];
}

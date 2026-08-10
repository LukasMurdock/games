export type DrivingProfile = {
  acceleration: number;
  maximumSpeed: number;
  boostedMaximumSpeed: number;
  redlineAtMaximumSpeed: boolean;
  manual: { brakeDeceleration: number; reverseAcceleration: number; maximumReverseSpeed: number };
  inputBuffer: number;
  grip: { lateralGrip: number; drag: number; yawRate: number; yawResponse: number };
  drift: {
    minimumSpeed: number;
    breakawayDuration: number;
    breakawayStartAngle: number;
    breakawayEndAngle: number;
    breakawaySteeringAngle: number;
    breakawayImpulse: number;
    sustainBaseAngle: number;
    sustainChargeAngle: number;
    sustainChargeDelay: number;
    sustainChargeDuration: number;
    sustainIntoAngle: number;
    sustainCounterAngle: number;
    minimumAngle: number;
    maximumAngle: number;
    transitionSteerThreshold: number;
    transitionIntentDuration: number;
    transitionDuration: number;
    transitionAngle: number;
    transitionImpulse: number;
    headingAssist: number;
    assistFalloff: number;
    assistFalloffStartAngle: number;
    assistFalloffRange: number;
    steeringYaw: number;
    yawDamping: number;
    maximumYawRate: number;
    lateralGrip: number;
    corneringGrip: number;
    transitionGrip: number;
    drag: number;
    usefulSlipAngle: number;
    normalPenaltyRange: number;
    normalPenalty: number;
    dangerSlipAngle: number;
    dangerPenaltyRange: number;
    dangerPenalty: number;
  };
  recovery: {
    duration: number;
    headingAssist: number;
    yawDamping: number;
    initialGrip: number;
    finalGrip: number;
    drag: number;
  };
  hardDrift: {
    doubleTapWindow: number;
    inputBuffer: number;
    reentryWindow: number;
    minimumSpeed: number;
    entryDuration: number;
    startAngle: number;
    endAngle: number;
    steeringAngle: number;
    entryImpulse: number;
    lateralGrip: number;
    corneringMultiplier: number;
    entryDrag: number;
    initialSpeedRetention: number;
    kickDecay: number;
  };
  offRoad: { extraDrag: number; minimumGrip: number };
  exitBoost: { duration: number; baseForce: number; qualityForce: number };
};

const BALANCED_PROFILE: DrivingProfile = {
  acceleration: 16,
  maximumSpeed: 25,
  boostedMaximumSpeed: 27,
  redlineAtMaximumSpeed: false,
  manual: { brakeDeceleration: 22, reverseAcceleration: 9, maximumReverseSpeed: 9 },
  inputBuffer: 0.2,
  grip: { lateralGrip: 8.2, drag: 0.46, yawRate: 1.15, yawResponse: 10 },
  drift: {
    minimumSpeed: 6.2,
    breakawayDuration: 0.16,
    breakawayStartAngle: 12,
    breakawayEndAngle: 20,
    breakawaySteeringAngle: 6,
    breakawayImpulse: 8.5,
    sustainBaseAngle: 15,
    sustainChargeAngle: 6,
    sustainChargeDelay: 0.25,
    sustainChargeDuration: 1.4,
    sustainIntoAngle: 23,
    sustainCounterAngle: 23,
    minimumAngle: 7,
    maximumAngle: 44,
    transitionSteerThreshold: 0.55,
    transitionIntentDuration: 0.1,
    transitionDuration: 0.23,
    transitionAngle: 18,
    transitionImpulse: 3.2,
    headingAssist: 36,
    assistFalloff: 0.38,
    assistFalloffStartAngle: 42,
    assistFalloffRange: 14,
    steeringYaw: 1.8,
    yawDamping: 7.2,
    maximumYawRate: 4.2,
    lateralGrip: 0.72,
    corneringGrip: 0.62,
    transitionGrip: 0.52,
    drag: 0.5,
    usefulSlipAngle: 12,
    normalPenaltyRange: 23,
    normalPenalty: 0.46,
    dangerSlipAngle: 40,
    dangerPenaltyRange: 16,
    dangerPenalty: 0.68,
  },
  recovery: { duration: 0.4, headingAssist: 30, yawDamping: 9, initialGrip: 2.2, finalGrip: 9.6, drag: 0.3 },
  hardDrift: {
    doubleTapWindow: 0.27,
    inputBuffer: 0.15,
    reentryWindow: 0.6,
    minimumSpeed: 7,
    entryDuration: 0.2,
    startAngle: 18,
    endAngle: 32,
    steeringAngle: 8,
    entryImpulse: 11.5,
    lateralGrip: 0.45,
    corneringMultiplier: 1.35,
    entryDrag: 0.45,
    initialSpeedRetention: 0.97,
    kickDecay: 0.3,
  },
  offRoad: { extraDrag: 0.18, minimumGrip: 3.2 },
  exitBoost: { duration: 0.7, baseForce: 3.5, qualityForce: 6 },
};

export const DRIVING_PROFILES = {
  balanced: BALANCED_PROFILE,
  loose: {
    ...BALANCED_PROFILE,
    grip: { ...BALANCED_PROFILE.grip, lateralGrip: 7.3, yawRate: 1.25 },
    drift: {
      ...BALANCED_PROFILE.drift,
      minimumSpeed: 5.2,
      sustainBaseAngle: 18,
      maximumAngle: 49,
      headingAssist: 40,
      normalPenalty: 0.35,
      dangerPenalty: 0.58,
    },
    recovery: { ...BALANCED_PROFILE.recovery, duration: 0.48, finalGrip: 8.7 },
  },
  technical: {
    ...BALANCED_PROFILE,
    acceleration: 17,
    maximumSpeed: 26,
    grip: { ...BALANCED_PROFILE.grip, lateralGrip: 9.3, yawRate: 1.08 },
    drift: {
      ...BALANCED_PROFILE.drift,
      minimumSpeed: 7,
      maximumAngle: 40,
      headingAssist: 31,
      transitionDuration: 0.19,
      normalPenalty: 0.55,
      dangerPenalty: 0.82,
    },
    recovery: { ...BALANCED_PROFILE.recovery, duration: 0.32, finalGrip: 10.5 },
  },
  aggressive: {
    ...BALANCED_PROFILE,
    acceleration: 19.5,
    maximumSpeed: 28,
    boostedMaximumSpeed: 31,
    redlineAtMaximumSpeed: true,
    grip: { ...BALANCED_PROFILE.grip, lateralGrip: 7.8, yawRate: 1.24 },
    drift: {
      ...BALANCED_PROFILE.drift,
      minimumSpeed: 6.8,
      breakawayDuration: 0.14,
      breakawayEndAngle: 23,
      breakawayImpulse: 10,
      sustainBaseAngle: 17,
      maximumAngle: 47,
      headingAssist: 38,
      transitionDuration: 0.2,
      normalPenalty: 0.48,
      dangerPenalty: 0.74,
    },
    hardDrift: {
      ...BALANCED_PROFILE.hardDrift,
      minimumSpeed: 7.5,
      endAngle: 35,
      entryImpulse: 13,
      initialSpeedRetention: 0.975,
    },
    recovery: { ...BALANCED_PROFILE.recovery, duration: 0.36, finalGrip: 9.2 },
    exitBoost: { ...BALANCED_PROFILE.exitBoost, baseForce: 4.5, qualityForce: 7 },
  },
} satisfies Record<string, DrivingProfile>;

export type DrivingProfileName = keyof typeof DRIVING_PROFILES;

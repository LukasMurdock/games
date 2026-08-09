export const GAMENET_LIMITS = {
  reliablePacketBytes: 64 * 1024,
  realtimePacketBytes: 16 * 1024,
  maximumDepth: 12,
  maximumMapEntries: 256,
  maximumArrayItems: 1024,
  maximumTextBytes: 256,
  maximumByteStringBytes: 64 * 1024,
  maximumProtocolMajors: 8,
  maximumFeatures: 64,
} as const;

export type GameNetChannel = "reliable" | "realtime";

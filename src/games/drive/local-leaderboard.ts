import type { ControlMode, DriveEndReason } from "./types";

export type { DriveEndReason } from "./types";

const STORAGE_KEY = "driving-game:local-leaderboard:v1";
const MAX_SAVED_DRIVES = 100;

export type LocalDriveResult = {
  id: string;
  durationSeconds: number;
  endedAt: string;
  reason: DriveEndReason;
  mode: string;
  map: string;
  drivingProfile: string;
  controlMode: ControlMode;
};

export type LocalLeaderboardFilter = {
  mode?: string;
  map?: string;
  drivingProfile?: string;
  controlMode?: ControlMode;
  limit?: number;
};

function storageAvailable() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readResults(): LocalDriveResult[] {
  if (!storageAvailable()) return [];
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(stored)) return [];
    return stored.filter((entry) =>
      typeof entry?.id === "string"
      && typeof entry?.durationSeconds === "number"
      && Number.isFinite(entry.durationSeconds)
      && typeof entry?.endedAt === "string"
      && typeof entry?.reason === "string"
      && typeof entry?.mode === "string"
      && typeof entry?.map === "string"
      && typeof entry?.drivingProfile === "string"
    ).map((entry) => ({
      ...entry,
      controlMode: entry.controlMode === "manual" ? "manual" : "automatic",
    }) satisfies LocalDriveResult);
  } catch {
    return [];
  }
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function addLocalDriveResult(
  result: Omit<LocalDriveResult, "id" | "endedAt">,
): LocalDriveResult | null {
  if (!storageAvailable() || result.durationSeconds <= 0) return null;
  const entry: LocalDriveResult = {
    ...result,
    id: createId(),
    durationSeconds: Math.round(result.durationSeconds * 100) / 100,
    endedAt: new Date().toISOString(),
  };
  const results = [...readResults(), entry]
    .sort((a, b) => b.durationSeconds - a.durationSeconds)
    .slice(0, MAX_SAVED_DRIVES);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(results));
    return entry;
  } catch {
    return null;
  }
}

export function getLocalDriveLeaderboard(filter: LocalLeaderboardFilter = {}) {
  const limit = Math.max(0, Math.floor(filter.limit ?? 10));
  return readResults()
    .filter((entry) => !filter.mode || entry.mode === filter.mode)
    .filter((entry) => !filter.map || entry.map === filter.map)
    .filter((entry) => !filter.drivingProfile || entry.drivingProfile === filter.drivingProfile)
    .filter((entry) => !filter.controlMode || entry.controlMode === filter.controlMode)
    .sort((a, b) => b.durationSeconds - a.durationSeconds)
    .slice(0, limit);
}

export function clearLocalDriveLeaderboard() {
  if (!storageAvailable()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be disabled by browser privacy settings.
  }
}

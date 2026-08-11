import { MUSIC_TRACK_02_WORKLET_SOURCE } from "./music-track-02-worklet-source";
import { MUSIC_TRACK_03_WORKLET_SOURCE } from "./music-track-03-worklet-source";
import { MUSIC_TRACK_04_WORKLET_SOURCE } from "./music-track-04-worklet-source";
import { MUSIC_TRACK_05_WORKLET_SOURCE } from "./music-track-05-worklet-source";
import { MUSIC_WORKLET_SOURCE } from "./music-worklet-source";

export type SoundtrackId = "night-signal" | "shadowline" | "bass-canyon" | "midnight-vector" | "glass-circuit";

export type SoundtrackDefinition = {
  id: SoundtrackId;
  title: string;
  subtitle: string;
  bpm: number;
  bars: number;
  processorName: string;
  workletSource: string;
};

export const SOUNDTRACKS: Record<SoundtrackId, SoundtrackDefinition> = {
  "night-signal": {
    id: "night-signal",
    title: "Night Signal",
    subtitle: "Soundtrack 01",
    bpm: 114,
    bars: 112,
    processorName: "driving-music-01",
    workletSource: MUSIC_WORKLET_SOURCE,
  },
  shadowline: {
    id: "shadowline",
    title: "Shadowline",
    subtitle: "Love for Sale · Cole Porter (1930)",
    bpm: 114,
    bars: 112,
    processorName: "driving-music-02",
    workletSource: MUSIC_TRACK_02_WORKLET_SOURCE,
  },
  "bass-canyon": {
    id: "bass-canyon",
    title: "Bass Canyon",
    subtitle: "Soundtrack 03",
    bpm: 126.05,
    bars: 108,
    processorName: "driving-music-03",
    workletSource: MUSIC_TRACK_03_WORKLET_SOURCE,
  },
  "midnight-vector": {
    id: "midnight-vector",
    title: "Midnight Vector",
    subtitle: "Soundtrack 04",
    bpm: 100,
    bars: 32,
    processorName: "driving-music-04",
    workletSource: MUSIC_TRACK_04_WORKLET_SOURCE,
  },
  "glass-circuit": {
    id: "glass-circuit",
    title: "Glass Circuit",
    subtitle: "Soundtrack 05",
    bpm: 140,
    bars: 48,
    processorName: "driving-music-05",
    workletSource: MUSIC_TRACK_05_WORKLET_SOURCE,
  },
};

export const SOUNDTRACK_IDS = Object.keys(SOUNDTRACKS) as SoundtrackId[];

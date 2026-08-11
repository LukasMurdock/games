import {
  SOUNDTRACKS,
  SOUNDTRACK_IDS,
  type SoundtrackId,
} from "./soundtrack-registry";

export type DrivingMusicState = {
  running: boolean;
  paused: boolean;
  speed: number;
  drift: number;
  chaseTier: number;
};

export type DrivingMusicStem = "drums" | "bass" | "synth" | "atmosphere" | "guitar";
export type DrivingPlaybackProfile = "full" | "mobile";
export type DrivingAudioMixerOptions = {
  trackId?: SoundtrackId;
  rotateSession?: boolean;
};

export type DrivingAudioMixer = {
  context: AudioContext;
  vehicleDestination: AudioNode;
  start: () => Promise<void>;
  updateMusic: (state: DrivingMusicState) => void;
  setMusicVolume: (volume: number) => void;
  setMusicMuted: (muted: boolean) => void;
  setVehicleVolume: (volume: number) => void;
  setStemMix: (mix: Partial<Record<DrivingMusicStem, number>>) => void;
  setPlaybackProfile: (profile: DrivingPlaybackProfile) => void;
  setTrack: (trackId: SoundtrackId, transition?: "bar" | "immediate") => void;
  getCurrentTrack: () => SoundtrackId;
  seekToBar: (bar: number) => void;
  getCurrentBar: () => number;
  getMusicAnalyser: () => AnalyserNode;
  getMasterAnalyser: () => AnalyserNode;
  getRecordingStream: () => MediaStream;
  collision: () => void;
  cue: (name: "capture" | "reset") => void;
  destroy: () => void;
};

/** Shared game mix, adaptive soundtrack registry, and bar-boundary track crossfader. */
export function createDrivingAudioMixer(options: DrivingAudioMixerOptions = {}): DrivingAudioMixer | null {
  const AudioContextClass = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;

  const context = new AudioContextClass();
  const master = context.createGain();
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -10;
  compressor.knee.value = 8;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.006;
  compressor.release.value = 0.22;
  master.gain.value = 0.82;
  const recordingDestination = context.createMediaStreamDestination();
  const masterAnalyser = context.createAnalyser();
  masterAnalyser.fftSize = 2048;
  masterAnalyser.smoothingTimeConstant = 0.76;
  master.connect(compressor).connect(masterAnalyser);
  masterAnalyser.connect(context.destination);
  masterAnalyser.connect(recordingDestination);

  const vehicleBus = context.createGain();
  vehicleBus.gain.value = 1;
  vehicleBus.connect(master);
  const musicBus = context.createGain();
  musicBus.gain.value = 0.58;
  const musicPresence = context.createBiquadFilter();
  musicPresence.type = "peaking";
  musicPresence.frequency.value = 1900;
  musicPresence.Q.value = 0.7;
  musicPresence.gain.value = -2.5;
  const musicLowShelf = context.createBiquadFilter();
  musicLowShelf.type = "lowshelf";
  musicLowShelf.frequency.value = 220;
  const playbackHighpass = context.createBiquadFilter();
  playbackHighpass.type = "highpass";
  playbackHighpass.frequency.value = 20;
  const playbackLowpass = context.createBiquadFilter();
  playbackLowpass.type = "lowpass";
  playbackLowpass.frequency.value = 20_000;
  const musicAnalyser = context.createAnalyser();
  musicAnalyser.fftSize = 2048;
  musicAnalyser.smoothingTimeConstant = 0.76;
  musicBus.connect(musicPresence).connect(musicLowShelf).connect(playbackHighpass).connect(playbackLowpass).connect(musicAnalyser).connect(master);

  let activeTrack = options.trackId
    ?? (options.rotateSession === false ? "night-signal" : nextSessionTrack());
  let pendingTrack: SoundtrackId | null = null;
  let currentBar = 0;
  let previousTelemetryBar = -1;
  let loading: Promise<void> | null = null;
  let destroyed = false;
  let musicVolume = 0.58;
  let musicMuted = false;
  const nodes = new Map<SoundtrackId, AudioWorkletNode>();
  const trackGains = new Map<SoundtrackId, GainNode>();
  let stemMix: Record<DrivingMusicStem, number> = {
    drums: 1,
    bass: 1,
    synth: 1,
    atmosphere: 1,
    guitar: 1,
  };
  let latestState: DrivingMusicState = {
    running: false,
    paused: false,
    speed: 0,
    drift: 0,
    chaseTier: 0,
  };

  function sendToAll(message: object) {
    nodes.forEach((node) => node.port.postMessage(message));
  }

  function crossfadeTo(trackId: SoundtrackId, immediate: boolean) {
    if (trackId === activeTrack || !nodes.has(trackId)) {
      pendingTrack = null;
      return;
    }
    const previousTrack = activeTrack;
    const now = context.currentTime;
    const duration = immediate ? 0.04 : 4 * 60 / SOUNDTRACKS[trackId].bpm;
    const previousGain = trackGains.get(previousTrack);
    const nextGain = trackGains.get(trackId);
    nodes.get(trackId)?.port.postMessage({ type: "seek", bar: 0 });
    if (previousGain) {
      previousGain.gain.cancelScheduledValues(now);
      previousGain.gain.setValueAtTime(previousGain.gain.value, now);
      previousGain.gain.linearRampToValueAtTime(0.0001, now + duration);
    }
    if (nextGain) {
      nextGain.gain.cancelScheduledValues(now);
      nextGain.gain.setValueAtTime(Math.max(0.0001, nextGain.gain.value), now);
      nextGain.gain.linearRampToValueAtTime(1, now + duration);
    }
    activeTrack = trackId;
    currentBar = 0;
    previousTelemetryBar = -1;
    pendingTrack = null;
  }

  function loadMusic() {
    if (loading) return loading;
    const source = SOUNDTRACK_IDS.map((id) => SOUNDTRACKS[id].workletSource).join("\n");
    const workletUrl = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    loading = context.audioWorklet.addModule(workletUrl).then(() => {
      if (destroyed) return;
      for (const trackId of SOUNDTRACK_IDS) {
        const definition = SOUNDTRACKS[trackId];
        const node = new AudioWorkletNode(context, definition.processorName, {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [2],
        });
        const gain = context.createGain();
        gain.gain.value = trackId === activeTrack ? 1 : 0.0001;
        node.connect(gain).connect(musicBus);
        node.port.onmessage = ({ data }: MessageEvent<{ type?: string; bar?: number }>) => {
          if (trackId !== activeTrack || data.type !== "telemetry" || typeof data.bar !== "number") return;
          currentBar = data.bar;
          if (pendingTrack && previousTelemetryBar >= 0 && data.bar !== previousTelemetryBar) {
            crossfadeTo(pendingTrack, false);
          }
          previousTelemetryBar = data.bar;
        };
        nodes.set(trackId, node);
        trackGains.set(trackId, gain);
        node.port.postMessage({ type: "state", ...latestState });
        node.port.postMessage({ type: "mix", stems: stemMix });
      }
    }).catch((error: unknown) => {
      console.error("Gameplay music could not start.", error);
    }).finally(() => URL.revokeObjectURL(workletUrl));
    return loading;
  }

  return {
    context,
    vehicleDestination: vehicleBus,
    async start() {
      await context.resume();
      await loadMusic();
    },
    updateMusic(state) {
      latestState = state;
      sendToAll({ type: "state", ...latestState });
      const driftDuck = Math.max(0, Math.min(1, state.drift));
      const engineLoadProxy = Math.max(0, Math.min(1, state.speed));
      musicPresence.gain.setTargetAtTime(-2.5 - driftDuck * 5.5, context.currentTime, 0.08);
      musicLowShelf.gain.setTargetAtTime(-engineLoadProxy * 3, context.currentTime, 0.16);
    },
    setMusicVolume(volume) {
      musicVolume = Math.max(0, Math.min(1, volume));
      musicBus.gain.setTargetAtTime((musicMuted ? 0 : musicVolume) * 0.72, context.currentTime, 0.04);
    },
    setMusicMuted(muted) {
      musicMuted = muted;
      musicBus.gain.setTargetAtTime((musicMuted ? 0 : musicVolume) * 0.72, context.currentTime, 0.025);
    },
    setVehicleVolume(volume) {
      vehicleBus.gain.setTargetAtTime(Math.max(0, Math.min(1, volume)), context.currentTime, 0.04);
    },
    setStemMix(mix) {
      stemMix = { ...stemMix, ...mix };
      sendToAll({ type: "mix", stems: stemMix });
    },
    setPlaybackProfile(profile) {
      const mobile = profile === "mobile";
      playbackHighpass.frequency.setTargetAtTime(mobile ? 160 : 20, context.currentTime, 0.05);
      playbackLowpass.frequency.setTargetAtTime(mobile ? 7_000 : 20_000, context.currentTime, 0.05);
    },
    setTrack(trackId, transition = "bar") {
      if (trackId === activeTrack) return;
      if (nodes.size === 0) {
        activeTrack = trackId;
        currentBar = 0;
        pendingTrack = null;
        return;
      }
      if (transition === "immediate") crossfadeTo(trackId, true);
      else pendingTrack = trackId;
    },
    getCurrentTrack: () => activeTrack,
    seekToBar(bar) {
      const maximumBar = SOUNDTRACKS[activeTrack].bars - 1;
      currentBar = Math.max(0, Math.min(maximumBar, Math.floor(bar)));
      nodes.get(activeTrack)?.port.postMessage({ type: "seek", bar: currentBar });
    },
    getCurrentBar: () => currentBar,
    getMusicAnalyser: () => musicAnalyser,
    getMasterAnalyser: () => masterAnalyser,
    getRecordingStream: () => recordingDestination.stream,
    collision() { sendToAll({ type: "collision" }); },
    cue(name) { sendToAll({ type: "cue", name }); },
    destroy() {
      destroyed = true;
      nodes.forEach((node) => node.disconnect());
      trackGains.forEach((gain) => gain.disconnect());
      nodes.clear();
      trackGains.clear();
      void context.close();
    },
  };
}

function nextSessionTrack(): SoundtrackId {
  try {
    const key = "driving-game:last-soundtrack:v1";
    const previous = window.localStorage.getItem(key);
    const next: SoundtrackId = previous === "night-signal" ? "shadowline" : "night-signal";
    window.localStorage.setItem(key, next);
    return next;
  } catch {
    return "night-signal";
  }
}

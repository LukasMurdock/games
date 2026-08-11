# Driving audio architecture

Production vehicle mechanics emit renderer- and engine-independent `CarAudioParameters`. `createCarAudio()` maps that state through a selected transmission and `EngineDefinition`, then sends RPM/load/spool state to one generic order-synthesis AudioWorklet. Engine, tire, and environment buses remain separate until the master compressor, allowing the Maneuver Lab to audition the full mix, engine only, or tires only.

`driving-audio-mixer.ts` owns a shared gameplay context and routes vehicle and music buses into one final compressor in both local and multiplayer sessions. `soundtrack-registry.ts` registers independent cues and the mixer keeps their transports separate, rotates the initial track by session, and can crossfade to a newly selected track over one bar at the next bar boundary. `music-worklet-source.ts` is Soundtrack 01's deterministic 112-bar cue: procedural drums, bass, analog poly synth, atmosphere, and restrained guitar-like responses at 114 BPM. Speed opens the arrangement, drift ducks the synth presence band for tire readability, Chase adds electronic punctuation in three tiers, collisions briefly duck music, and pause preserves a quiet playhead. Drift entry, reinforcements, capture, and reset have authored procedural cues. `music-track-02-worklet-source.ts` is **Shadowline**, an independent 112-bar early-1980s synth-pop arrangement of Cole Porter’s U.S. public-domain 1930 composition “Love for Sale,” with score-derived melody/harmony and compact pre-rendered procedural drum one-shots; it does not replace or modify Night Signal. `music-track-03-worklet-source.ts` is **Bass Canyon**, a 108-bar procedural trap cue driven by compact sixteenth-note drum, bass, melody, pluck, and harmony maps. The pause menu stores independent music volume, music mute, and vehicle volume preferences and exposes track selection.

`/drive/labs/soundtrack/` is the hidden, `noindex` soundtrack lab. It supports bar seeking, stem solo/mute, synthetic gameplay-state controls, production idle/pull/circle/linked-drift vehicle traces, complete/music/vehicle mix isolation, cue triggering, full-range/mobile audition profiles, spectrum and RMS metering, and WebM mix recording. `pnpm soundtrack:analyze` drives that lab through six deterministic browser scenarios, analyzes temporary complete-mix captures with FFmpeg, reports loudness plus the tire-critical 1–3 kHz and engine/bass <250 Hz bands, writes a track-specific `reports/soundtrack-analysis-<track>.md` (`pnpm soundtrack:analyze:02` selects Shadowline and `pnpm soundtrack:analyze:03` selects Bass Canyon), and fails on clipping, gross loudness regressions, or browser errors. `pnpm soundtrack:analyze:long` records Night Signal's complete 112-bar music-only arc, while `pnpm soundtrack:analyze:long:02` selects Shadowline and `pnpm soundtrack:analyze:long:03` selects Bass Canyon; all report each authored section separately, compare the loop tail and head, and write a track-specific `reports/soundtrack-longform-analysis-<track>.md`. Set `SOUNDTRACK_LONG_CAPTURE_SECONDS` only for a short plumbing smoke test; seam and section analysis require the default full capture. `pnpm soundtrack:profile` runs the densest complete mix in desktop and mobile-emulated Chrome, reports main-thread utilization, script time, heap use, and browser errors to `reports/soundtrack-performance.md`; physical Safari/mobile dropout testing remains manual.

## Engine registry

`engine-types.ts` is the engine plug-in boundary. An engine definition owns:

- identity, title, description, and provenance;
- idle, limiter, and redline RPM;
- 0.5×-order magnitude tables and their RPM centers;
- firing/cylinder texture;
- induction response;
- tonal, turbulent, mechanical, drive, and output character;
- output EQ and a matching default transmission.

Definitions must remain structured-clone-safe because synthesis data crosses into the AudioWorklet through `processorOptions`. The generic worklet contains no registered engine identity or sampled source audio.

To add an engine:

1. Add an `EngineDefinition` to `ENGINE_TYPES`.
2. Supply four equal-length order tables (the reference extraction pipeline produces 32 quantized magnitudes per table).
3. Set firing texture, RPM range, induction, output character, and transmission defaults.
4. Validate idle, pull, circle, and linked-drift traces in `/drive/labs/maneuvers/`.
5. Mark uncalibrated engines as `procedural-prototype` until reference evidence supports them.

The production default remains the reference-derived turbo inline-six. The NA V8 and high-revving NA inline-four registrations are explicit procedural prototypes that prove the seam; they are not claims of sample-matched accuracy.

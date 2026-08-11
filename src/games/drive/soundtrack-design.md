# Gameplay Soundtrack 01 — Research and Production Brief

## Goal

Create an **original instrumental driving cue** with the nocturnal, glamorous, slightly eerie analog pop-rock character that makes Kim Carnes' “Bette Davis Eyes” an effective reference. The new track must not copy the reference melody, vocal line, chord progression, keyboard hook, bass line, section map, or recognizable arrangement.

The target is not generic synthwave. It is a sparse human band performance organized around one strange analog color: watchful rather than heroic, dry rather than cavernous, and steady enough to support long driving sessions.

### Primary production reference

Use the [instrumental version supplied for review](https://www.youtube.com/watch?v=XHlfIwbqY34) as the primary **production and feeling** reference. It makes the arrangement, live-feeling rhythm section, harmonically rich keyboard layers, bass/guitar interplay, and section dynamics easier to hear without vocals. It is an analysis reference only: no audio, melody, keyboard hook, bass line, chord sequence, or arrangement may be copied into the game.

Local analysis measured the 227.981-second stereo reference at approximately **−14.3 LUFS integrated**, **6.5 LU LRA**, and **+1.1 dBFS decoded true peak**. More importantly, its spectrum is substantially richer than the current procedural prototype from roughly 300 Hz through 5 kHz, with bright drum transients extending much higher. Closing that timbral and performance gap requires a hybrid sample/synthesis rebuild rather than further output-gain adjustments.

## What the reference actually does

### Sourced recording facts

- Producer Val Garay and keyboardist Bill Cuomo rebuilt the arrangement around a “spooky and eerie” sound Cuomo found on a Sequential Circuits Prophet-5. Steve Goldstein supplied another keyboard counter-part. [PopMatters interview](https://www.popmatters.com/kim-carnes-2017-interview-part1-2495395223.html)
- The Prophet-5 architecture provides two multi-waveform oscillators per voice, a resonant low-pass filter, filter and amplifier envelopes, LFO modulation, and Poly Mod. We can use those broad synthesis capabilities without reproducing the record's patch or part. [Sequential Prophet-5 overview](https://sequential.com/2020/09/prophet-5-returns/)
- The drums were live, close-miked, hot, and bright. Craig Krampf manually played the conspicuous Synare electronic percussion accent. The useful model is therefore **tight live kit plus sparse electronic punctuation**, not a fully programmed drum-machine track. [Mix, “Classic Tracks”](https://www.mixonline.com/recording/classic-tracks-kim-carnes-bette-davis-eyes)
- The session used electric bass and guitars. Garay recorded guitars for warmth and low-end, and captured synths both directly and through an amplifier to avoid a uniformly harsh DI sound. [Mix](https://www.mixonline.com/recording/classic-tracks-kim-carnes-bette-davis-eyes)
- Accounts agree on a live, minimally reconstructed performance, even though recollections differ on the selected take. That looseness is part of the production character. [Mix](https://www.mixonline.com/recording/classic-tracks-kim-carnes-bette-davis-eyes), [PopMatters](https://www.popmatters.com/kim-carnes-2017-interview-part1-2495395223.html)
- Published analyses place the song in 4/4 at approximately 116–117 BPM and centered on F major. [Musicnotes](https://www.musicnotes.com/sheetmusic/kim-carnes/bette-davis-eyes/MN0302227), [Hooktheory](https://www.hooktheory.com/theorytab/view/kim-carnes/bette-davis-eyes)

### Local reference analysis

The linked YouTube audio was downloaded only to `/tmp` for analysis and is not a project asset.

- Source: stereo Opus, 48 kHz, 224.141 seconds, approximately 129 kbps.
- SHA-256: `5abdb9d9c23f9576618cce56314d1c337322f9156ae6d722f786a3a0409aaca0`.
- FFmpeg EBU R128 measurement: **−14.4 LUFS integrated**, **7.8 LU loudness range**, **−0.4 dBFS true peak**.
- Mean level: approximately −17.2 dBFS; overall RMS approximately −17.24 dBFS.
- The waveform shows broad section-level movement rather than a continuously pinned master.
- The spectrogram shows a persistent low-frequency rhythmic foundation, bright broadband drum transients, and exposed harmonic keyboard regions. Density changes substantially by section; every layer is not present all the time.
- There is roughly 0.55 seconds of initial near-silence and a decaying ending. Our game loop should instead use musically matched loop boundaries.

The key lesson is **contrast and space**, not a particular melody: a dry rhythm section leaves an unusual synth timbre exposed, then guitar, bass, and a second keyboard add small responses.

## Original musical identity

### Constraints

- **114 BPM, 4/4, E Dorian**. This retains a mid-tempo driving pulse while separating the cue from the published reference key and exact tempo.
- Do not begin with an exposed keyboard hook. Start with atmosphere and rhythm; reveal the central motif after 16 bars.
- The central motif should initially use only two or three pitches and a distinctive two-bar rhythm of our own.
- Use a displaced electronic accent on `2&` in the first bar and beat `4` in the second. Do not reproduce recognizable reference accent placement.
- Avoid the reference's melody contour, bass landmarks, chord rhythm, instrument-entry order, dropouts, fills, and section lengths.
- Reject any draft that remains recognizable when reduced to melody plus chord symbols, even if its production differs.

### Harmonic field

Starting proposal, subject to composition and similarity review:

```text
Em(add9) | A6/C# | Gmaj7/B | D6/A |
Cmaj7(#11) | F#7sus4 | Am6/C | B7sus4(b9)
```

Treat this as an eight-bar field, not a mandatory block loop. Hold, omit, invert, and reorder selected colors in later sections. Keep the bass more repetitive than the chord symbols imply so the cue feels hypnotic rather than harmonically busy.

### Instrument palette

1. **Primary analog poly synth**
   - Five-voice behavior; two saw/pulse oscillators with modest detuning.
   - Small per-voice tuning and envelope variance.
   - Resonant low-pass filter, medium-fast attack, short release.
   - Render a clean DI stem and a quiet re-amped/cabinet stem; do not recreate the reference patch or rhythm.

2. **Live-feeling acoustic kit**
   - Tight kick, bright close snare, dry hats, minimal room.
   - Record or program velocity and timing variation as a performance, then edit only obvious distractions.
   - Few fills; use silence as arrangement.

3. **Electronic percussion voice**
   - A pitched synthetic tom/noise burst performed as punctuation.
   - Separate stem so Chase mode can introduce it independently.

4. **Electric bass**
   - Dry and melodic but restrained, with controlled pick/finger transient.
   - Mostly roots, fifths, and passing tones; leave the 1–3 kHz tire-information region uncluttered.

5. **Electric guitar**
   - Muted answers, low-register texture, harmonics, and occasional swells.
   - Light overdrive and a warm cabinet; no continuous wall of strumming.

6. **Atmosphere / second keyboard**
   - Dark filtered sustain and re-amped noise that can survive alone in menus, pause, and low-intensity states.

There are no lead vocals and no synthesized pseudo-vocal melody. Instrumental interest comes from call-and-response among synth, guitar, bass, and electronic percussion.

## Authored arrangement

At 114 BPM, 112 bars last approximately 3:56.

| Bars | Approx. time | Function |
|---|---:|---|
| 1–8 | 0:00–0:17 | Cabinet noise, filtered atmosphere, distant guitar harmonics |
| 9–24 | 0:17–0:51 | Core kit, bass, and sparse chord pulses |
| 25–40 | 0:51–1:25 | Hats open; introduce the original two/three-note dialogue |
| 41–56 | 1:25–1:59 | Harmonic contrast; remove kick for four bars, then rebuild |
| 57–72 | 1:59–2:32 | More active bass and muted guitar responses |
| 73–88 | 2:32–3:06 | Peak density; electronic percussion and upper synth response |
| 89–104 | 3:06–3:39 | Release intensity and restore space around vehicle audio |
| 105–112 | 3:39–3:56 | Strip to loop-compatible atmosphere and pickup |

Bars 105–112 must join bar 1 without a terminal cadence or reverb discontinuity. Author the full listening arc, but export synchronized 8- or 16-bar modules so the browser does not need to decode six four-minute stems at once.

## Gameplay adaptation

Export these synchronized stems:

1. acoustic drums;
2. electronic percussion;
3. bass;
4. primary synth;
5. atmosphere/re-amped synth;
6. guitar;
7. original transition and capture stingers.

All modules must share the same sample rate, exact start frame, tail policy, bar grid, and loop metadata.

### Mix states

- **Waiting/menu:** atmosphere and filtered guitar only.
- **Cruise at low speed:** restrained drums, bass, and synth; no electronic accents.
- **Fast grip driving:** open hats and guitar; gently open the synth filter.
- **Drift/breakaway:** do not merely increase music gain. Duck 1–3 kHz in synth/guitar so tire feedback remains legible, and trigger one short swell at breakaway.
- **Chase tier 1:** add electronic percussion.
- **Chase tier 2 (20 seconds):** add upper synth response.
- **Chase tier 3 (45 seconds):** add denser hat/bass variation. Pursuer proximity controls intensity continuously.
- **Collision:** duck music for 80–150 ms and recover over approximately 400 ms.
- **Captured:** play a short original stinger, then reduce to atmosphere during the current 0.8-second capture presentation.
- **Paused/hidden:** preserve the playhead, low-pass the music, and reduce it by roughly 18 dB. Resume full mix on a safe beat boundary.

Music should support vehicle feedback. Engine pitch, tire health, collisions, and police proximity remain more important than any music stem.

## Web Audio architecture

The vehicle stack already maps speed, slip, steering load, drift phase, surface, boost, throttle, and braking into separate engine, tire, and environment buses. `createCarAudio()` can now accept a shared `AudioContext` and destination, as demonstrated by `src/site/demo-audio.ts`.

For gameplay:

1. Add a game-owned audio mixer with one `AudioContext`, `musicBus`, `vehicleBus`, `feedbackBus`, and final limiter.
2. Pass the shared context and `vehicleBus` into local car audio instead of allowing each subsystem to create a context.
3. Add a renderer-independent `DrivingMusicState` containing mode, speed band, drift phase, chase tier, pursuer proximity, collision impulse, paused state, and visibility.
4. Decode modular stem assets once. Start all active `AudioBufferSourceNode`s at the same Web Audio timestamp with explicit loop points. [`AudioBufferSourceNode`, MDN](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode)
5. Schedule bar/beat transitions against `AudioContext.currentTime`; do not use render-frame threshold checks for musical timing.
6. Smooth continuous mix parameters over 100–500 ms and add hysteresis to speed/drift state boundaries.
7. Resume audio from the existing Start interaction to satisfy browser autoplay policy. [MDN autoplay guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay)
8. Profile decoded memory on mobile before considering a streaming AudioWorklet. Begin with 8/16-bar compressed modules because their scheduling and loop behavior are simpler and more reliable.

## Production and delivery plan

### Prototype

- Compose drums, bass, atmosphere, and one original synth motif for bars 9–40.
- Audition the cue against production engine and linked-drift traces in the Maneuver Lab.
- Establish music/vehicle headroom before writing the full arrangement.

### Full composition

- Complete 112 bars with no vocals.
- Record or humanize the acoustic kit and guitar.
- Print clean and re-amped synth versions.
- Perform the electronic percussion rather than quantizing every hit identically.

### Interactive export

- Export synchronized modular stems and stingers, initially at 48 kHz.
- Create an asset manifest containing creator, source, license, sample rate, bar range, BPM, loop frames, and loudness.
- Integrate Cruise first; add Chase layering only after the base loop is stable.

### Acceptance criteria

- The loop is inaudible on headphones and mobile speakers.
- Tire onset and healthy/distressed drift tone remain readable at maximum music intensity.
- The score does not pump continuously against the engine compressor.
- Cruise remains pleasant for at least three consecutive loops.
- Chase escalation is musically aligned but never delays gameplay feedback.
- A melody/chord/structure review finds no recognizable borrowing from the reference.
- No reference audio, source-separated material, or unlicensed sample ships in the repository.

## Rights and asset policy

The composition and master must be created or commissioned for the game with written rights covering games, web distribution, trailers, edits, stems, and future ports. Composition and sound recording are separate copyright works. [U.S. Copyright Office](https://www.copyright.gov/register/pa-sr.html)

Use commissioned, CC0, or clearly licensed drums, one-shots, and impulse responses. Record creator, source URL, exact license, version/date, allowed uses, and attribution in the asset manifest. “Royalty-free” without preserved license terms is insufficient.

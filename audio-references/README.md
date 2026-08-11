# Drift engine reference audition set

Local research material only. None of these files are integrated into the game or copied into `public/`. The set lives in this repository so production audio work, source provenance, and comparisons remain reproducible alongside the implementation.

## Sources

| Reference | Local source | Role |
|---|---|---|
| NM2255 900HP 2JZ Silvia S15 | `sources/nm2255-s15.webm` | Exterior tonal and projection reference |
| Garrett G40-900 2JZ dyno | `clips/garrett-01-dyno-pull.wav` | Cleaner dyno sweep and harmonic reference |
| Sceriffo 1000HP 2JZ GT86 | `sources/sceriffo-gt86.m4a` | Onboard drift, shift, and load behavior |
| Herutsu isolated tire skids preview | `sources/herutsu-isolated-tire-skids.m4a` | Isolated squeal bands, instability, and envelope behavior |

Audio references and yt-dlp metadata are retained locally; source videos are excluded from the repository.

## Candidate clips

All clips are stereo, 48 kHz, 24-bit PCM WAV. Labels describe their intended audition role and remain provisional until listening.

| Clip | Source range | Audition for |
|---|---:|---|
| `nm2255-01-staging-launch.wav` | 00:22–00:42 | Low-to-rising load, launch, initial spool |
| `nm2255-02-first-drift-pass.wav` | 00:47–01:11 | Exterior drift pass and distance falloff |
| `nm2255-03-loaded-close-pass.wav` | 02:22–02:42 | Strong loaded exterior tone and harmonic structure |
| `nm2255-04-drift-sequence.wav` | 02:46–03:10 | Sustained drift behavior and modulation |
| `nm2255-05-late-close-pass.wav` | 04:42–05:06 | Later close-pass comparison |
| `garrett-01-dyno-pull.wav` | 00:05–00:16 | Isolated dyno sweep and spool onset |
| `garrett-02-high-load-tail.wav` | 00:17–00:27 | High-load tail, lift, and decay |
| `sceriffo-01-early-drift-behavior.wav` | 00:42–01:12 | Onboard drift/load behavior |
| `sceriffo-02-mid-drift-behavior.wav` | 02:00–02:30 | Repeated shifts and drift modulation |
| `sceriffo-03-late-drift-behavior.wav` | 03:48–04:18 | Sustained later-session behavior |
| `herutsu-01-skid-sequence.wav` | 00:00–00:14.4 | First isolated-skid sequence |
| `herutsu-02-skid-sequence.wav` | 00:15.75–00:22.35 | Second isolated-skid sequence |
| `herutsu-03-skid-sequence.wav` | 00:23.3–00:33.4 | Third isolated-skid sequence |

## Analysis

`analysis/` contains:

- Full-source waveform overviews
- Full-source logarithmic spectrograms
- Video contact sheets sampled every 12 seconds (2 seconds for Garrett)
- A waveform and logarithmic spectrogram for every candidate clip
- `maneuver-lab-full-speed-pull-spectrum.png`, captured from production `CarAudio`
- `maneuver-lab-vs-garrett-dyno-spectrum.png`, a time-normalized visual comparison

Open `audition.html` locally for audio controls alongside each waveform and spectrogram.

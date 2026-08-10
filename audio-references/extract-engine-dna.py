#!/usr/bin/env python3
"""Extract compact engine-order magnitude tables from the local Garrett reference.

Research/offline authoring tool only. Source recordings and generated analysis stay ignored.
"""
from __future__ import annotations

import json
import subprocess
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).parent
SOURCE = ROOT / "clips" / "garrett-01-dyno-pull.wav"
RATE = 12_000
WINDOW = 4096
HOP = 512
HALF_ORDERS = 32


def decode(path: Path) -> np.ndarray:
    command = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path),
        "-ac", "1", "-ar", str(RATE), "-f", "f32le", "-",
    ]
    raw = subprocess.check_output(command)
    return np.frombuffer(raw, dtype="<f4").copy()


def interpolate_spectrum(magnitudes: np.ndarray, frequencies: np.ndarray, targets: np.ndarray) -> np.ndarray:
    return np.interp(targets, frequencies, magnitudes, left=0, right=0)


def track_firing_frequency(audio: np.ndarray):
    window = np.hanning(WINDOW)
    frequencies = np.fft.rfftfreq(WINDOW, 1 / RATE)
    candidates = np.arange(45.0, 401.0, 1.0)
    tracks = []
    for start in range(0, len(audio) - WINDOW, HOP):
        frame = audio[start:start + WINDOW]
        spectrum = np.abs(np.fft.rfft(frame * window)) + 1e-8
        # Harmonic-product-style score. The fundamental is weighted enough to avoid octave locking.
        score = np.zeros_like(candidates)
        for harmonic, weight in [(1, 1.35), (2, 0.9), (3, 0.65), (4, 0.5), (5, 0.35), (6, 0.25)]:
            energy = interpolate_spectrum(spectrum, frequencies, candidates * harmonic)
            score += np.log1p(energy * 20) * weight
        best = float(candidates[int(np.argmax(score))])
        confidence = float(np.max(score) - np.median(score))
        tracks.append(((start + WINDOW / 2) / RATE, best, confidence))
    return tracks


def smooth_track(tracks):
    values = np.array([item[1] for item in tracks])
    smoothed = values.copy()
    for i in range(len(values)):
        local = values[max(0, i - 2):i + 3]
        smoothed[i] = np.median(local)
    return [(tracks[i][0], float(smoothed[i]), tracks[i][2]) for i in range(len(tracks))]


def extract_tables(audio: np.ndarray, tracks):
    window = np.hanning(WINDOW)
    frequencies = np.fft.rfftfreq(WINDOW, 1 / RATE)
    # RPM regions correspond to 3x-order firing frequency bands.
    bands = {
        "low": (80, 145),
        "mid": (145, 215),
        "high": (215, 285),
        "redline": (285, 370),
    }
    accumulators = {name: [] for name in bands}
    phases = {name: [] for name in bands}
    for index, (time, firing_hz, confidence) in enumerate(tracks):
        if confidence < 1.0:
            continue
        start = index * HOP
        frame = audio[start:start + WINDOW]
        if len(frame) != WINDOW:
            continue
        fft = np.fft.rfft(frame * window)
        crank_hz = firing_hz / 3
        targets = crank_hz * (np.arange(1, HALF_ORDERS + 1) * 0.5)
        magnitude = interpolate_spectrum(np.abs(fft), frequencies, targets)
        phase = np.interp(targets, frequencies, np.unwrap(np.angle(fft)))
        for name, (minimum, maximum) in bands.items():
            if minimum <= firing_hz < maximum:
                accumulators[name].append(magnitude)
                phases[name].append(phase)
                break

    result = {}
    for name in bands:
        if not accumulators[name]:
            continue
        magnitude = np.median(np.stack(accumulators[name]), axis=0)
        # Remove local broadband floor, emphasize stable order peaks, then normalize.
        floor = np.percentile(magnitude, 20)
        magnitude = np.maximum(0, magnitude - floor * 0.72)
        magnitude /= max(np.max(magnitude), 1e-8)
        magnitude = np.sqrt(magnitude)  # retain quieter orders after 8-bit quantization
        quantized = np.rint(magnitude * 255).astype(np.uint8)
        result[name] = {
            "amplitudes": quantized.tolist(),
            "frameCount": len(accumulators[name]),
        }
    return result


def main():
    audio = decode(SOURCE)
    tracks = smooth_track(track_firing_frequency(audio))
    tables = extract_tables(audio, tracks)
    output = {
        "source": str(SOURCE.relative_to(ROOT)),
        "sampleRate": RATE,
        "halfOrders": HALF_ORDERS,
        "tables": tables,
        "pitchTrack": [
            {"time": round(time, 3), "firingHz": round(firing, 1), "rpm": round(firing * 20), "confidence": round(confidence, 3)}
            for time, firing, confidence in tracks
        ],
    }
    destination = ROOT / "analysis" / "engine-dna.json"
    destination.write_text(json.dumps(output, indent=2) + "\n")
    print(f"Wrote {destination}")
    for name, table in tables.items():
        print(name, table["frameCount"], table["amplitudes"])


if __name__ == "__main__":
    main()

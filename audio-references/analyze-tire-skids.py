#!/usr/bin/env python3
"""Offline spectral summary for the local Herutsu skid reference."""
from __future__ import annotations
import json, subprocess
from pathlib import Path
import numpy as np

ROOT = Path(__file__).parent
RATE = 16_000
WINDOW = 2048
HOP = 256


def decode(path: Path):
    raw = subprocess.check_output([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path),
        "-ac", "1", "-ar", str(RATE), "-f", "f32le", "-",
    ])
    return np.frombuffer(raw, dtype="<f4").copy()


def analyze(path: Path):
    audio = decode(path)
    window = np.hanning(WINDOW)
    frequencies = np.fft.rfftfreq(WINDOW, 1 / RATE)
    spectra, levels = [], []
    for start in range(0, len(audio) - WINDOW, HOP):
        frame = audio[start:start + WINDOW]
        levels.append(np.sqrt(np.mean(frame * frame)))
        spectra.append(np.abs(np.fft.rfft(frame * window)) + 1e-9)
    spectra = np.stack(spectra)
    levels = np.asarray(levels)
    active = levels > np.percentile(levels, 35)
    selected = spectra[active]
    power = selected * selected
    centroids = np.sum(power * frequencies, axis=1) / np.sum(power, axis=1)
    average = np.median(selected, axis=0)

    mask = (frequencies >= 300) & (frequencies <= 4000)
    candidate_indices = np.where(mask)[0]
    peaks = []
    for i in candidate_indices[1:-1]:
        if average[i] > average[i - 1] and average[i] >= average[i + 1]:
            peaks.append((float(average[i]), float(frequencies[i])))
    peaks.sort(reverse=True)
    separated = []
    for magnitude, frequency in peaks:
        if all(abs(frequency - existing) > 120 for existing in separated):
            separated.append(frequency)
        if len(separated) == 6:
            break

    # Dominant amplitude-flutter rate from a 100 Hz RMS envelope.
    envelope_hop = RATE // 100
    envelope = np.array([
        np.sqrt(np.mean(audio[i:i + envelope_hop] ** 2))
        for i in range(0, len(audio) - envelope_hop, envelope_hop)
    ])
    envelope -= np.mean(envelope)
    envelope_spectrum = np.abs(np.fft.rfft(envelope * np.hanning(len(envelope))))
    envelope_frequencies = np.fft.rfftfreq(len(envelope), 1 / 100)
    flutter_mask = (envelope_frequencies >= 2) & (envelope_frequencies <= 45)
    flutter_frequency = envelope_frequencies[flutter_mask][np.argmax(envelope_spectrum[flutter_mask])]

    flatness = np.exp(np.mean(np.log(selected), axis=1)) / np.mean(selected, axis=1)
    return {
        "durationSeconds": round(len(audio) / RATE, 2),
        "activeRmsDb": round(float(20 * np.log10(np.median(levels[active]) + 1e-9)), 1),
        "spectralCentroidHz": round(float(np.median(centroids))),
        "centroidRangeHz": [round(float(np.percentile(centroids, 10))), round(float(np.percentile(centroids, 90)))],
        "prominentBandsHz": [round(value) for value in separated],
        "spectralFlatness": round(float(np.median(flatness)), 3),
        "dominantEnvelopeModulationHz": round(float(flutter_frequency), 1),
    }


def main():
    files = sorted((ROOT / "clips").glob("herutsu-*.wav"))
    result = {path.stem: analyze(path) for path in files}
    destination = ROOT / "analysis" / "herutsu-tire-analysis.json"
    destination.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()

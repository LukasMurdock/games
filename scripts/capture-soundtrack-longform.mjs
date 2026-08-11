import { execFile, spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright-core";

const execute = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const tracks = {
  "night-signal": { title: "Night Signal", bpm: 114, bars: 112 },
  shadowline: { title: "Shadowline", bpm: 114, bars: 112 },
  "bass-canyon": { title: "Bass Canyon", bpm: 126.05, bars: 108 },
};
const requestedTrackId = process.env.SOUNDTRACK_ID ?? "night-signal";
const trackId = Object.hasOwn(tracks, requestedTrackId) ? requestedTrackId : "night-signal";
const { title: trackTitle, bpm, bars: totalBars } = tracks[trackId];
const secondsPerBar = 4 * 60 / bpm;
const loopDuration = totalBars * secondsPerBar;
const requestedDuration = Number(process.env.SOUNDTRACK_LONG_CAPTURE_SECONDS ?? loopDuration + 1.5);
const port = Number(process.env.SOUNDTRACK_CAPTURE_PORT ?? 4188);
const temporaryDirectory = await mkdtemp(join(tmpdir(), "drive-soundtrack-longform-"));
const recordingPath = join(temporaryDirectory, `${trackId}-longform.webm`);
const server = spawn("pnpm", ["dev", "--host", "127.0.0.1", "--port", String(port)], {
  cwd: root,
  stdio: "ignore",
});

const sections = trackId === "bass-canyon" ? [
  { title: "Introduction", startBar: 0, endBar: 17 },
  { title: "Beat entry", startBar: 17, endBar: 26 },
  { title: "First drop", startBar: 26, endBar: 54 },
  { title: "Breakdown", startBar: 54, endBar: 69 },
  { title: "Second drop", startBar: 69, endBar: 78 },
  { title: "Peak", startBar: 78, endBar: 98 },
  { title: "Loop-out", startBar: 98, endBar: 108 },
] : [
  { title: "Introduction", startBar: 0, endBar: 8 },
  { title: "Core groove", startBar: 8, endBar: 24 },
  { title: "Motif development", startBar: 24, endBar: 40 },
  { title: "Contrast", startBar: 40, endBar: 56 },
  { title: "Driving", startBar: 56, endBar: 72 },
  { title: "Peak", startBar: 72, endBar: 88 },
  { title: "Release", startBar: 88, endBar: 104 },
  { title: "Loop-out", startBar: 104, endBar: 112 },
];

try {
  const url = `http://127.0.0.1:${port}/drive/labs/soundtrack/`;
  await waitForServer(url);
  const browser = await chromium.launch({
    headless: true,
    executablePath: chromeExecutable(),
    args: ["--autoplay-policy=no-user-gesture-required"],
  });
  const browserErrors = [];
  try {
    const page = await browser.newPage({ acceptDownloads: true });
    page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
    page.on("pageerror", (error) => browserErrors.push(error.message));
    await page.goto(url, { waitUntil: "networkidle" });
    await page.locator("#soundtrack").selectOption(trackId);
    await page.locator("#start-audio").click();
    await page.locator("#start-audio").filter({ hasText: "Soundtrack running" }).waitFor();
    await page.locator("#mix-isolation").selectOption("music");
    await page.locator("#speaker-profile").selectOption("full");
    await page.locator("#speed").fill("60");
    await page.locator("#drift").fill("0");
    await page.locator("#chase-tier").selectOption("0");
    await page.locator("#bar").fill("0");
    await page.locator("#record-mix").click();
    process.stdout.write(`Capturing ${(requestedDuration / 60).toFixed(2)} minutes of ${trackTitle}…\n`);
    await page.waitForTimeout(requestedDuration * 1_000);
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#record-mix").click();
    const download = await downloadPromise;
    await download.saveAs(recordingPath);
    await page.close();
  } finally {
    await browser.close();
  }

  const completeLoopCaptured = requestedDuration >= loopDuration;
  const measuredSections = completeLoopCaptured
    ? await Promise.all(sections.map(analyzeSection))
    : [];
  const wholeCapture = await loudnessAt(recordingPath, 0, requestedDuration);
  const seam = completeLoopCaptured ? await analyzeSeam() : null;
  await mkdir(join(root, "reports"), { recursive: true });
  const reportPath = join(root, "reports", `soundtrack-longform-analysis-${trackId}.md`);
  await writeFile(reportPath, renderReport({
    trackTitle,
    wholeCapture,
    measuredSections,
    seam,
    browserErrors,
    completeLoopCaptured,
  }), "utf8");
  process.stdout.write(`Report: ${reportPath}\nTemporary recording: ${recordingPath}\n`);

  if (
    browserErrors.length > 0
    || wholeCapture.truePeak > -1
    || (seam && (seam.loudnessDelta > 6 || seam.peakDelta > 8))
  ) process.exitCode = 1;
} finally {
  server.kill("SIGTERM");
}

async function analyzeSection(section) {
  const start = section.startBar * secondsPerBar;
  const duration = (section.endBar - section.startBar) * secondsPerBar;
  return { ...section, ...(await loudnessAt(recordingPath, start, duration)) };
}

async function analyzeSeam() {
  const windowDuration = 1;
  const tail = await loudnessAt(recordingPath, loopDuration - windowDuration, windowDuration);
  const head = await loudnessAt(recordingPath, 0, windowDuration);
  return {
    tail,
    head,
    loudnessDelta: Math.abs(tail.integratedLufs - head.integratedLufs),
    peakDelta: Math.abs(tail.truePeak - head.truePeak),
  };
}

async function loudnessAt(path, start, duration) {
  const { stderr } = await execute("ffmpeg", [
    "-hide_banner", "-nostats", "-ss", String(Math.max(0, start)), "-t", String(duration),
    "-i", path, "-filter_complex", "ebur128=peak=true", "-f", "null", "-",
  ]);
  return {
    integratedLufs: lastNumber(stderr, /I:\s+(-?[\d.]+) LUFS/gu),
    loudnessRange: lastNumber(stderr, /LRA:\s+(-?[\d.]+) LU/gu),
    truePeak: lastNumber(stderr, /Peak:\s+(-?[\d.]+) dBFS/gu),
  };
}

function renderReport({ trackTitle: analyzedTrackTitle, wholeCapture, measuredSections, seam, browserErrors, completeLoopCaptured }) {
  const sectionRows = measuredSections.length > 0
    ? measuredSections.map((section) => `| ${section.startBar + 1}–${section.endBar} | ${section.title} | ${section.integratedLufs.toFixed(1)} | ${section.loudnessRange.toFixed(1)} | ${section.truePeak.toFixed(1)} |`).join("\n")
    : "| — | Smoke capture only | — | — | — |";
  const seamSummary = seam
    ? `Tail/head loudness delta: **${seam.loudnessDelta.toFixed(1)} LU**. Peak delta: **${seam.peakDelta.toFixed(1)} dB**. A delta above 6 LU or 8 dB fails the script. This detects structural mismatch; the final join must still be checked by ear for clicks or harmonic discontinuity.`
    : "Loop seam analysis was skipped because `SOUNDTRACK_LONG_CAPTURE_SECONDS` requested less than one complete loop.";
  return `# Soundtrack Long-form Analysis — ${analyzedTrackTitle}\n\nGenerated by \`pnpm soundtrack:analyze:long\`. The temporary recording is not a repository asset.\n\n- Authored length: **${totalBars} bars / ${loopDuration.toFixed(3)} seconds** at ${bpm} BPM.\n- Complete loop captured: **${completeLoopCaptured ? "yes" : "no"}**.\n- Whole capture: **${wholeCapture.integratedLufs.toFixed(1)} LUFS**, **${wholeCapture.loudnessRange.toFixed(1)} LU LRA**, **${wholeCapture.truePeak.toFixed(1)} dBFS true peak**.\n- Browser errors: **${browserErrors.length}**.\n\n## Sections\n\n| Bars | Section | LUFS-I | LRA | True peak dBFS |\n|---|---|---:|---:|---:|\n${sectionRows}\n\n## Loop seam\n\n${seamSummary}\n\n## Listening checklist\n\n- Drum and bass phrases remain interesting over repeated eight-bar harmonic cycles.\n- The motif develops without becoming a pseudo-vocal lead.\n- Guitar responses support rather than crowd the synth.\n- Contrast, peak, and release sections are obvious without abrupt gain jumps.\n- The final section contracts naturally into bar 1 with no perceived restart.\n`;
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetch(url)).ok) return;
    } catch { /* still starting */ }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error("Timed out waiting for Soundtrack Lab.");
}

function chromeExecutable() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  if (process.platform === "darwin") return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  return "/usr/bin/google-chrome";
}

function lastNumber(text, pattern) {
  const matches = [...text.matchAll(pattern)];
  if (matches.length === 0) throw new Error(`Could not parse FFmpeg output with ${pattern}`);
  return Number(matches.at(-1)[1]);
}

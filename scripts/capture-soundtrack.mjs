import { execFile, spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright-core";

const execute = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const durationMs = Math.max(3_000, Number(process.env.SOUNDTRACK_CAPTURE_SECONDS ?? 12) * 1_000);
const requestedTrackId = process.env.SOUNDTRACK_ID ?? "night-signal";
const trackBarsById = { "night-signal": 112, shadowline: 112, "bass-canyon": 108 };
const trackId = Object.hasOwn(trackBarsById, requestedTrackId) ? requestedTrackId : "night-signal";
const trackBars = trackBarsById[trackId];
const port = Number(process.env.SOUNDTRACK_CAPTURE_PORT ?? 4187);
const outputDirectory = await mkdtemp(join(tmpdir(), "drive-soundtrack-captures-"));
const server = spawn("pnpm", ["dev", "--host", "127.0.0.1", "--port", String(port)], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (chunk) => { serverLog += chunk; });
server.stderr.on("data", (chunk) => { serverLog += chunk; });

const scenarios = [
  { id: "quiet-cruise", title: "Idle and low-intensity Cruise", bar: 8, speed: 20, drift: 0, tier: 0, vehicle: "idle" },
  { id: "fast-cruise", title: "Full-speed pull", bar: 56, speed: 92, drift: 0, tier: 0, vehicle: "launch" },
  { id: "linked-drift", title: "Healthy linked drifting", bar: 60, speed: 78, drift: 72, tier: 0, vehicle: "linked" },
  { id: "distressed-drift", title: "Sustained distressed drift", bar: 68, speed: 88, drift: 96, tier: 0, vehicle: "circle" },
  { id: "chase-tier-3", title: "Chase tier 3", bar: 76, speed: 96, drift: 28, tier: 3, vehicle: "launch" },
  { id: "capture-reset", title: "Collision, capture, and reset", bar: 88, speed: 64, drift: 0, tier: 3, vehicle: "linked", cues: ["collision", "capture", "reset"] },
];

try {
  await waitForServer(`http://127.0.0.1:${port}/drive/labs/soundtrack/`);
  const browser = await chromium.launch({
    headless: true,
    executablePath: chromeExecutable(),
    args: ["--autoplay-policy=no-user-gesture-required"],
  });
  const results = [];
  try {
    for (const scenario of scenarios) {
      const page = await browser.newPage({ acceptDownloads: true });
      const errors = [];
      page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${port}/drive/labs/soundtrack/`, { waitUntil: "networkidle" });
      await page.locator("#soundtrack").selectOption(trackId);
      await page.locator("#start-audio").click();
      await page.locator("#start-audio").filter({ hasText: "Soundtrack running" }).waitFor();
      await page.locator("#bar").fill(String(scenario.bar % trackBars));
      await page.locator("#speed").fill(String(scenario.speed));
      await page.locator("#drift").fill(String(scenario.drift));
      await page.locator("#chase-tier").selectOption(String(scenario.tier));
      await page.locator("#vehicle-scenario").selectOption(scenario.vehicle);
      await page.locator("#mix-isolation").selectOption("full");
      await page.locator("#record-mix").click();
      if (scenario.cues) {
        await page.waitForTimeout(durationMs * 0.28);
        await page.locator(`[data-cue='${scenario.cues[0]}']`).click();
        await page.waitForTimeout(durationMs * 0.24);
        await page.locator(`[data-cue='${scenario.cues[1]}']`).click();
        await page.waitForTimeout(durationMs * 0.24);
        await page.locator(`[data-cue='${scenario.cues[2]}']`).click();
        await page.waitForTimeout(durationMs * 0.24);
      } else {
        await page.waitForTimeout(durationMs);
      }
      const downloadPromise = page.waitForEvent("download");
      await page.locator("#record-mix").click();
      const download = await downloadPromise;
      const recordingPath = join(outputDirectory, `${scenario.id}.webm`);
      await download.saveAs(recordingPath);
      const metrics = await analyze(recordingPath);
      results.push({ ...scenario, ...metrics, errors });
      await page.close();
      process.stdout.write(`Captured ${scenario.title}: ${metrics.integratedLufs.toFixed(1)} LUFS\n`);
    }
  } finally {
    await browser.close();
  }
  await mkdir(join(root, "reports"), { recursive: true });
  const reportPath = join(root, "reports", `soundtrack-analysis-${trackId}.md`);
  await writeFile(reportPath, renderReport(results, trackId), "utf8");
  process.stdout.write(`Report: ${reportPath}\nTemporary captures: ${outputDirectory}\n`);
  const regressions = results.filter((result) => (
    result.truePeak > -1
    || result.integratedLufs > -12
    || result.integratedLufs < -27
    || result.errors.length > 0
  ));
  if (regressions.length > 0) {
    console.error(`Soundtrack regression: ${regressions.map((result) => result.title).join(", ")}`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(serverLog);
  throw error;
} finally {
  server.kill("SIGTERM");
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* server is still starting */ }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error("Timed out waiting for soundtrack lab server.");
}

function chromeExecutable() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  if (process.platform === "darwin") return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  return "/usr/bin/google-chrome";
}

async function analyze(path) {
  const [
    { stderr: loudness },
    { stderr: volume },
    { stderr: stats },
    { stderr: tireBand },
    { stderr: lowBand },
  ] = await Promise.all([
    execute("ffmpeg", ["-hide_banner", "-nostats", "-i", path, "-filter_complex", "ebur128=peak=true", "-f", "null", "-"]),
    execute("ffmpeg", ["-hide_banner", "-nostats", "-i", path, "-af", "volumedetect", "-f", "null", "-"]),
    execute("ffmpeg", ["-hide_banner", "-nostats", "-i", path, "-af", "astats=metadata=1:reset=0", "-f", "null", "-"]),
    execute("ffmpeg", ["-hide_banner", "-nostats", "-i", path, "-af", "highpass=f=1000,lowpass=f=3000,volumedetect", "-f", "null", "-"]),
    execute("ffmpeg", ["-hide_banner", "-nostats", "-i", path, "-af", "lowpass=f=250,volumedetect", "-f", "null", "-"]),
  ]);
  return {
    integratedLufs: lastNumber(loudness, /I:\s+(-?[\d.]+) LUFS/gu),
    loudnessRange: lastNumber(loudness, /LRA:\s+(-?[\d.]+) LU/gu),
    truePeak: lastNumber(loudness, /Peak:\s+(-?[\d.]+) dBFS/gu),
    meanDb: lastNumber(volume, /mean_volume:\s+(-?[\d.]+) dB/gu),
    maxDb: lastNumber(volume, /max_volume:\s+(-?[\d.]+) dB/gu),
    crestFactor: lastNumber(stats, /Crest factor:\s+([\d.]+)/gu),
    tireBandMean: lastNumber(tireBand, /mean_volume:\s+(-?[\d.]+) dB/gu),
    lowBandMean: lastNumber(lowBand, /mean_volume:\s+(-?[\d.]+) dB/gu),
  };
}

function lastNumber(text, pattern) {
  const matches = [...text.matchAll(pattern)];
  if (matches.length === 0) throw new Error(`Could not parse FFmpeg output with ${pattern}`);
  return Number(matches.at(-1)[1]);
}

function renderReport(results, analyzedTrackId) {
  const rows = results.map((result) => {
    const warnings = [
      result.truePeak > -1 ? "peak" : "",
      result.integratedLufs > -12 ? "loud" : "",
      result.integratedLufs < -26 ? "quiet" : "",
      result.errors.length ? "browser error" : "",
    ].filter(Boolean).join(", ") || "—";
    return `| ${result.title} | ${result.integratedLufs.toFixed(1)} | ${result.loudnessRange.toFixed(1)} | ${result.truePeak.toFixed(1)} | ${result.tireBandMean.toFixed(1)} | ${result.lowBandMean.toFixed(1)} | ${result.crestFactor.toFixed(2)} | ${warnings} |`;
  }).join("\n");
  return `# Soundtrack Mix Analysis — ${analyzedTrackId}\n\nGenerated by \`pnpm soundtrack:analyze\` from deterministic Soundtrack Lab captures. Captures are temporary and are not repository assets.\n\n## Targets\n\n- Complete mix true peak: at or below −1 dBFS.\n- Complete-mix integrated loudness: approximately −24 to −12 LUFS depending on state.\n- No browser or AudioWorklet errors.\n- Scenario-to-scenario level changes should support gameplay without making Chase or drifting disproportionately loud.\n\n## Results\n\n| Scenario | LUFS-I | LRA | True peak dBFS | 1–3 kHz mean | <250 Hz mean | Crest factor | Warnings |\n|---|---:|---:|---:|---:|---:|---:|---|\n${rows}\n\n## Interpretation\n\nThis report catches clipping, gross level regressions, unexpectedly flat dynamics, and large changes in the tire-critical 1–3 kHz or engine/bass region below 250 Hz. All scenarios use the production engine/tire worklets through the shared complete-game mixer. Band levels are diagnostics rather than pass/fail psychoacoustic masking scores, so listening review remains required.\n`;
}

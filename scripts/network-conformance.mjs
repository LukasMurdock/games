import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import process from "node:process";
import { chromium } from "playwright-core";

const port = Number(process.env.GAMENET_TEST_PORT ?? 4175);
const baseUrl = `http://127.0.0.1:${port}/network-test/`;
const executablePath = await findBrowserExecutable();
const server = spawn(
  "pnpm",
  ["exec", "vite", "dev", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] },
);
let serverOutput = "";
server.stdout.on("data", (chunk) => (serverOutput += chunk));
server.stderr.on("data", (chunk) => (serverOutput += chunk));

let browser;
try {
  await waitForServer(baseUrl);
  browser = await chromium.launch({ headless: true, executablePath });
  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();
  await host.goto(baseUrl);
  const browserProof = await host.evaluate(async () => {
    const { signResponseProof } = await import("/src/net/invite/proof.ts");
    const sessionId = Uint8Array.from("00112233445566778899aabbccddeeff".match(/../gu), (byte) => Number.parseInt(byte, 16));
    const secret = Uint8Array.from(
      "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f".match(/../gu),
      (byte) => Number.parseInt(byte, 16),
    );
    const proof = await signResponseProof(
      secret,
      sessionId,
      3,
      "v=0\r\no=- 2 2 IN IP4 127.0.0.1\r\n",
    );
    return [...proof].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  });
  if (browserProof !== "6d970529b604d4acf2b2808087a355a7aefbf381ad21f43a9b5523e145b4caf8") {
    throw new Error("Browser Web Crypto did not match the Direct Response proof fixture.");
  }
  const clients = [];

  for (let index = 0; index < 7; index++) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const responseUrl = await joinClient(host, page, index);
    clients.push({ context, page, responseUrl });
    console.log(`joined client ${index + 1}: ${await page.textContent("#player-id-status")}`);
  }

  await host.waitForFunction(
    () => document.querySelector("#player-count-status")?.textContent === "8",
    undefined,
    { timeout: 15_000 },
  );
  for (const { page } of clients) {
    await page.waitForFunction(
      () => document.querySelector("#player-count-status")?.textContent === "8",
      undefined,
      { timeout: 15_000 },
    );
  }
  if (!(await host.isDisabled("#create-offer"))) {
    throw new Error("Host allowed more than seven remote client slots.");
  }

  const beforeMove = await host.locator("#circle-arena").screenshot();
  await clients[6].page.keyboard.down("ArrowRight");
  await new Promise((resolve) => setTimeout(resolve, 500));
  await clients[6].page.keyboard.up("ArrowRight");
  await new Promise((resolve) => setTimeout(resolve, 150));
  const afterMove = await host.locator("#circle-arena").screenshot();
  if (beforeMove.equals(afterMove)) {
    throw new Error("Remote client input did not change the authoritative host canvas.");
  }

  const replayLanding = await hostContext.newPage();
  await replayLanding.goto(clients[0].responseUrl);
  await replayLanding.waitForFunction(
    () => document.querySelector("#direct-action-status")?.textContent?.includes("already used"),
    undefined,
    { timeout: 10_000 },
  );
  await replayLanding.close();

  await clients[3].page.click("#close-connection");
  await host.waitForFunction(
    () => document.querySelector("#player-count-status")?.textContent === "7",
    undefined,
    { timeout: 10_000 },
  );
  if (await clients[4].page.textContent("#game-session-status") !== "connected") {
    throw new Error("Closing one client disrupted another client.");
  }

  await host.click("#close-connection");
  for (const [index, client] of clients.entries()) {
    if (index === 3) continue;
    await client.page.waitForFunction(
      () => document.querySelector("#game-session-status")?.textContent === "closed",
      undefined,
      { timeout: 10_000 },
    );
  }

  console.log("GameNet browser conformance passed: 1 host + 7 clients.");
  await Promise.all(clients.map(({ context }) => context.close()));
  await hostContext.close();
  await testDrivingPilot(browser);
  await testPublicDrivingMultiplayer(browser);
  await testSinglePlayerDriving(browser);
} catch (error) {
  if (serverOutput) console.error(serverOutput);
  throw error;
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}

async function testPublicDrivingMultiplayer(browserInstance) {
  const hostContext = await browserInstance.newContext();
  const clientContext = await browserInstance.newContext();
  await hostContext.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: `http://127.0.0.1:${port}`,
  });
  const host = await hostContext.newPage();
  const client = await clientContext.newPage();
  await host.goto(`http://127.0.0.1:${port}/?multiplayer=host`);
  await host.waitForSelector(".multiplayer-host-controls");
  await host.fill(".multiplayer-host-controls input", "Jamie");
  await host.click(".multiplayer-host-controls > button");
  const inviteButton = host.locator(".multiplayer-slot button[data-url]");
  await inviteButton.waitFor({ state: "visible", timeout: 20_000 });
  const inviteUrl = await inviteButton.getAttribute("data-url");
  if (!inviteUrl) throw new Error("Public driving host did not create an invite.");
  await inviteButton.click();
  await host.waitForFunction(
    () => document.querySelector(".multiplayer-slot button[data-url]")?.textContent === "Copied!",
    undefined,
    { timeout: 5_000 },
  );
  await client.goto(inviteUrl);
  const responseOutput = client.locator("#multiplayer-overlay output");
  await responseOutput.waitFor({ state: "visible", timeout: 20_000 });
  const responseUrl = await responseOutput.textContent();
  if (!responseUrl?.includes("#response=")) throw new Error("Public driving client did not create a response.");
  const landing = await hostContext.newPage();
  await landing.goto(responseUrl);
  await Promise.all([host, client].map((page) => page.waitForFunction(
    () => document.querySelector(".multiplayer-player-count")?.textContent?.startsWith("2 players"),
    undefined,
    { timeout: 20_000 },
  )));
  if (!landing.isClosed()) await landing.close();
  await host.keyboard.press("KeyC");
  await host.waitForFunction(
    () => document.querySelector("#camera-button")?.title.includes("Isometric"),
  );
  await host.keyboard.press("KeyC");
  await host.keyboard.press("KeyC");
  await host.waitForFunction(
    () => document.querySelector("#camera-button")?.title.includes("Chase"),
  );
  await host.click("#pause-button");
  await host.waitForFunction(
    () => document.querySelector(".multiplayer-status")?.textContent?.includes("paused by host"),
  );
  if (await host.isHidden("#pause-button")) throw new Error("Multiplayer host pause control is hidden.");
  await new Promise((resolve) => setTimeout(resolve, 50));
  const pausedVehicleBefore = await host.locator("#driving-game").getAttribute("data-local-vehicle-position");
  const pausedCameraBefore = await host.locator("#driving-game").getAttribute("data-local-camera-position");
  await new Promise((resolve) => setTimeout(resolve, 250));
  const pausedVehicleAfter = await host.locator("#driving-game").getAttribute("data-local-vehicle-position");
  const pausedCameraAfter = await host.locator("#driving-game").getAttribute("data-local-camera-position");
  if (pausedVehicleBefore !== pausedVehicleAfter || pausedCameraBefore !== pausedCameraAfter) {
    throw new Error("Paused multiplayer vehicle or camera presentation continued moving.");
  }
  await host.click("#pause-button");
  await host.waitForFunction(
    () => document.querySelector(".multiplayer-status")?.textContent?.includes("resumed"),
  );
  await host.selectOption(".multiplayer-map", "crosswind");
  await host.selectOption(".multiplayer-map", "city-circuit");
  if (await host.locator(".multiplayer-map").inputValue() !== "crosswind") {
    throw new Error("Host accepted an overlapping map transition.");
  }
  await client.waitForFunction(
    () => document.querySelector("#driving-game")?.getAttribute("data-game-map") === "crosswind",
    undefined,
    { timeout: 20_000 },
  );
  await host.waitForFunction(
    () => {
      const button = document.querySelector("#pause-button");
      return button instanceof HTMLButtonElement && !button.disabled;
    },
    undefined,
    { timeout: 20_000 },
  );
  await host.click("#pause-button");
  await client.waitForFunction(
    () => document.querySelector(".multiplayer-diagnostics")?.textContent?.includes("RTT"),
    undefined,
    { timeout: 10_000 },
  );
  await client.waitForFunction(
    () => document.querySelector(".multiplayer-status")?.textContent === "Connected to host.",
    undefined,
    { timeout: 10_000 },
  );
  const before = await host.locator("#game-canvas").screenshot();
  await client.keyboard.down("ArrowRight");
  await new Promise((resolve) => setTimeout(resolve, 700));
  await client.keyboard.up("ArrowRight");
  const after = await host.locator("#game-canvas").screenshot();
  if (before.equals(after)) throw new Error("Public multiplayer driving presentation did not advance.");
  await client.click(".multiplayer-leave");
  await host.waitForFunction(
    () => document.querySelector(".multiplayer-player-count")?.textContent?.startsWith("1 player"),
    undefined,
    { timeout: 10_000 },
  );

  await host.fill(".multiplayer-host-controls input", "Taylor");
  await host.click(".multiplayer-host-controls > button");
  await host.waitForFunction(
    () => document.querySelectorAll(".multiplayer-slot button[data-url]").length === 2,
    undefined,
    { timeout: 20_000 },
  );
  const secondInviteButton = host.locator(".multiplayer-slot button[data-url]").last();
  await secondInviteButton.waitFor({ state: "visible", timeout: 20_000 });
  const secondInviteUrl = await secondInviteButton.getAttribute("data-url");
  if (!secondInviteUrl) throw new Error("Host could not replace a departed player's invite slot.");
  await client.goto(secondInviteUrl);
  const secondResponseOutput = client.locator("#multiplayer-overlay output");
  await secondResponseOutput.waitFor({ state: "visible", timeout: 20_000 });
  const secondResponseUrl = await secondResponseOutput.textContent();
  if (!secondResponseUrl) throw new Error("Replacement client did not create a response.");
  const secondLanding = await hostContext.newPage();
  await secondLanding.goto(secondResponseUrl);
  await client.waitForFunction(
    () => document.querySelector(".multiplayer-player-count")?.textContent?.startsWith("2 players"),
    undefined,
    { timeout: 20_000 },
  );
  if (!secondLanding.isClosed()) await secondLanding.close();
  await host.click(".multiplayer-leave");
  await client.waitForFunction(
    () => document.querySelector(".multiplayer-status")?.textContent?.includes("host ended"),
    undefined,
    { timeout: 10_000 },
  );
  await Promise.all([hostContext.close(), clientContext.close()]);
  console.log("Public driving multiplayer passed: invites, two cars, isolated leave, replacement, and host close.");
}

async function testSinglePlayerDriving(browserInstance) {
  const context = await browserInstance.newContext();
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.click("#start-driving");
  const before = await page.locator("#game-canvas").screenshot();
  await page.keyboard.down("ArrowLeft");
  await new Promise((resolve) => setTimeout(resolve, 700));
  await page.keyboard.up("ArrowLeft");
  const after = await page.locator("#game-canvas").screenshot();
  if (before.equals(after)) throw new Error("Extracted local driving simulation did not advance presentation.");
  if (pageErrors.length > 0) throw pageErrors[0];
  await context.close();
  console.log("Single-player driving smoke test passed after simulation extraction.");
}

async function testDrivingPilot(browserInstance) {
  const hostContext = await browserInstance.newContext();
  const clientContext = await browserInstance.newContext();
  const host = await hostContext.newPage();
  const client = await clientContext.newPage();
  await host.goto(`${baseUrl}?game=driving`);
  if (await host.textContent("#game-title") !== "Authoritative driving") {
    throw new Error("Driving multiplayer mode did not select its protocol adapter.");
  }
  await joinClient(host, client, 0);
  await Promise.all([host, client].map((page) => page.waitForFunction(
    () => document.querySelector("#player-count-status")?.textContent === "2",
    undefined,
    { timeout: 15_000 },
  )));
  const beforeMove = await host.locator("#circle-arena").screenshot();
  await client.keyboard.down("ArrowRight");
  await new Promise((resolve) => setTimeout(resolve, 800));
  await client.keyboard.up("ArrowRight");
  await new Promise((resolve) => setTimeout(resolve, 150));
  const afterMove = await host.locator("#circle-arena").screenshot();
  if (beforeMove.equals(afterMove)) {
    throw new Error("Production driving intent did not change interpolated authoritative vehicle state.");
  }
  await host.click("#close-connection");
  await client.waitForFunction(
    () => document.querySelector("#game-session-status")?.textContent === "closed",
    undefined,
    { timeout: 10_000 },
  );
  await Promise.all([hostContext.close(), clientContext.close()]);
  console.log("Production driving browser path passed: two interpolated cars over Direct Invite links.");
}

async function joinClient(host, client, index) {
  await host.fill("#invite-name", `Friend ${index + 1}`);
  await host.click("#create-offer");
  const slot = host.locator(".host-slot").nth(index);
  await host.waitForFunction(
    (slotIndex) => {
      const link = document.querySelectorAll(".host-slot")[slotIndex]
        ?.querySelector(".host-slot__invite");
      return link instanceof HTMLElement && link.dataset.url?.includes("#invite=");
    },
    index,
    { timeout: 20_000 },
  );
  const inviteUrl = await slot.locator(".host-slot__invite").getAttribute("data-url");
  if (!inviteUrl) throw new Error(`Client slot ${index + 1} did not produce an invite URL.`);
  await client.goto(inviteUrl);
  await client.waitForFunction(
    () => {
      const link = document.querySelector("#direct-action-link");
      return link instanceof HTMLOutputElement && link.value.includes("#response=");
    },
    undefined,
    { timeout: 20_000 },
  );
  if (await client.evaluate(() => window.location.hash) !== "") {
    throw new Error("Invite capability remained in the client URL after decoding.");
  }
  if (await slot.locator("strong").textContent() !== `Friend ${index + 1}`) {
    throw new Error("Host-local invite name was not retained.");
  }
  const responseUrl = await client.locator("#direct-action-link").textContent();
  if (!responseUrl) throw new Error(`Client ${index + 1} did not produce a response URL.`);
  const landing = await host.context().newPage();
  await landing.goto(responseUrl);
  await client.waitForFunction(
    () => document.querySelector("#game-session-status")?.textContent === "connected",
    undefined,
    { timeout: 15_000 },
  );
  await slot.locator(".host-slot__status").waitFor({ state: "visible" });
  await host.waitForFunction(
    (slotIndex) => document.querySelectorAll(".host-slot")[slotIndex]
      ?.querySelector(".host-slot__status")?.textContent === "connected",
    index,
    { timeout: 15_000 },
  );
  if (!landing.isClosed()) await landing.close();
  return responseUrl;
}

async function waitForServer(url) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Vite exited early with code ${server.exitCode}.`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${url}.`);
}

async function findBrowserExecutable() {
  const candidates = [
    process.env.GAMENET_BROWSER_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next installed browser.
    }
  }
  throw new Error(
    "No Chromium browser found. Set GAMENET_BROWSER_PATH to a Chrome/Chromium executable.",
  );
}

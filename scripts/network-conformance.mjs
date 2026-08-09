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
} catch (error) {
  if (serverOutput) console.error(serverOutput);
  throw error;
} finally {
  await browser?.close();
  server.kill("SIGTERM");
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

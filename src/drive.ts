import "./styles/drive.css";
import {
  DEFAULT_GAME_MAP_ID,
  GAME_MAPS,
  isGameMapId,
  startDrivingGame,
} from "./lib/driving-game";

const mapSelect = document.querySelector<HTMLElement>(".map-select");
if (mapSelect) {
  for (const map of Object.values(GAME_MAPS)) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.mapOption = map.id;
    button.setAttribute("aria-pressed", "false");

    const title = document.createElement("strong");
    title.textContent = map.title;
    const description = document.createElement("span");
    description.textContent = map.description;
    button.append(title, description);
    mapSelect.append(button);
  }
}

const root = document.querySelector<HTMLElement>("#driving-game");
if (root) void startSelectedDrivingMode(root);

async function startSelectedDrivingMode(gameRoot: HTMLElement) {
  const directFragment = /^#(?:invite|response)=/u.test(window.location.hash)
    ? window.location.hash
    : null;
  if (directFragment) {
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
  }
  const searchParams = new URLSearchParams(window.location.search);
  const multiplayerMode = searchParams.get("multiplayer");
  if (multiplayerMode === "host" || directFragment) {
    const multiplayer = await import("./lib/driving-game/multiplayer/browser-runtime");
    if (multiplayerMode === "host") {
      await multiplayer.startHostedDrivingGame(gameRoot);
      return;
    }
    const decoded = multiplayer.decodeDrivingDirectFragment(directFragment as string);
    if (!decoded.ok) {
      showMultiplayerError(gameRoot, decoded.error.message);
      return;
    }
    if (decoded.value.message.type === "invite") {
      await multiplayer.startJoinedDrivingGame(gameRoot, decoded.value.message);
    } else {
      await multiplayer.handleDrivingResponseLanding(
        gameRoot,
        decoded.value.message,
        directFragment as string,
      );
    }
    return;
  }

  const selectedMode = searchParams.get("mode") === "chase" ? "chase" : "cruise";
  const requestedMap = searchParams.get("map");
  const selectedMap = isGameMapId(requestedMap) ? requestedMap : DEFAULT_GAME_MAP_ID;
  startDrivingGame(gameRoot, { mode: selectedMode, map: selectedMap });
}

function showMultiplayerError(gameRoot: HTMLElement, message: string) {
  const overlay = gameRoot.querySelector<HTMLElement>("#multiplayer-overlay");
  if (!overlay) return;
  overlay.hidden = false;
  overlay.innerHTML = `<div class="multiplayer-card"><p class="eyebrow">Drive together</p><h1>Invalid invite</h1><p></p></div>`;
  const paragraph = overlay.querySelector("p:last-child");
  if (paragraph) paragraph.textContent = message;
}

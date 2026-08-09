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
if (root) {
  const searchParams = new URLSearchParams(window.location.search);
  const selectedMode = searchParams.get("mode") === "chase" ? "chase" : "cruise";
  const requestedMap = searchParams.get("map");
  const selectedMap = isGameMapId(requestedMap) ? requestedMap : DEFAULT_GAME_MAP_ID;
  startDrivingGame(root, {
    mode: selectedMode,
    map: selectedMap,
  });
}

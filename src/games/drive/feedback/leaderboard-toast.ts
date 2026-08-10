import type { LocalDriveResult } from "../local-leaderboard";

const DISPLAY_DURATION = 2600;
const FADE_DURATION = 420;

export type LeaderboardToast = {
  show: (results: LocalDriveResult[], currentResultId: string, title: string) => void;
  toggle: (results: LocalDriveResult[], title: string) => boolean;
  destroy: () => void;
};

export function createLeaderboardToast(root: HTMLElement): LeaderboardToast {
  let fadeTimer: number | null = null;
  let hideTimer: number | null = null;
  let pinned = false;

  function clearTimers() {
    if (fadeTimer !== null) window.clearTimeout(fadeTimer);
    if (hideTimer !== null) window.clearTimeout(hideTimer);
    fadeTimer = null;
    hideTimer = null;
  }

  function hide() {
    root.classList.remove("is-visible", "is-leaving");
    root.setAttribute("aria-hidden", "true");
  }

  function reveal() {
    root.classList.remove("is-leaving");
    root.classList.add("is-visible");
    root.setAttribute("aria-hidden", "false");
  }

  function render(results: LocalDriveResult[], currentResultId: string | null, title: string) {
    const heading = document.createElement("strong");
    heading.className = "drive-leaderboard__title";
    heading.textContent = title;
    if (results.length === 0) {
      const empty = document.createElement("p");
      empty.className = "drive-leaderboard__empty";
      empty.textContent = "No drives yet";
      root.replaceChildren(heading, empty);
      return;
    }

    const list = document.createElement("ol");
    list.className = "drive-leaderboard__list";
    const currentIndex = results.findIndex((result) => result.id === currentResultId);
    const displayedResults = currentIndex < 5
      ? results.slice(0, 5)
      : [...results.slice(0, 4), results[currentIndex]];
    displayedResults.forEach((result) => {
      const item = document.createElement("li");
      if (result.id === currentResultId) item.className = "is-current";
      const rank = document.createElement("span");
      rank.textContent = String(results.indexOf(result) + 1).padStart(2, "0");
      const time = document.createElement("strong");
      time.textContent = formatDuration(result.durationSeconds);
      item.append(rank, time);
      list.append(item);
    });
    root.replaceChildren(heading, list);
  }

  return {
    show(results, currentResultId, title) {
      clearTimers();
      render(results, currentResultId, title);
      reveal();
      if (pinned) return;
      fadeTimer = window.setTimeout(() => root.classList.add("is-leaving"), DISPLAY_DURATION);
      hideTimer = window.setTimeout(hide, DISPLAY_DURATION + FADE_DURATION);
    },
    toggle(results, title) {
      clearTimers();
      pinned = !pinned;
      if (!pinned) {
        hide();
        return false;
      }
      render(results, null, title);
      reveal();
      return true;
    },
    destroy() {
      clearTimers();
      pinned = false;
      hide();
      root.replaceChildren();
    },
  };
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.max(0, seconds - minutes * 60);
  return `${minutes}:${remainder.toFixed(2).padStart(5, "0")}`;
}

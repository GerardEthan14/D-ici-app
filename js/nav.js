import { $ } from "./utils.js";
import { renderBadges, updateRPG } from "./rpg.js";
import { renderAdminPanel, renderLeaderboard } from "./profil.js";
import { getDlcView } from "./dlc.js";
import { render } from "./bus.js";

const PANELS = ["todo", "dlc", "info", "stock", "profil"];

let currentPanel = "todo";
export function getCurrentPanel() {
  return currentPanel;
}

export function switchPanel(p) {
  currentPanel = p;
  PANELS.forEach((id) => {
    $("panel-" + id).classList.toggle("active", id === p);
    $("nav-" + id).classList.toggle("active", id === p);
  });
  if (p === "profil") {
    renderBadges();
    updateRPG();
    renderLeaderboard();
    renderAdminPanel();
  }
  if (p === "stock") render.stock?.();
  if (p === "info") render.info?.();
  updateFabVisibility();
}

export function updateFabVisibility() {
  const fab = $("fab-add");
  if (!fab) return;
  const show = currentPanel === "dlc";
  fab.classList.toggle("visible", show);
}

export function fabContextualOpen(openModal) {
  if (currentPanel === "dlc") {
    if (getDlcView() === "vrac") openModal("modal-add-vrac");
    else openModal("modal-add-dlc");
  }
}

render.updateFab = updateFabVisibility;

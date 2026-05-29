import { $ } from "./utils.js";
import { renderBadges, updateRPG } from "./rpg.js";
import { renderAdminPanel, renderLeaderboard } from "./profil.js";
import { getDlcView } from "./dlc.js";
import { render } from "./bus.js";

const PANELS = ["todo", "dlc", "commandes", "reserve", "profil"];

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
  updateFabVisibility();
}

export function updateFabVisibility() {
  const fab = $("fab-add");
  if (!fab) return;
  const show =
    currentPanel === "dlc" || currentPanel === "commandes" || currentPanel === "reserve";
  fab.classList.toggle("visible", show);
}

export function fabContextualOpen(openModal) {
  if (currentPanel === "dlc") {
    if (getDlcView() === "vrac") openModal("modal-add-vrac");
    else openModal("modal-add-dlc");
  } else if (currentPanel === "commandes") openModal("modal-add-order");
  else if (currentPanel === "reserve") openModal("modal-add-reserve");
}

render.updateFab = updateFabVisibility;

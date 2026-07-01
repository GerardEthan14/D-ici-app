import { $, esc, fmtD, toast } from "./utils.js";
import { SHARED } from "./state.js";
import { fbPushOrLocal, fbRemoveOrLocal, fbUpdateOrLocal } from "./firebase.js";
import { gainXP } from "./rpg.js";
import { closeModal, openModal } from "./modals.js";
import { saveProductToCatalog } from "./productCatalog.js";
import { dlcStatus } from "./dlc.js";
import { render } from "./bus.js";

export function renderVrac() {
  const el = $("vrac-list");
  if (!el) return;
  if (!SHARED.vrac.length) {
    el.innerHTML = `<div class="empty-state"><p>Aucun produit en vrac enregistré.</p></div>`;
    return;
  }
  const sorted = [...SHARED.vrac].sort((a, b) => {
    const na = parseInt(a.num) || 0;
    const nb = parseInt(b.num) || 0;
    if (na !== nb) return na - nb;
    return (a.lot || "").localeCompare(b.lot || "");
  });
  el.innerHTML = sorted
    .map((v) => {
      const s = v.date ? dlcStatus(v.date) : null;
      const chip = s
        ? `<div class="dlc-chip ${s.cls}">${fmtD(v.date)}<br><small>${s.label}</small></div>`
        : `<div class="dlc-chip dlc-ok vrac-no-date">—</div>`;
      return `<div class="dlc-row">
      <div class="vrac-num-chip">${esc(String(v.num || "?"))}</div>
      <div class="dlc-info">
        <div class="dlc-name">${esc(v.name || "—")} ${v.lot ? `<span class="vrac-lot-chip">Lot ${esc(v.lot)}</span>` : ""}</div>
        <div class="dlc-meta">${v.supplier ? `🏭 ${esc(v.supplier)}` : ""}</div>
      </div>
      ${chip}
      <button class="icon-btn icon-edit" data-action="edit-vrac" data-id="${esc(v.id)}">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button class="icon-btn danger icon-sm" data-action="del-vrac" data-id="${esc(v.id)}">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg>
      </button>
    </div>`;
    })
    .join("");
}

export function bindVracEvents() {
  $("vrac-list")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    if (btn.dataset.action === "edit-vrac") openEditVrac(btn.dataset.id);
    else if (btn.dataset.action === "del-vrac") {
      const v = SHARED.vrac.find((x) => x.id === btn.dataset.id);
      if (v && confirm(`Supprimer le vrac #${v.num} (${v.name}) ?`))
        fbRemoveOrLocal("vrac", btn.dataset.id);
    }
  });
}

export async function addVrac() {
  const num = $("vrac-num").value.trim();
  const name = $("vrac-name").value.trim();
  const lot = $("vrac-lot").value.trim().toUpperCase();
  const sup = $("vrac-sup").value.trim();
  const date = $("vrac-date").value;
  if (!num || !name) {
    toast("⚠️ Numéro et nom requis");
    return;
  }
  await fbPushOrLocal("vrac", {
    num: parseInt(num) || num,
    name,
    lot,
    supplier: sup,
    date,
  });
  if ($("vrac-save-product").checked) saveProductToCatalog(name, sup);
  gainXP("dlc_add");
  ["vrac-num", "vrac-name", "vrac-lot", "vrac-sup", "vrac-date"].forEach((i) => ($(i).value = ""));
  closeModal("modal-add-vrac");
  toast("🌾 Vrac enregistré +10 XP", true);
}

export function openEditVrac(id) {
  const v = SHARED.vrac.find((x) => x.id === id);
  if (!v) return;
  $("edit-vrac-id").value = id;
  $("edit-vrac-num").value = v.num || "";
  $("edit-vrac-name").value = v.name || "";
  $("edit-vrac-lot").value = v.lot || "";
  $("edit-vrac-sup").value = v.supplier || "";
  $("edit-vrac-date").value = v.date || "";
  openModal("modal-edit-vrac");
}

export async function saveEditVrac() {
  const id = $("edit-vrac-id").value;
  const v = SHARED.vrac.find((x) => x.id === id);
  if (!v) return;
  const num = $("edit-vrac-num").value.trim();
  const name = $("edit-vrac-name").value.trim();
  if (!num || !name) {
    toast("⚠️ Numéro et nom requis");
    return;
  }
  const updated = {
    ...v,
    num: parseInt(num) || num,
    name,
    lot: $("edit-vrac-lot").value.trim().toUpperCase(),
    supplier: $("edit-vrac-sup").value.trim(),
    date: $("edit-vrac-date").value,
  };
  await fbUpdateOrLocal("vrac", id, updated);
  closeModal("modal-edit-vrac");
  toast("✅ Vrac modifié");
}

render.vrac = renderVrac;

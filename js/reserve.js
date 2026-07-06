import { $, esc, toast } from "./utils.js";
import { SHARED, LOCAL, saveLocal } from "./state.js";
import { fbPushOrLocal, fbRemoveOrLocal, fbUpdateOrLocal, fbSet, fbRemove, sp } from "./firebase.js";
import { gainXP } from "./rpg.js";
import { closeModal, openModal } from "./modals.js";
import { saveProductToCatalog } from "./productCatalog.js";
import { render } from "./bus.js";

/* ── Zone definitions ───────────────────────────────── */

const TOP_COLS = 16;
const BOTTOM_COLS = 15;
const BOTTOM_ROWS = 3;

function buildZoneConfig() {
  const zones = [];
  const SKIP = ["M3", "N3", "O3"];
  const topY = 10, topH = 90;
  const topStartX = 10, topEndX = 790;
  const topW = (topEndX - topStartX) / TOP_COLS;
  for (let i = 0; i < TOP_COLS; i++) {
    const id = "top_" + (i + 1);
    zones.push({ id, defLabel: String(i + 1), x: topStartX + i * topW + 2, y: topY, w: topW - 4, h: topH });
  }
  const letters = "ABCDEFGHIJKLMNO";
  const gridY = 180, gridH = 60, gridGapY = 5;
  const gridStartX = 10, gridEndX = 790;
  const gridW = (gridEndX - gridStartX) / BOTTOM_COLS;
  for (let row = 2; row >= 0; row--) {
    for (let col = 0; col < BOTTOM_COLS; col++) {
      const defLabel = letters[col] + (row + 1);
      if (SKIP.includes(defLabel)) continue;
      const rowOrderInSvg = 2 - row;
      zones.push({
        id: "bot_" + defLabel,
        defLabel,
        x: gridStartX + col * gridW + 1,
        y: gridY + rowOrderInSvg * (gridH + gridGapY),
        w: gridW - 2,
        h: gridH,
      });
    }
  }
  return zones;
}

const ZONE_CONFIG = buildZoneConfig();

export function getZoneConfig() {
  return ZONE_CONFIG;
}

export function getZoneData(z) {
  const override = SHARED.zones[z.id];
  return {
    ...z,
    label: (override && override.label) || z.defLabel,
    subtitle: (override && override.sub) || "",
  };
}

function getZonesWithStock() {
  const set = new Set();
  const labels = ZONE_CONFIG.map((z) => getZoneData(z));
  const addLoc = (loc) => {
    if (!loc) return;
    const locLower = loc.trim().toLowerCase();
    const match = labels.find((z) => z.label.trim().toLowerCase() === locLower);
    if (match) set.add(match.id);
  };
  // Le plan se base sur la base de données : produits en réserve
  // ET produits comptés dans l'inventaire.
  SHARED.reserve.forEach((r) => addLoc(r.location));
  SHARED.invCounts.forEach((c) => addLoc(c.location));
  return set;
}

/* ── Map ────────────────────────────────────────────── */

let pulsingZoneLabels = new Set();

export function renderReserveMap() {
  const svg = $("reserve-map");
  if (!svg) return;
  const filled = getZonesWithStock();
  let html = "";
  html += `<line class="map-divider" x1="0" y1="90" x2="800" y2="90"/>`;
  for (let i = 2; i < TOP_COLS; i += 2) {
    const x = 10 + i * ((790 - 10) / TOP_COLS);
    html += `<line class="map-divider" x1="${x}" y1="0" x2="${x}" y2="90" opacity="0.4"/>`;
  }
  ZONE_CONFIG.forEach((z) => {
    const zd = getZoneData(z);
    const isPulsing = pulsingZoneLabels.has(zd.label.trim().toLowerCase());
    const isFilled = filled.has(z.id);
    const groupClass = "zone-group" + (isPulsing ? " pulse" : "");
    const rectClass = "zone-rect" + (isFilled ? " filled" : "");
    const cx = z.x + z.w / 2;
    const cy = z.y + z.h / 2;
    const subtitleY = zd.subtitle ? cy + 9 : cy;
    const labelY = zd.subtitle ? cy - 4 : cy;
    html += `<g class="${groupClass}" data-zone-id="${z.id}">
      <rect class="${rectClass}" x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="3"/>
      <text class="zone-label" x="${cx}" y="${labelY}">${esc(zd.label)}</text>
      ${zd.subtitle ? `<text class="zone-sub" x="${cx}" y="${subtitleY}">${esc(zd.subtitle)}</text>` : ""}
    </g>`;
  });
  svg.innerHTML = html;
}

function onMapClick(e) {
  const g = e.target.closest(".zone-group");
  if (!g) return;
  const zoneId = g.dataset.zoneId;
  const z = ZONE_CONFIG.find((x) => x.id === zoneId);
  if (!z) return;
  const override = SHARED.zones[zoneId] || {};
  $("edit-zone-id").value = zoneId;
  $("edit-zone-label").value = override.label || z.defLabel;
  $("edit-zone-sub").value = override.sub || "";
  openModal("modal-edit-zone");
}

export async function saveZone() {
  const id = $("edit-zone-id").value;
  const z = ZONE_CONFIG.find((x) => x.id === id);
  if (!z) return;
  const label = $("edit-zone-label").value.trim();
  const sub = $("edit-zone-sub").value.trim();
  if (!label) {
    toast("⚠️ Nom requis");
    return;
  }
  if (label === z.defLabel && !sub) {
    await fbRemove(sp("zones/" + id));
  } else {
    await fbSet(sp("zones/" + id), { label, sub });
  }
  closeModal("modal-edit-zone");
  toast("✅ Zone mise à jour");
}

export async function resetZone() {
  const id = $("edit-zone-id").value;
  if (!id) return;
  await fbRemove(sp("zones/" + id));
  closeModal("modal-edit-zone");
  toast("↺ Zone réinitialisée");
}

function setPulsingZone(locationLabel) {
  pulsingZoneLabels.clear();
  if (locationLabel) pulsingZoneLabels.add(locationLabel.trim().toLowerCase());
  renderReserveMap();
}

export function toggleMap() {
  const c = $("map-container");
  const chevron = $("map-chevron");
  const wasHidden = c.classList.contains("hidden");
  c.classList.toggle("hidden");
  if (chevron) chevron.style.transform = wasHidden ? "rotate(180deg)" : "rotate(0deg)";
  if (wasHidden) renderReserveMap();
}

/* ── Reserve list ───────────────────────────────────── */

export function getLocations() {
  return [...new Set(SHARED.reserve.map((r) => r.location).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}

const editBtn = (id) =>
  `<button class="icon-btn icon-edit icon-sm" data-action="edit-reserve" data-id="${esc(id)}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>`;
const delBtn = (id) =>
  `<button class="icon-btn danger icon-sm" data-action="del-reserve" data-id="${esc(id)}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg></button>`;

export function renderReserve() {
  const el = $("reserve-list");
  if (!el) return;
  const searchEl = $("res-search");
  const q = searchEl ? searchEl.value.trim().toLowerCase() : "";
  const list = q
    ? SHARED.reserve.filter(
        (r) =>
          (r.name || "").toLowerCase().includes(q) ||
          (r.location || "").toLowerCase().includes(q)
      )
    : SHARED.reserve;

  if (!list.length) {
    el.innerHTML = q
      ? `<div class="empty-state"><p>Aucun résultat pour "${esc(q)}".</p></div>`
      : `<div class="empty-state"><p>Aucun emplacement enregistré.</p></div>`;
    return;
  }

  if (q) {
    const hi = (str) =>
      str.replace(
        new RegExp("(" + q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi"),
        '<mark class="hl">$1</mark>'
      );
    el.innerHTML =
      `<div class="card">` +
      list
        .map(
          (r) => `
        <div class="reserve-row" data-action="pulse-zone" data-loc="${esc(r.location || "")}">
          <div class="reserve-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>
          <div class="reserve-body"><div class="reserve-name">${hi(esc(r.name))}</div>${r.notes ? `<div class="reserve-notes">${esc(r.notes)}</div>` : ""}</div>
          <div class="reserve-loc">${hi(esc(r.location))}</div>
          <div class="reserve-actions">${editBtn(r.id)}${delBtn(r.id)}</div>
        </div>`
        )
        .join("") +
      `</div>`;
    return;
  }

  const groups = {};
  list.forEach((r) => {
    const loc = r.location || "Sans emplacement";
    (groups[loc] ||= []).push(r);
  });
  const sortedLocs = Object.keys(groups).sort((a, b) => {
    const na = parseInt(a), nb = parseInt(b);
    const aIsNum = !isNaN(na) && String(na) === a.trim();
    const bIsNum = !isNaN(nb) && String(nb) === b.trim();
    if (aIsNum && bIsNum) return na - nb;
    if (aIsNum) return -1;
    if (bIsNum) return 1;
    const ma = a.match(/^([A-Za-z]+)(\d+)$/);
    const mb = b.match(/^([A-Za-z]+)(\d+)$/);
    if (ma && mb) {
      const lc = ma[1].localeCompare(mb[1]);
      return lc !== 0 ? lc : parseInt(ma[2]) - parseInt(mb[2]);
    }
    return a.localeCompare(b);
  });

  el.innerHTML = sortedLocs
    .map((loc) => {
      const items = groups[loc].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      return `<div class="reserve-location-group">
      <div class="reserve-location-header" data-action="pulse-zone" data-loc="${esc(loc)}">
        <div class="reserve-location-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>
        <div class="reserve-location-name">${esc(loc)}</div>
        <div class="reserve-location-count">${items.length} produit${items.length > 1 ? "s" : ""}</div>
      </div>
      <div class="card">
        ${items
          .map(
            (r) => `
          <div class="reserve-row" data-action="pulse-zone" data-loc="${esc(loc)}">
            <div class="reserve-body"><div class="reserve-name">${esc(r.name)}</div>${r.notes ? `<div class="reserve-notes">${esc(r.notes)}</div>` : ""}</div>
            <div class="reserve-actions">${editBtn(r.id)}${delBtn(r.id)}</div>
          </div>`
          )
          .join("")}
      </div>
    </div>`;
    })
    .join("");
}

export function bindReserveEvents() {
  $("reserve-list")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    e.stopPropagation();
    if (btn.dataset.action === "del-reserve") {
      const r = SHARED.reserve.find((x) => x.id === btn.dataset.id);
      if (r && confirm(`Supprimer "${r.name}" ?`))
        fbRemoveOrLocal("reserve", btn.dataset.id);
    } else if (btn.dataset.action === "edit-reserve") {
      openEditReserve(btn.dataset.id);
    } else if (btn.dataset.action === "pulse-zone") {
      const c = $("map-container");
      if (c.classList.contains("hidden")) toggleMap();
      setPulsingZone(btn.dataset.loc);
      $("map-container").scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  });
  $("res-search")?.addEventListener("input", renderReserve);
  $("reserve-map")?.addEventListener("click", onMapClick);
}

export async function addReserve() {
  const name = $("rv-prod").value.trim();
  const loc = $("rv-loc").value.trim();
  if (!name || !loc) {
    toast("⚠️ Nom et emplacement requis");
    return;
  }
  await fbPushOrLocal("reserve", {
    name,
    location: loc,
    notes: $("rv-notes").value.trim(),
  });
  if ($("rv-save-product").checked) saveProductToCatalog(name, "");
  LOCAL.rpg.reserveAdded = (LOCAL.rpg.reserveAdded || 0) + 1;
  LOCAL.rpg.reserveLocs = getLocations().length;
  gainXP("reserve_add");
  saveLocal();
  ["rv-prod", "rv-loc", "rv-notes"].forEach((i) => ($(i).value = ""));
  closeModal("modal-add-reserve");
  toast("✅ Emplacement enregistré +5 XP", true);
}

export function openEditReserve(id) {
  const r = SHARED.reserve.find((x) => x.id === id);
  if (!r) return;
  $("edit-rv-id").value = id;
  $("edit-rv-name").value = r.name || "";
  $("edit-rv-loc").value = r.location || "";
  $("edit-rv-notes").value = r.notes || "";
  openModal("modal-edit-reserve");
}

export async function saveEditReserve() {
  const id = $("edit-rv-id").value;
  const r = SHARED.reserve.find((x) => x.id === id);
  if (!r) return;
  const name = $("edit-rv-name").value.trim();
  const loc = $("edit-rv-loc").value.trim();
  if (!name || !loc) {
    toast("⚠️ Nom et emplacement requis");
    return;
  }
  const updated = {
    ...r,
    name,
    location: loc,
    notes: $("edit-rv-notes").value.trim(),
  };
  await fbUpdateOrLocal("reserve", id, updated);
  closeModal("modal-edit-reserve");
  toast("✅ Produit modifié");
}

/* ── Location combos ────────────────────────────────── */

function buildLocCombo(inputId, dropId) {
  const q = $(inputId).value.trim().toLowerCase();
  const drop = $(dropId);
  const locs = getLocations().filter((l) => !q || l.toLowerCase().includes(q));
  let html = locs.map((l) => `<div class="combo-item" data-loc="${esc(l)}">📍 ${esc(l)}</div>`).join("");
  if (q && !locs.find((l) => l.toLowerCase() === q)) {
    html += `<div class="combo-item create" data-loc="${esc(q)}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Créer "${esc(q)}"</div>`;
  } else if (!q) {
    html += `<div class="combo-item create combo-hint">Ou saisir un nouvel emplacement…</div>`;
  }
  drop.innerHTML = html;
  drop.style.display = "block";
  drop.onclick = (e) => {
    const item = e.target.closest(".combo-item");
    if (!item || !item.dataset.loc) return;
    $(inputId).value = item.dataset.loc;
    drop.style.display = "none";
  };
  setTimeout(() => document.addEventListener("click", () => (drop.style.display = "none"), { once: true }), 50);
}

export function showLocCombo() {
  buildLocCombo("rv-loc", "drop-rv-loc");
}
export function showEditReserveLocCombo() {
  buildLocCombo("edit-rv-loc", "drop-edit-rv-loc");
}

render.reserve = renderReserve;
render.zones = renderReserveMap;

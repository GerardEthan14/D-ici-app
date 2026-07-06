import { $, esc, toast } from "./utils.js";
import { SHARED, app } from "./state.js";
import {
  fbPushOrLocal,
  fbRemoveOrLocal,
  fbUpdateOrLocal,
  fbSet,
  fbRemove,
  sp,
} from "./firebase.js";
import { closeModal, openModal } from "./modals.js";
import { getZoneConfig, getZoneData } from "./reserve.js";
import { saveProductToCatalog } from "./productCatalog.js";
import { render } from "./bus.js";

const UNITS = ["pièce", "caisse", "colis", "kg", "palette"];

let mapOpen = false;

/* ── État de la campagne ────────────────────────────── */

function isActive() {
  return !!(SHARED.invMeta && SHARED.invMeta.active);
}

export async function startInventory() {
  if (!app.firebaseMode) {
    toast("⚠️ Connexion requise pour lancer un inventaire");
    return;
  }
  await fbSet(sp("invMeta"), {
    active: true,
    startedAt: Date.now(),
    startedBy: app.username || "?",
  });
  toast("📦 Inventaire démarré !", true);
}

export async function closeInventory() {
  if (!confirm("Clôturer l'inventaire ? Pense à exporter la liste avant. Les comptages seront effacés.")) return;
  // Efface comptages + zones comptées + méta
  for (const c of [...SHARED.invCounts]) await fbRemoveOrLocal("invCounts", c.id);
  await fbRemove(sp("invZones"));
  await fbRemove(sp("invMeta"));
  toast("✅ Inventaire clôturé");
}

/* ── Zones comptées (post-it numériques) ────────────── */

async function toggleZoneCounted(zoneId) {
  if (SHARED.invZones && SHARED.invZones[zoneId]) {
    await fbRemove(sp("invZones/" + zoneId));
  } else {
    await fbSet(sp("invZones/" + zoneId), { by: app.username || "?", at: Date.now() });
  }
}

function countedZoneIds() {
  return new Set(Object.keys(SHARED.invZones || {}));
}

/* ── Carte zones dédiée inventaire ──────────────────── */

export function renderInvMap() {
  const svg = $("inv-map");
  if (!svg) return;
  const counted = countedZoneIds();
  let html = `<line class="map-divider" x1="0" y1="90" x2="800" y2="90"/>`;
  getZoneConfig().forEach((z) => {
    const zd = getZoneData(z);
    const isCounted = counted.has(z.id);
    const cx = z.x + z.w / 2;
    const cy = z.y + z.h / 2;
    const subY = zd.subtitle ? cy + 9 : cy;
    const labelY = zd.subtitle ? cy - 4 : cy;
    html += `<g class="zone-group" data-zone-id="${z.id}">
      <rect class="zone-rect ${isCounted ? "inv-counted" : ""}" x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="3"/>
      <text class="zone-label" x="${cx}" y="${labelY}">${esc(zd.label)}</text>
      ${zd.subtitle ? `<text class="zone-sub" x="${cx}" y="${subY}">${esc(zd.subtitle)}</text>` : ""}
    </g>`;
  });
  svg.innerHTML = html;
}

/* ── Liste des emplacements (pour le menu déroulant) ── */

function zoneLabels() {
  return getZoneConfig().map((z) => getZoneData(z).label);
}

// Emplacements proposés : zones + emplacements déjà utilisés dans l'inventaire.
function allLocations() {
  return [...new Set([...zoneLabels(), ...SHARED.invCounts.map((c) => c.location).filter(Boolean)])];
}

function fillLocDatalist() {
  const dl = $("inv-loc-list");
  if (dl) dl.innerHTML = allLocations().map((l) => `<option value="${esc(l)}"></option>`).join("");
}

// Enregistre (rétroactivement) tous les produits de l'inventaire au catalogue
// pour pouvoir les réutiliser (rayons, DLC, réserve…). Idempotent.
function syncInvToCatalog() {
  SHARED.invCounts.forEach((c) => {
    if (c.name) saveProductToCatalog(c.name, "", c.barcode || "", { emplacementStock: c.location });
  });
}

/* ── Rendu principal ────────────────────────────────── */

export function renderInventory() {
  const el = $("stock-inventory-view");
  if (!el) return;

  if (!isActive()) {
    el.innerHTML = `<div class="inv-start-card">
      <div class="inv-start-icon">📦</div>
      <div class="inv-start-title">Aucun inventaire en cours</div>
      <div class="inv-start-sub">Démarre une campagne pour précompter le stock emplacement par emplacement, marquer ce qui est fait, et exporter la liste.</div>
      <button class="btn btn-primary" data-action="inv-start">Démarrer un inventaire</button>
    </div>`;
    return;
  }

  const meta = SHARED.invMeta;
  const counts = SHARED.invCounts;
  const counted = countedZoneIds();
  const started = meta.startedAt ? new Date(meta.startedAt).toLocaleDateString("fr-FR") : "";

  // Assure que les produits comptés sont bien dans le catalogue (réutilisables).
  syncInvToCatalog();

  // Regroupe les lignes par emplacement
  const groups = {};
  counts.forEach((c) => {
    const loc = c.location || "Sans emplacement";
    (groups[loc] ||= []).push(c);
  });
  const locs = Object.keys(groups).sort((a, b) => a.localeCompare(b));

  let html = `<div class="inv-banner">
    <div>
      <div class="inv-banner-title">📦 Inventaire en cours</div>
      <div class="inv-banner-sub">Démarré le ${esc(started)} par ${esc(meta.startedBy || "?")}</div>
    </div>
    <div class="inv-banner-stats">
      <div><strong>${counted.size}</strong><span>zones</span></div>
      <div><strong>${counts.length}</strong><span>lignes</span></div>
    </div>
  </div>`;

  html += `<button class="btn btn-primary btn-full" data-action="inv-add"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Ajouter un comptage</button>`;

  html += `<button class="btn btn-ghost btn-full" data-action="inv-togglemap"><span>🗺️ Plan — clic = zone comptée</span></button>
    <div class="card reserve-map-card inv-map-card ${mapOpen ? "" : "hidden"}" id="inv-map-card">
      <svg id="inv-map" viewBox="0 0 800 430" xmlns="http://www.w3.org/2000/svg"></svg>
    </div>`;

  if (!counts.length) {
    html += `<div class="empty-state"><p>Aucun produit compté pour l'instant.</p></div>`;
  } else {
    html += locs
      .map((loc) => {
        const items = groups[loc];
        return `<div class="inv-loc-group">
        <div class="inv-loc-header">
          <span class="inv-loc-name">📍 ${esc(loc)}</span>
          <span class="inv-loc-count">${items.length} ligne${items.length > 1 ? "s" : ""}</span>
        </div>
        <div class="card">${items
          .map(
            (c) => `<div class="inv-row">
            <div class="inv-row-body">
              <div class="inv-row-name">${esc(c.name)}</div>
              <div class="inv-row-meta">${c.barcode ? `🔖 ${esc(c.barcode)}` : ""}${c._by ? `<span>par ${esc(c._by)}</span>` : ""}</div>
            </div>
            <div class="inv-row-qty">${esc(c.qty)} ${esc(c.unit || "")}</div>
            <button class="icon-btn icon-edit icon-sm" data-action="inv-edit" data-id="${esc(c.id)}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
            <button class="icon-btn danger icon-sm" data-action="inv-del" data-id="${esc(c.id)}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg></button>
          </div>`
          )
          .join("")}</div>
      </div>`;
      })
      .join("");
  }

  html += `<div class="inv-actions">
    <button class="btn btn-ghost" data-action="inv-csv">⬇️ Export CSV</button>
    <button class="btn btn-ghost" data-action="inv-print">🖨️ Imprimer</button>
    <button class="btn btn-danger-ghost" data-action="inv-close">Clôturer</button>
  </div>`;

  el.innerHTML = html;
  if (mapOpen) renderInvMap();
}

/* ── Ajout d'un comptage ────────────────────────────── */

export function openAddCount(prefLoc) {
  fillLocDatalist();
  $("ic-loc").value = prefLoc || "";
  const unitSel = $("ic-unit");
  if (unitSel) unitSel.innerHTML = UNITS.map((u) => `<option value="${esc(u)}">${esc(u)}</option>`).join("");
  $("ic-name").value = "";
  $("ic-qty").value = "";
  $("ic-barcode").value = "";
  openModal("modal-add-count");
}

export async function addCount() {
  const name = $("ic-name").value.trim();
  const qty = $("ic-qty").value.trim();
  const location = $("ic-loc").value.trim();
  if (!name) {
    toast("⚠️ Nom requis");
    return;
  }
  if (!qty) {
    toast("⚠️ Quantité requise");
    return;
  }
  const barcode = $("ic-barcode").value.trim();
  await fbPushOrLocal("invCounts", {
    name,
    qty,
    unit: $("ic-unit").value,
    barcode,
    location: location || "Sans emplacement",
  });
  saveProductToCatalog(name, "", barcode, { emplacementStock: location });
  closeModal("modal-add-count");
  toast("✅ Comptage ajouté");
}

/* ── Modification d'un comptage ─────────────────────── */

export function openEditCount(id) {
  const c = SHARED.invCounts.find((x) => x.id === id);
  if (!c) return;
  fillLocDatalist();
  const unitSel = $("ic-e-unit");
  if (unitSel) unitSel.innerHTML = UNITS.map((u) => `<option value="${esc(u)}">${esc(u)}</option>`).join("");
  $("ic-e-id").value = id;
  $("ic-e-loc").value = c.location || "";
  $("ic-e-name").value = c.name || "";
  $("ic-e-qty").value = c.qty || "";
  $("ic-e-unit").value = c.unit || UNITS[0];
  $("ic-e-barcode").value = c.barcode || "";
  openModal("modal-edit-count");
}

export async function saveEditCount() {
  const id = $("ic-e-id").value;
  const c = SHARED.invCounts.find((x) => x.id === id);
  if (!c) return;
  const name = $("ic-e-name").value.trim();
  const qty = $("ic-e-qty").value.trim();
  if (!name) {
    toast("⚠️ Nom requis");
    return;
  }
  if (!qty) {
    toast("⚠️ Quantité requise");
    return;
  }
  const location = $("ic-e-loc").value.trim();
  const barcode = $("ic-e-barcode").value.trim();
  await fbUpdateOrLocal("invCounts", id, {
    ...c,
    name,
    qty,
    unit: $("ic-e-unit").value,
    barcode,
    location: location || "Sans emplacement",
  });
  saveProductToCatalog(name, "", barcode, { emplacementStock: location });
  closeModal("modal-edit-count");
  toast("✅ Comptage modifié");
}

async function deleteCount(id) {
  await fbRemoveOrLocal("invCounts", id);
}

/* ── Génération d'étiquette code-barres ─────────────── */

function ean13Checksum(d12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += (+d12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

function generateInternalEAN() {
  let base = "2"; // préfixe "usage interne magasin"
  for (let i = 0; i < 11; i++) base += Math.floor(Math.random() * 10);
  return base + ean13Checksum(base);
}

export async function generateLabel() {
  let code = $("ic-barcode").value.trim();
  if (!code) {
    code = generateInternalEAN();
    $("ic-barcode").value = code;
  }
  const name = $("ic-name").value.trim() || "Produit";
  try {
    const mod = await import("https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/+esm");
    const JsBarcode = mod.default || mod;
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, code, { format: "EAN13", displayValue: true, width: 2, height: 70, margin: 8 });
    const dataUrl = canvas.toDataURL("image/png");
    const w = window.open("", "_blank");
    if (!w) {
      toast("⚠️ Autorise les pop-ups pour imprimer l'étiquette");
      return;
    }
    w.document.write(`<html><head><title>Étiquette</title></head>
      <body style="font-family:sans-serif;text-align:center;padding:20px" onload="window.print()">
      <div style="font-weight:600;margin-bottom:8px">${esc(name)}</div>
      <img src="${dataUrl}" alt="${esc(code)}"/>
      </body></html>`);
    w.document.close();
  } catch (e) {
    toast("⚠️ Génération du code-barres impossible");
  }
}

/* ── Export CSV & impression ────────────────────────── */

function csvEscape(v) {
  const s = String(v ?? "");
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportCsv() {
  const rows = [["Emplacement", "Produit", "Quantité", "Unité", "Code-barres", "Par"]];
  SHARED.invCounts.forEach((c) =>
    rows.push([c.location || "", c.name || "", c.qty || "", c.unit || "", c.barcode || "", c._by || ""])
  );
  const csv = "﻿" + rows.map((r) => r.map(csvEscape).join(";")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "inventaire.csv";
  a.click();
  URL.revokeObjectURL(url);
  toast("⬇️ Export CSV généré");
}

function barcodeFormat(code) {
  if (/^\d{13}$/.test(code)) return "EAN13";
  if (/^\d{12}$/.test(code)) return "UPC";
  if (/^\d{8}$/.test(code)) return "EAN8";
  return "CODE128";
}

// Rend un code-barres scannable en image (dataURL). Repli CODE128 si invalide.
function makeBarcodeDataUrl(JsBarcode, code) {
  const draw = (fmt) => {
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, code, {
      format: fmt,
      displayValue: true,
      width: 2,
      height: 45,
      margin: 6,
      fontSize: 14,
    });
    return canvas.toDataURL("image/png");
  };
  try {
    return draw(barcodeFormat(code));
  } catch {
    try {
      return draw("CODE128");
    } catch {
      return null;
    }
  }
}

// Ouvre le dialogue de choix des emplacements à imprimer.
export function openPrintDialog() {
  const groups = {};
  SHARED.invCounts.forEach((c) => {
    const loc = c.location || "Sans emplacement";
    (groups[loc] ||= []).push(c);
  });
  const locs = Object.keys(groups).sort((a, b) => a.localeCompare(b));
  const el = $("print-loc-list");
  if (!el) return;
  if (!locs.length) {
    el.innerHTML = `<div class="empty-state"><p>Aucun comptage à imprimer.</p></div>`;
  } else {
    el.innerHTML = locs
      .map(
        (l) => `<label class="print-loc-row">
          <input type="checkbox" class="print-loc-cb" value="${esc(l)}" checked>
          <span>📍 ${esc(l)}</span>
          <span class="print-loc-n">${groups[l].length}</span>
        </label>`
      )
      .join("");
  }
  const all = $("print-all");
  if (all) all.checked = true;
  openModal("modal-print-inv");
}

export function togglePrintAll() {
  const checked = $("print-all")?.checked;
  document.querySelectorAll(".print-loc-cb").forEach((cb) => (cb.checked = checked));
}

export function confirmPrint() {
  const selected = [...document.querySelectorAll(".print-loc-cb")]
    .filter((cb) => cb.checked)
    .map((cb) => cb.value);
  if (!selected.length) {
    toast("⚠️ Choisis au moins un emplacement");
    return;
  }
  closeModal("modal-print-inv");
  printInventory(selected);
}

export async function printInventory(locsFilter) {
  let JsBarcode = null;
  try {
    const mod = await import("https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/+esm");
    JsBarcode = mod.default || mod;
  } catch {
    toast("⚠️ Codes-barres indisponibles, impression en texte");
  }

  const filter = Array.isArray(locsFilter) && locsFilter.length ? new Set(locsFilter) : null;
  const groups = {};
  SHARED.invCounts.forEach((c) => {
    const loc = c.location || "Sans emplacement";
    if (filter && !filter.has(loc)) return;
    (groups[loc] ||= []).push(c);
  });
  const locs = Object.keys(groups).sort((a, b) => a.localeCompare(b));

  let body = `<h1>Inventaire — ${new Date().toLocaleDateString("fr-FR")}</h1>`;
  locs.forEach((loc) => {
    body += `<h2>${esc(loc)}</h2>`;
    groups[loc].forEach((c) => {
      const img = c.barcode && JsBarcode ? makeBarcodeDataUrl(JsBarcode, c.barcode) : null;
      body += `<div class="item">
        <div class="item-info">
          <div class="item-name">${esc(c.name)}</div>
          <div class="item-qty">Qté&nbsp;: <strong>${esc(c.qty)} ${esc(c.unit || "")}</strong></div>
        </div>
        <div class="item-bc">${
          img
            ? `<img src="${img}" alt="${esc(c.barcode)}"/>`
            : `<span class="nobc">${c.barcode ? esc(c.barcode) : "pas de code-barres"}</span>`
        }</div>
      </div>`;
    });
  });

  const w = window.open("", "_blank");
  if (!w) {
    toast("⚠️ Autorise les pop-ups pour imprimer");
    return;
  }
  w.document.write(`<html><head><title>Inventaire</title>
    <style>
      body{font-family:sans-serif;padding:18px;margin:0}
      h1{font-size:20px;margin:0 0 12px}
      h2{font-size:15px;margin:18px 0 4px;border-bottom:1px solid #ccc;padding-bottom:3px}
      .item{display:flex;align-items:center;justify-content:space-between;gap:14px;border-bottom:1px solid #eee;padding:8px 4px;page-break-inside:avoid}
      .item-info{flex:1;min-width:0}
      .item-name{font-weight:600;font-size:14px}
      .item-qty{font-size:12px;color:#444;margin-top:2px}
      .item-bc{flex-shrink:0;text-align:center}
      .item-bc img{height:50px}
      .nobc{font-size:11px;color:#999}
    </style>
    </head><body onload="window.print()">${body}</body></html>`);
  w.document.close();
}

/* ── Bindings ───────────────────────────────────────── */

export function bindInventoryEvents() {
  $("stock-inventory-view")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    switch (btn.dataset.action) {
      case "inv-start": startInventory(); break;
      case "inv-add": openAddCount(); break;
      case "inv-edit": openEditCount(btn.dataset.id); break;
      case "inv-del": deleteCount(btn.dataset.id); break;
      case "inv-csv": exportCsv(); break;
      case "inv-print": openPrintDialog(); break;
      case "inv-close": closeInventory(); break;
      case "inv-togglemap":
        mapOpen = !mapOpen;
        renderInventory();
        break;
    }
  });
  // Carte : clic sur une zone = bascule "comptée"
  $("stock-inventory-view")?.addEventListener("click", (e) => {
    const g = e.target.closest(".zone-group");
    if (g) toggleZoneCounted(g.dataset.zoneId);
  });
}

/* Register renders for bus */
render.invCounts = renderInventory;
render.inventory = renderInventory;

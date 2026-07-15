import { $, esc, toast } from "./utils.js";
import { SHARED } from "./state.js";
import { fbPushOrLocal, fbRemoveOrLocal, fbUpdateOrLocal } from "./firebase.js";
import { findProduct } from "./productCatalog.js";
import { startScanner } from "./scanner.js";
import { render } from "./bus.js";

let groupBy = "emplacement"; // "emplacement" | "category"

/* ── Ajout ──────────────────────────────────────────── */

function addEntry(product, barcode, fallbackName) {
  const name = product ? product.name : fallbackName || barcode || "?";
  const bc = (barcode || (product && product.barcode) || "").trim();
  const exists = SHARED.reassort.some(
    (r) => !r.done && ((bc && (r.barcode || "") === bc) || (r.name || "").toLowerCase() === (name || "").toLowerCase())
  );
  if (exists) {
    toast("Déjà dans la liste de réassort");
    return;
  }
  fbPushOrLocal("reassort", {
    name,
    barcode: bc,
    category: product ? product.category || "" : "",
    emplacement: product ? product.emplacementStock || "" : "",
    done: false,
  });
  toast(`➕ ${name}`, true);
}

export function addReassortByBarcode(code) {
  const p = findProduct("", code);
  if (p) addEntry(p, code);
  else {
    toast("Produit inconnu au catalogue — ajouté quand même");
    addEntry(null, code, "Code " + code);
  }
}

/* ── Recherche / ajout manuel ───────────────────────── */

function showSuggestions() {
  const drop = $("reassort-suggestions");
  if (!drop) return;
  const q = ($("reassort-search")?.value || "").trim().toLowerCase();
  if (!q || q.length < 2) {
    drop.style.display = "none";
    return;
  }
  const matches = SHARED.products
    .filter((p) => (p.name || "").toLowerCase().includes(q) || (p.barcode || "").includes(q))
    .slice(0, 8);
  if (!matches.length) {
    drop.style.display = "none";
    return;
  }
  drop.innerHTML = matches
    .map(
      (p) => `<div class="dlc-sug-item" data-id="${esc(p.id)}" style="cursor:pointer">
      <span class="dlc-sug-name">${esc(p.name)}</span>${p.category ? ` · <span style="color:var(--ink3)">${esc(p.category)}</span>` : ""}
    </div>`
    )
    .join("");
  drop.style.display = "block";
  drop.onclick = (e) => {
    const item = e.target.closest(".dlc-sug-item");
    if (!item) return;
    const p = SHARED.products.find((x) => x.id === item.dataset.id);
    if (p) addEntry(p, p.barcode || "");
    $("reassort-search").value = "";
    drop.style.display = "none";
  };
}

/* ── Rendu ──────────────────────────────────────────── */

function reassortRow(r) {
  return `<div class="reassort-row ${r.done ? "done" : ""}">
    <button class="stock-check ${r.done ? "checked" : ""}" data-action="toggle-reassort" data-id="${esc(r.id)}">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
    </button>
    <div class="reassort-body">
      <div class="reassort-name">${esc(r.name)}</div>
      <div class="reassort-meta">${r.category ? `<span>🏷️ ${esc(r.category)}</span>` : ""}${r.emplacement ? `<span>🏠 ${esc(r.emplacement)}</span>` : ""}${r.barcode ? `<span>🔖 ${esc(r.barcode)}</span>` : ""}</div>
    </div>
    <button class="icon-btn danger icon-sm" data-action="del-reassort" data-id="${esc(r.id)}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
  </div>`;
}

export function renderReassort() {
  const el = $("reassort-list");
  if (!el) return;
  $("reassort-groupby-cat")?.classList.toggle("active", groupBy === "category");
  $("reassort-groupby-emp")?.classList.toggle("active", groupBy === "emplacement");

  const items = SHARED.reassort;
  if (!items.length) {
    el.innerHTML = `<div class="empty-state"><p>Liste vide. Scanne (ou cherche) un produit à réassortir.</p></div>`;
    return;
  }
  const active = items.filter((r) => !r.done);
  const done = items.filter((r) => r.done);

  const keyOf = (r) => (groupBy === "category" ? r.category || "Sans catégorie" : r.emplacement || "Sans emplacement");
  const groups = {};
  active.forEach((r) => { (groups[keyOf(r)] ||= []).push(r); });
  const keys = Object.keys(groups).sort((a, b) => a.localeCompare(b));

  let html = `<div class="reassort-count">${active.length} à réassortir${done.length ? ` · ${done.length} fait(s)` : ""}</div>`;
  html += keys
    .map(
      (k) => `<div class="reassort-group">
      <div class="reassort-group-head"><span>${groupBy === "category" ? "🏷️" : "🏠"} ${esc(k)}</span><span class="reassort-group-n">${groups[k].length}</span></div>
      <div class="card">${groups[k].sort((a, b) => (a.name || "").localeCompare(b.name || "")).map(reassortRow).join("")}</div>
    </div>`
    )
    .join("");

  if (done.length) {
    html += `<div class="reassort-group">
      <div class="reassort-group-head done"><span>✅ Fait (${done.length})</span><button class="btn btn-ghost btn-sm" data-action="clear-done">Nettoyer</button></div>
      <div class="card">${done.map(reassortRow).join("")}</div>
    </div>`;
  }
  el.innerHTML = html;
}

/* ── Actions ────────────────────────────────────────── */

async function toggleReassort(id) {
  const r = SHARED.reassort.find((x) => x.id === id);
  if (!r) return;
  await fbUpdateOrLocal("reassort", id, { ...r, done: !r.done });
}
async function delReassort(id) {
  await fbRemoveOrLocal("reassort", id);
}
async function clearDone() {
  for (const r of SHARED.reassort.filter((x) => x.done)) await fbRemoveOrLocal("reassort", r.id);
}

/* ── Bindings ───────────────────────────────────────── */

export function bindReassortEvents() {
  $("btn-reassort-scan")?.addEventListener("click", () => startScanner(addReassortByBarcode));
  $("reassort-groupby-emp")?.addEventListener("click", () => { groupBy = "emplacement"; renderReassort(); });
  $("reassort-groupby-cat")?.addEventListener("click", () => { groupBy = "category"; renderReassort(); });
  const s = $("reassort-search");
  if (s) {
    s.addEventListener("input", showSuggestions);
    s.addEventListener("focus", showSuggestions);
    s.addEventListener("blur", () => setTimeout(() => { const d = $("reassort-suggestions"); if (d) d.style.display = "none"; }, 250));
  }
  $("reassort-list")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    if (btn.dataset.action === "toggle-reassort") toggleReassort(btn.dataset.id);
    else if (btn.dataset.action === "del-reassort") delReassort(btn.dataset.id);
    else if (btn.dataset.action === "clear-done") clearDone();
  });
}

/* Register render for bus */
render.reassort = renderReassort;

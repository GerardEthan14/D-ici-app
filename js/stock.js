import { $, esc, toast } from "./utils.js";
import { SHARED, app } from "./state.js";
import { fbPushOrLocal, fbRemoveOrLocal, fbUpdateOrLocal, fbSet, sp } from "./firebase.js";
import { gainXP } from "./rpg.js";
import { closeModal, openModal } from "./modals.js";
import { render } from "./bus.js";

/* ── Semaine ISO ────────────────────────────────────── */

function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return { week, year: d.getUTCFullYear() };
}
function weekKeyNow() {
  const { week, year } = isoWeek(new Date());
  return `${year}-W${String(week).padStart(2, "0")}`;
}
function mondayOf(d) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
}

export function getRayonsSorted() {
  return [...SHARED.rayons].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.name || "").localeCompare(b.name || "")
  );
}
function rayonWeeks(r) {
  return Math.max(1, parseInt(r.weeks) || 1);
}

/* ── Roulement : quel rayon cette semaine ───────────── */

function currentRoulement() {
  const rayons = getRayonsSorted();
  if (!rayons.length) return { rayons: [] };
  const start = SHARED.roulementMeta && SHARED.roulementMeta.startDate;
  if (!start) return { rayons, needStart: true };

  const totalWeeks = rayons.reduce((s, r) => s + rayonWeeks(r), 0);
  const elapsed = Math.max(0, Math.floor((mondayOf(new Date()) - mondayOf(new Date(start))) / (7 * 86400000)));
  let pos = ((elapsed % totalWeeks) + totalWeeks) % totalWeeks;

  let acc = 0, idx = 0, subWeek = 1, w = 1;
  for (let i = 0; i < rayons.length; i++) {
    const rw = rayonWeeks(rayons[i]);
    if (pos < acc + rw) { idx = i; subWeek = pos - acc + 1; w = rw; break; }
    acc += rw;
  }
  return {
    rayons,
    rayon: rayons[idx],
    idx,
    subWeek,
    weeks: w,
    nextRayon: rayons[(idx + 1) % rayons.length],
    weekKey: weekKeyNow(),
    cycleLen: rayons.length,
  };
}

function isRayonCheckedThisWeek(rayonId, weekKey) {
  return SHARED.rayonChecks.some((c) => c.rayonId === rayonId && c.weekKey === weekKey);
}

/* ── Sous-onglets ───────────────────────────────────── */

let stockView = "reserve";
export function switchStockView(v) {
  stockView = v;
  $("stock-reserve-view")?.classList.toggle("hidden", v !== "reserve");
  $("stock-inventory-view")?.classList.toggle("hidden", v !== "inventory");
  $("stock-roulement-view")?.classList.toggle("hidden", v !== "roulement");
  $("stab-reserve")?.classList.toggle("active", v === "reserve");
  $("stab-inventory")?.classList.toggle("active", v === "inventory");
  $("stab-roulement")?.classList.toggle("active", v === "roulement");
  if (v === "inventory") render.inventory?.();
  else if (v === "roulement") renderRoulement();
  else render.reserve?.();
}

/* ── Vue Roulement ──────────────────────────────────── */

export function renderRoulement() {
  const el = $("stock-roulement-view");
  if (!el) return;
  const r = currentRoulement();

  let html = "";

  if (!r.rayons.length) {
    html += `<div class="empty-state stock-empty">
      <p>Aucun rayon défini. Crée tes rayons et leur durée (en semaines) pour lancer le roulement.</p>
      <button class="btn btn-primary" data-action="add-rayon">Créer un rayon</button>
    </div>`;
  } else if (r.needStart) {
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    html += `<div class="roul-start-card">
      <div class="roul-start-title">▶️ Démarrer le roulement</div>
      <div class="roul-start-sub">À partir de quelle date commence le rayon n°1 ? Ensuite tout avance automatiquement chaque semaine.</div>
      <input type="date" id="roul-start" value="${iso}">
      <button class="btn btn-primary btn-full" data-action="start-roulement">Démarrer</button>
    </div>`;
  } else {
    const checked = isRayonCheckedThisWeek(r.rayon.id, r.weekKey);
    html += `<div class="roul-current">
      <div class="roul-tag">Cette semaine · rayon ${r.idx + 1}/${r.cycleLen}</div>
      <div class="roul-name">${esc(r.rayon.name)}</div>
      <div class="roul-week">${r.weeks > 1 ? `Semaine <strong>${r.subWeek}/${r.weeks}</strong> de ce rayon` : `1 semaine`}</div>
      ${
        checked
          ? `<div class="roul-done">✅ Vérifié cette semaine</div>`
          : `<button class="btn btn-primary btn-full" data-action="check-rayon" data-id="${esc(r.rayon.id)}">✅ Marquer ce rayon vérifié</button>`
      }
      <div class="roul-next">⏭️ Ensuite : <strong>${esc(r.nextRayon.name)}</strong></div>
    </div>`;
  }

  // Gestion des rayons
  html += `<div class="roul-section-title">🗂️ Mes rayons</div>`;
  html += `<button class="btn btn-ghost btn-full" data-action="add-rayon">+ Nouveau rayon</button>`;
  const rayons = getRayonsSorted();
  html += rayons
    .map((r2, idx) => {
      const w = rayonWeeks(r2);
      return `<div class="rayon-card">
      <div class="rayon-card-head">
        <div class="rayon-order">${idx + 1}</div>
        <div class="rayon-name">${esc(r2.name)}</div>
        <span class="rayon-weeks-chip">${w} sem.</span>
        <div class="rayon-actions">
          <button class="icon-btn icon-sm" data-action="move-up" data-id="${esc(r2.id)}" ${idx === 0 ? "disabled" : ""}>▲</button>
          <button class="icon-btn icon-sm" data-action="move-down" data-id="${esc(r2.id)}" ${idx === rayons.length - 1 ? "disabled" : ""}>▼</button>
          <button class="icon-btn icon-edit icon-sm" data-action="edit-rayon" data-id="${esc(r2.id)}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="icon-btn danger icon-sm" data-action="del-rayon" data-id="${esc(r2.id)}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg></button>
        </div>
      </div>
    </div>`;
    })
    .join("");

  // Historique
  const hist = [...SHARED.rayonChecks].sort((a, b) => (b._at || 0) - (a._at || 0)).slice(0, 20);
  if (hist.length) {
    const nameOf = (id) => (SHARED.rayons.find((x) => x.id === id) || {}).name || "?";
    html += `<div class="roul-section-title">📜 Historique</div><div class="card">${hist
      .map(
        (h) => `<div class="roul-hist-row">
        <span class="roul-hist-name">${esc(nameOf(h.rayonId))}</span>
        <span class="roul-hist-meta">${h._at ? new Date(h._at).toLocaleDateString("fr-FR") : ""}${h._by ? ` · ${esc(h._by)}` : ""}</span>
        <button class="icon-btn danger icon-sm" data-action="del-check" data-id="${esc(h.id)}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg></button>
      </div>`
      )
      .join("")}</div>`;
  }

  el.innerHTML = html;
}

/* ── Démarrage / check ──────────────────────────────── */

async function startRoulement() {
  const date = $("roul-start")?.value;
  if (!date) { toast("⚠️ Choisis une date"); return; }
  await fbSet(sp("roulementMeta"), { startDate: date, by: app.username || "?", at: Date.now() });
  toast("▶️ Roulement démarré !", true);
}

async function checkRayon(id) {
  const weekKey = weekKeyNow();
  if (isRayonCheckedThisWeek(id, weekKey)) return;
  await fbPushOrLocal("rayonChecks", { rayonId: id, weekKey });
  gainXP("stock_rayon_done");
  toast("✅ Rayon vérifié ! +30 XP", true);
}

async function delCheck(id) {
  await fbRemoveOrLocal("rayonChecks", id);
}

/* ── CRUD Rayons (nom + durée) ──────────────────────── */

export async function addRayon() {
  const name = $("ray-name").value.trim();
  if (!name) { toast("⚠️ Nom requis"); return; }
  const weeks = Math.max(1, parseInt($("ray-weeks").value) || 1);
  const maxOrder = SHARED.rayons.reduce((m, r) => Math.max(m, r.order ?? 0), 0);
  await fbPushOrLocal("rayons", { name, weeks, order: maxOrder + 1 });
  $("ray-name").value = "";
  $("ray-weeks").value = "1";
  closeModal("modal-add-rayon");
  toast("✅ Rayon créé");
}

export function openEditRayon(id) {
  const r = SHARED.rayons.find((x) => x.id === id);
  if (!r) return;
  $("edit-ray-id").value = id;
  $("edit-ray-name").value = r.name || "";
  $("edit-ray-weeks").value = rayonWeeks(r);
  openModal("modal-edit-rayon");
}

export async function saveEditRayon() {
  const id = $("edit-ray-id").value;
  const r = SHARED.rayons.find((x) => x.id === id);
  if (!r) return;
  const name = $("edit-ray-name").value.trim();
  if (!name) { toast("⚠️ Nom requis"); return; }
  const weeks = Math.max(1, parseInt($("edit-ray-weeks").value) || 1);
  await fbUpdateOrLocal("rayons", id, { ...r, name, weeks });
  closeModal("modal-edit-rayon");
  toast("✅ Rayon modifié");
}

async function deleteRayon(id) {
  const r = SHARED.rayons.find((x) => x.id === id);
  if (!r) return;
  if (!confirm(`Supprimer le rayon "${r.name}" ?`)) return;
  await fbRemoveOrLocal("rayons", id);
  toast("🗑️ Rayon supprimé");
}

async function moveRayon(id, dir) {
  const sorted = getRayonsSorted();
  const idx = sorted.findIndex((r) => r.id === id);
  const swapIdx = dir === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return;
  const a = sorted[idx], b = sorted[swapIdx];
  const ao = a.order ?? idx, bo = b.order ?? swapIdx;
  await fbUpdateOrLocal("rayons", a.id, { ...a, order: bo });
  await fbUpdateOrLocal("rayons", b.id, { ...b, order: ao });
}

/* ── Bindings ───────────────────────────────────────── */

export function bindStockEvents() {
  $("stock-roulement-view")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    switch (btn.dataset.action) {
      case "add-rayon": openAddRayon(); break;
      case "edit-rayon": openEditRayon(id); break;
      case "del-rayon": deleteRayon(id); break;
      case "move-up": moveRayon(id, "up"); break;
      case "move-down": moveRayon(id, "down"); break;
      case "start-roulement": startRoulement(); break;
      case "check-rayon": checkRayon(id); break;
      case "del-check": delCheck(id); break;
    }
  });
}

function openAddRayon() {
  $("ray-name").value = "";
  $("ray-weeks").value = "1";
  openModal("modal-add-rayon");
}

/* Register renders for bus */
render.rayons = renderRoulement;
render.rayonChecks = renderRoulement;
render.roulement = renderRoulement;
render.stock = () => switchStockView(stockView);

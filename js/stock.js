import { $, esc, toast } from "./utils.js";
import { SHARED } from "./state.js";
import { fbPushOrLocal, fbRemoveOrLocal, fbUpdateOrLocal } from "./firebase.js";
import { gainXP } from "./rpg.js";
import { closeModal, openModal } from "./modals.js";
import { saveProductToCatalog } from "./productCatalog.js";
import { render } from "./bus.js";

/* ── Semaine ISO & rotation ─────────────────────────── */

function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7
    );
  return { week, year: d.getUTCFullYear() };
}

function weekInfo() {
  const { week, year } = isoWeek(new Date());
  return { week, year, key: `${year}-W${week}` };
}

export function getRayonsSorted() {
  return [...SHARED.rayons].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.name || "").localeCompare(b.name || "")
  );
}

// Rayon actif cette semaine = rotation basée sur le n° de semaine ISO.
function currentRayonIndex(total) {
  if (total <= 0) return -1;
  const { week } = weekInfo();
  return (week - 1) % total;
}

function itemsOfRayon(rayonId) {
  return SHARED.stockItems
    .filter((i) => i.rayonId === rayonId)
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}

function isChecked(item, weekKey) {
  return item.checkedWeek === weekKey;
}

/* ── Sub-tabs ───────────────────────────────────────── */

let stockView = "week";
export function switchStockView(v) {
  stockView = v;
  $("stock-week-view").classList.toggle("hidden", v !== "week");
  $("stock-rayons-view").classList.toggle("hidden", v !== "rayons");
  $("stock-inventory-view").classList.toggle("hidden", v !== "inventory");
  $("stab-week").classList.toggle("active", v === "week");
  $("stab-rayons").classList.toggle("active", v === "rayons");
  $("stab-inventory").classList.toggle("active", v === "inventory");
  if (v === "inventory") render.inventory?.();
  else renderStock();
}

/* ── Vue « Cette semaine » ──────────────────────────── */

export function renderStockWeek() {
  const el = $("stock-week-view");
  if (!el) return;
  const rayons = getRayonsSorted();
  if (!rayons.length) {
    el.innerHTML = `<div class="empty-state stock-empty">
      <p>Aucun rayon défini.</p>
      <button class="btn btn-primary" data-action="goto-rayons">Créer mes rayons</button>
    </div>`;
    return;
  }

  const { key, week } = weekInfo();
  const idx = currentRayonIndex(rayons.length);
  const rayon = rayons[idx];
  const items = itemsOfRayon(rayon.id);
  const done = items.filter((i) => isChecked(i, key)).length;
  const total = items.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const cycleLen = rayons.length;
  const nextRayon = rayons[(idx + 1) % cycleLen];

  let html = `<div class="stock-week-head">
    <div class="stock-week-tag">Semaine ${week} · Rayon ${idx + 1}/${cycleLen}</div>
    <div class="stock-week-rayon">${esc(rayon.name)}</div>
    <div class="stock-week-progress">
      <div class="mini-bar-track"><div class="mini-bar-fill" style="width:${pct}%"></div></div>
      <span class="stock-week-count">${done}/${total} vérifié${done > 1 ? "s" : ""}</span>
    </div>
    ${done === total && total > 0 ? `<div class="stock-week-done">🎉 Rayon terminé pour cette semaine !</div>` : ""}
  </div>`;

  if (!total) {
    html += `<div class="empty-state"><p>Aucun produit dans ce rayon.</p>
      <button class="btn btn-ghost" data-action="add-item" data-rayon="${esc(rayon.id)}">Ajouter un produit</button></div>`;
  } else {
    html += `<div class="card stock-check-list">` +
      items
        .map((i) => {
          const ok = isChecked(i, key);
          return `<div class="stock-check-row ${ok ? "checked" : ""}">
            <button class="stock-check ${ok ? "checked" : ""}" data-action="toggle-item" data-id="${esc(i.id)}">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </button>
            <div class="stock-check-body">
              <div class="stock-check-name">${esc(i.name)}</div>
              ${i.barcode ? `<div class="stock-check-bc">🔖 ${esc(i.barcode)}</div>` : ""}
            </div>
          </div>`;
        })
        .join("") +
      `</div>
      <button class="btn btn-ghost btn-full" data-action="add-item" data-rayon="${esc(rayon.id)}">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Ajouter un produit à ce rayon
      </button>`;
  }

  html += `<div class="stock-next">⏭️ Semaine prochaine : <strong>${esc(nextRayon.name)}</strong></div>`;
  el.innerHTML = html;
}

/* ── Vue « Rayons » (gestion) ───────────────────────── */

export function renderRayons() {
  const el = $("stock-rayons-view");
  if (!el) return;
  const rayons = getRayonsSorted();
  let html = `<button class="btn btn-primary btn-full" data-action="add-rayon">
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    Nouveau rayon
  </button>`;

  if (!rayons.length) {
    html += `<div class="empty-state"><p>Aucun rayon. Crée le premier pour lancer la rotation.</p></div>`;
    el.innerHTML = html;
    return;
  }

  const { key } = weekInfo();
  html += rayons
    .map((r, idx) => {
      const items = itemsOfRayon(r.id);
      const done = items.filter((i) => isChecked(i, key)).length;
      return `<div class="rayon-card">
      <div class="rayon-card-head">
        <div class="rayon-order">${idx + 1}</div>
        <div class="rayon-name">${esc(r.name)}</div>
        <div class="rayon-actions">
          <button class="icon-btn icon-sm" data-action="move-up" data-id="${esc(r.id)}" ${idx === 0 ? "disabled" : ""}>▲</button>
          <button class="icon-btn icon-sm" data-action="move-down" data-id="${esc(r.id)}" ${idx === rayons.length - 1 ? "disabled" : ""}>▼</button>
          <button class="icon-btn icon-edit icon-sm" data-action="edit-rayon" data-id="${esc(r.id)}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="icon-btn danger icon-sm" data-action="del-rayon" data-id="${esc(r.id)}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg></button>
        </div>
      </div>
      <div class="rayon-meta">${items.length} produit${items.length > 1 ? "s" : ""}${items.length ? ` · ${done}/${items.length} vérifiés cette semaine` : ""}</div>
      ${
        items.length
          ? `<div class="rayon-items">${items
              .map(
                (i) => `<span class="rayon-item-chip">${esc(i.name)}<button class="rayon-item-del" data-action="del-item" data-id="${esc(i.id)}">×</button></span>`
              )
              .join("")}</div>`
          : ""
      }
      <button class="btn btn-ghost btn-sm btn-full" data-action="add-item" data-rayon="${esc(r.id)}">+ Produit</button>
    </div>`;
    })
    .join("");
  el.innerHTML = html;
}

export function renderStock() {
  if (stockView === "week") renderStockWeek();
  else renderRayons();
}

/* ── CRUD Rayons ────────────────────────────────────── */

export async function addRayon() {
  const name = $("ray-name").value.trim();
  if (!name) {
    toast("⚠️ Nom requis");
    return;
  }
  const maxOrder = SHARED.rayons.reduce((m, r) => Math.max(m, r.order ?? 0), 0);
  await fbPushOrLocal("rayons", { name, order: maxOrder + 1 });
  $("ray-name").value = "";
  closeModal("modal-add-rayon");
  toast("✅ Rayon créé");
}

export function openEditRayon(id) {
  const r = SHARED.rayons.find((x) => x.id === id);
  if (!r) return;
  $("edit-ray-id").value = id;
  $("edit-ray-name").value = r.name || "";
  openModal("modal-edit-rayon");
}

export async function saveEditRayon() {
  const id = $("edit-ray-id").value;
  const r = SHARED.rayons.find((x) => x.id === id);
  if (!r) return;
  const name = $("edit-ray-name").value.trim();
  if (!name) {
    toast("⚠️ Nom requis");
    return;
  }
  await fbUpdateOrLocal("rayons", id, { ...r, name });
  closeModal("modal-edit-rayon");
  toast("✅ Rayon modifié");
}

async function deleteRayon(id) {
  const r = SHARED.rayons.find((x) => x.id === id);
  if (!r) return;
  const items = itemsOfRayon(id);
  if (
    !confirm(
      `Supprimer le rayon "${r.name}"${items.length ? ` et ses ${items.length} produit(s)` : ""} ?`
    )
  )
    return;
  for (const it of items) await fbRemoveOrLocal("stockItems", it.id);
  await fbRemoveOrLocal("rayons", id);
  toast("🗑️ Rayon supprimé");
}

async function moveRayon(id, dir) {
  const sorted = getRayonsSorted();
  const idx = sorted.findIndex((r) => r.id === id);
  const swapIdx = dir === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return;
  const a = sorted[idx];
  const b = sorted[swapIdx];
  const ao = a.order ?? idx;
  const bo = b.order ?? swapIdx;
  await fbUpdateOrLocal("rayons", a.id, { ...a, order: bo });
  await fbUpdateOrLocal("rayons", b.id, { ...b, order: ao });
}

/* ── CRUD Produits de stock ─────────────────────────── */

export function openAddStockItem(rayonId) {
  const sel = $("si-rayon");
  if (sel) {
    sel.innerHTML = getRayonsSorted()
      .map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`)
      .join("");
    if (rayonId) sel.value = rayonId;
  }
  $("si-name").value = "";
  $("si-barcode").value = "";
  openModal("modal-add-stock-item");
}

export async function addStockItem() {
  const rayonId = $("si-rayon").value;
  const name = $("si-name").value.trim();
  if (!rayonId) {
    toast("⚠️ Choisis un rayon");
    return;
  }
  if (!name) {
    toast("⚠️ Nom requis");
    return;
  }
  const barcode = $("si-barcode").value.trim();
  await fbPushOrLocal("stockItems", {
    name,
    rayonId,
    barcode,
  });
  saveProductToCatalog(name, "", barcode);
  $("si-name").value = "";
  $("si-barcode").value = "";
  closeModal("modal-add-stock-item");
  toast("✅ Produit ajouté au rayon");
}

async function deleteStockItem(id) {
  await fbRemoveOrLocal("stockItems", id);
}

async function toggleItemChecked(id) {
  const item = SHARED.stockItems.find((x) => x.id === id);
  if (!item) return;
  const { key } = weekInfo();
  const rayonItems = itemsOfRayon(item.rayonId);
  const wasComplete = rayonItems.length > 0 && rayonItems.every((i) => isChecked(i, key));

  if (isChecked(item, key)) {
    await fbUpdateOrLocal("stockItems", id, { ...item, checkedWeek: "" });
  } else {
    await fbUpdateOrLocal("stockItems", id, { ...item, checkedWeek: key });
    gainXP("stock_check");
    // Bonus si ce check termine le rayon
    const nowComplete = rayonItems.every((i) =>
      i.id === id ? true : isChecked(i, key)
    );
    if (!wasComplete && nowComplete) {
      gainXP("stock_rayon_done");
      toast("🎉 Rayon terminé ! +30 XP", true);
    }
  }
}

/* ── Bindings ───────────────────────────────────────── */

export function bindStockEvents() {
  const handler = (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    switch (btn.dataset.action) {
      case "goto-rayons": switchStockView("rayons"); break;
      case "add-rayon": openModal("modal-add-rayon"); break;
      case "edit-rayon": openEditRayon(id); break;
      case "del-rayon": deleteRayon(id); break;
      case "move-up": moveRayon(id, "up"); break;
      case "move-down": moveRayon(id, "down"); break;
      case "add-item": openAddStockItem(btn.dataset.rayon); break;
      case "del-item": deleteStockItem(id); break;
      case "toggle-item": toggleItemChecked(id); break;
    }
  };
  $("stock-week-view")?.addEventListener("click", handler);
  $("stock-rayons-view")?.addEventListener("click", handler);
}

/* Register renders for bus */
render.rayons = renderStock;
render.stockItems = renderStock;
render.stock = renderStock;

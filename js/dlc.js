import { $, esc, fmtD, toast } from "./utils.js";
import { SHARED, LOCAL, app, saveLocal } from "./state.js";
import { fbSet, fbRemove, sp } from "./firebase.js";
import { gainXP, checkBadges } from "./rpg.js";
import { closeModal, openModal } from "./modals.js";
import { upsertProductDlc, clearProductDlc, normName } from "./productCatalog.js";
import { render } from "./bus.js";

/* ── DLC status helper (used across modules) ────────── */

export function dlcStatus(d) {
  const td = new Date();
  td.setHours(0, 0, 0, 0);
  const dd = new Date(d);
  dd.setHours(0, 0, 0, 0);
  const diff = Math.floor((dd - td) / 86400000);
  if (diff < 0) return { label: "PÉRIMÉ", cls: "dlc-expired", days: diff, zone: "expired" };
  if (diff <= 7) return { label: diff + "j", cls: "dlc-critical", days: diff, zone: "critical" };
  if (diff <= 30) return { label: diff + "j", cls: "dlc-urgent", days: diff, zone: "urgent" };
  return { label: diff + "j", cls: "dlc-ok", days: diff, zone: "ok" };
}

// La DLC est désormais un champ du produit : on lit les produits ayant une DLC.
function getDlcProducts() {
  return SHARED.products
    .filter((p) => p.dlc)
    .map((p) => ({ id: p.id, name: p.name, supplier: p.supplier || "", date: p.dlc, qty: p.dlcQty || "" }));
}

/* ── Views ──────────────────────────────────────────── */

let dlcView = "schema";

export function switchDlcView(v) {
  dlcView = v;
  $("dlc-view-schema")?.classList.toggle("hidden", v !== "schema");
  $("dlc-view-vrac")?.classList.toggle("hidden", v !== "vrac");
  $("dvt-schema")?.classList.toggle("active", v === "schema");
  $("dvt-vrac")?.classList.toggle("active", v === "vrac");
  const searchWrap = document.querySelector("#panel-dlc > .search-wrap");
  if (searchWrap) searchWrap.classList.toggle("hidden", v === "vrac");
  const focus = $("dlc-focus");
  if (focus) focus.classList.toggle("hidden", v === "vrac");
  if (v === "schema") renderDlcSchema();
  if (v === "vrac") render.vrac?.();
  render.updateFab?.();
}

export function getDlcView() {
  return dlcView;
}

/* ── Focus « à traiter ≤ 7 jours » ──────────────────── */

function getUrgentDlc() {
  return getDlcProducts().filter((d) => dlcStatus(d.date).days <= 7);
}

let focusMode = false;

export function toggleDlcFocus() {
  focusMode = !focusMode;
  renderDlc();
}

export function renderDlcFocus() {
  const el = $("dlc-focus");
  if (!el) return;
  const urgent = getUrgentDlc();
  const notifSupported = typeof window !== "undefined" && "Notification" in window;
  const showBell = notifSupported && Notification.permission === "default";
  const bell = showBell
    ? `<button class="dlc-focus-bell" data-action="enable-dlc-reminders" title="Activer les rappels">🔔 Rappels</button>`
    : "";

  if (!urgent.length) {
    focusMode = false;
    el.innerHTML = `<div class="dlc-focus-card ok">
      <span class="dlc-focus-icon">✅</span>
      <div class="dlc-focus-body"><div class="dlc-focus-count">Rien d'urgent</div><div class="dlc-focus-sub">Aucune DLC à traiter sous 7 jours</div></div>
      ${bell}
    </div>`;
    return;
  }
  el.innerHTML = `<div class="dlc-focus-card alert">
    <span class="dlc-focus-icon">🔥</span>
    <div class="dlc-focus-body">
      <div class="dlc-focus-count">${urgent.length} à traiter</div>
      <div class="dlc-focus-sub">DLC ≤ 7 jours (périmés + critiques)</div>
    </div>
    <button class="dlc-focus-btn" data-action="toggle-dlc-focus">${focusMode ? "Tout voir" : "Voir seulement"}</button>
    ${bell}
  </div>`;
}

/* ── Rappels / alertes ──────────────────────────────── */

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function checkDlcAlerts() {
  const urgent = getUrgentDlc();
  if (!urgent.length) return;
  if (LOCAL.dlcAlertDate === todayKey()) return;
  LOCAL.dlcAlertDate = todayKey();
  saveLocal();
  toast(`🔔 ${urgent.length} DLC à traiter sous 7 jours !`, true);
  fireDlcNotification(urgent.length);
}

function fireDlcNotification(count) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    new Notification("D'ici App — DLC à traiter", {
      body: `${count} produit(s) à vérifier sous 7 jours.`,
    });
  } catch {}
}

export function enableDlcReminders() {
  if (!("Notification" in window)) {
    toast("⚠️ Notifications non supportées sur cet appareil");
    return;
  }
  Notification.requestPermission().then((perm) => {
    if (perm === "granted") {
      toast("🔔 Rappels activés !", true);
      const count = getUrgentDlc().length;
      if (count) fireDlcNotification(count);
    } else {
      toast("Rappels non activés");
    }
    renderDlcFocus();
  });
}

/* ── Rendu (schéma = produits triés par DLC) ────────── */

export function renderDlc() {
  renderDlcFocus();
  renderDlcSchema();
}

export function renderDlcSchema() {
  const el = $("dlc-schema-content");
  if (!el) return;
  const searchEl = $("dlc-search");
  const q = searchEl ? searchEl.value.trim().toLowerCase() : "";
  let list = getDlcProducts();
  if (q)
    list = list.filter(
      (d) =>
        (d.name || "").toLowerCase().includes(q) ||
        (d.supplier || "").toLowerCase().includes(q)
    );
  if (focusMode) list = list.filter((d) => dlcStatus(d.date).days <= 7);
  if (!list.length) {
    el.innerHTML = `<div class="empty-state"><p>${q ? "Aucun résultat." : "Aucun produit avec une DLC."}</p></div>`;
    return;
  }
  const sorted = [...list].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const byZone = { expired: [], critical: [], urgent: [], ok: [] };
  sorted.forEach((x) => byZone[dlcStatus(x.date).zone].push(x));

  const total = list.length;
  const cards = [
    { label: "Périmés", count: byZone.expired.length, col: "var(--red)", bg: "var(--red-light)", icon: "☠️" },
    { label: "Critique", sub: "≤ 7 jours", count: byZone.critical.length, col: "#b91c1c", bg: "#fee2e2", icon: "🚨" },
    { label: "Attention", sub: "8 – 30 jours", count: byZone.urgent.length, col: "var(--orange)", bg: "var(--orange-light)", icon: "⚠️" },
    { label: "OK", sub: "> 30 jours", count: byZone.ok.length, col: "var(--green)", bg: "var(--green-light)", icon: "✅" },
  ];

  let html = `<div class="schema-summary-grid">${cards
    .map(
      (c) => `
    <div class="schema-stat-card" style="border-top:3px solid ${c.col};background:${c.bg}">
      <div class="schema-stat-icon">${c.icon}</div>
      <div class="schema-stat-count" style="color:${c.col}">${c.count}</div>
      <div class="schema-stat-label">${c.label}</div>
      ${c.sub ? `<div class="schema-stat-sub">${c.sub}</div>` : ""}
    </div>`
    )
    .join("")}</div>`;

  html += `<div class="schema-timeline-card"><div class="schema-timeline-title">Répartition temporelle</div><div class="schema-bar-row">`;
  const segs = [
    { arr: byZone.expired, col: "var(--red)" },
    { arr: byZone.critical, col: "#b91c1c" },
    { arr: byZone.urgent, col: "var(--orange)" },
    { arr: byZone.ok, col: "var(--green)" },
  ];
  segs.forEach((s) => {
    const pct = Math.round((s.arr.length / total) * 100);
    if (pct > 0) html += `<div class="schema-bar-seg" style="width:${pct}%;background:${s.col}"></div>`;
  });
  html += `</div><div class="schema-bar-legend">`;
  const legends = [
    { arr: byZone.expired, col: "var(--red)", lbl: "Périmés" },
    { arr: byZone.critical, col: "#b91c1c", lbl: "Critique" },
    { arr: byZone.urgent, col: "var(--orange)", lbl: "Attention" },
    { arr: byZone.ok, col: "var(--green)", lbl: "OK" },
  ];
  legends.forEach((s) => {
    if (s.arr.length)
      html += `<span class="schema-legend-item"><span class="schema-legend-dot" style="background:${s.col}"></span>${s.lbl} (${s.arr.length})</span>`;
  });
  html += `</div></div>`;

  const zones = [
    { arr: byZone.expired, title: "☠️ Périmés", col: "var(--red)" },
    { arr: byZone.critical, title: "🚨 Critiques", col: "#b91c1c" },
    { arr: byZone.urgent, title: "⚠️ Attention – 8 à 30j", col: "var(--orange)" },
    { arr: byZone.ok, title: "✅ OK", col: "var(--green)" },
  ];
  zones.forEach((z) => {
    if (!z.arr.length) return;
    html += `<div class="schema-zone-card" style="border-left:4px solid ${z.col}"><div class="schema-zone-title" style="color:${z.col}">${z.title}</div>${z.arr
      .map((v) => {
        const s = dlcStatus(v.date);
        return `<div class="schema-zone-row">
          <button class="dlc-check dlc-check-sm" data-action="remove-dlc" data-id="${esc(v.id)}" data-days="${s.days}" title="Valider (traiter)">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </button>
          <div class="schema-zone-name">${esc(v.name)}${v.qty ? ` <span class="schema-zone-qty">~${esc(v.qty)}</span>` : ""}</div>
          <div class="schema-zone-detail">${v.supplier ? `<span>🏭 ${esc(v.supplier)}</span>` : ""}<span class="schema-days-chip" style="background:${z.col};color:#fff">${fmtD(v.date)} · ${s.label}</span></div>
          <button class="icon-btn icon-edit icon-sm" data-action="edit-dlc" data-id="${esc(v.id)}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
        </div>`;
      })
      .join("")}</div>`;
  });

  el.innerHTML = html;
}

/* ── Ajout / traitement d'une DLC (sur le produit) ──── */

export async function addDlc() {
  const name = $("dlc-prod").value.trim();
  const date = $("dlc-date").value;
  const sup = $("dlc-sup").value.trim();
  if (!name || !date) {
    toast("⚠️ Nom et date requis");
    return;
  }
  const barcode = $("dlc-barcode").value.trim();
  upsertProductDlc(name, sup, barcode, date, $("dlc-qty").value.trim(), "");
  gainXP("dlc_add");
  ["dlc-prod", "dlc-sup", "dlc-qty", "dlc-barcode"].forEach((i) => ($(i).value = ""));
  try {
    $("dlc-date").valueAsDate = new Date();
  } catch {}
  closeModal("modal-add-dlc");
  toast("📅 DLC enregistrée +10 XP", true);
}

async function removeDlc(id, days) {
  LOCAL.rpg.dlcTreated = (LOCAL.rpg.dlcTreated || 0) + 1;
  const d = parseInt(days);
  if (d < 0 || d <= 7) {
    LOCAL.rpg.dlcUrgent = (LOCAL.rpg.dlcUrgent || 0) + 1;
    gainXP("dlc_urgent");
  } else if (d <= 30) gainXP("dlc_soon");
  else gainXP("dlc_ok");
  clearProductDlc(id);
  saveLocal();
  checkBadges();
  toast("✅ Produit traité !", true);
}

export function updateDlcBadge() {
  const c = getDlcProducts().filter((x) => dlcStatus(x.date).zone !== "ok").length;
  const b = $("dlc-badge");
  if (!b) return;
  if (c > 0) {
    b.style.display = "flex";
    b.textContent = c;
  } else b.style.display = "none";
}

/* ── Edit (modifie la DLC du produit) ───────────────── */

export function openEditDlc(id) {
  const p = SHARED.products.find((x) => x.id === id);
  if (!p) return;
  $("edit-dlc-id").value = id;
  $("edit-dlc-name").value = p.name || "";
  $("edit-dlc-sup").value = p.supplier || "";
  $("edit-dlc-date").value = p.dlc || "";
  $("edit-dlc-qty").value = p.dlcQty || "";
  $("edit-dlc-barcode").value = p.barcode || "";
  openModal("modal-edit-dlc");
}

export async function saveEditDlc() {
  const id = $("edit-dlc-id").value;
  const p = SHARED.products.find((x) => x.id === id);
  if (!p) return;
  const name = $("edit-dlc-name").value.trim();
  const date = $("edit-dlc-date").value;
  if (!name || !date) {
    toast("⚠️ Nom et date requis");
    return;
  }
  await fbSet(`products/${id}`, {
    ...p,
    name,
    supplier: $("edit-dlc-sup").value.trim(),
    barcode: $("edit-dlc-barcode").value.trim(),
    dlc: date,
    dlcQty: $("edit-dlc-qty").value.trim(),
  });
  closeModal("modal-edit-dlc");
  toast("✅ DLC modifiée");
}

/* ── Migration : anciennes entrées DLC -> champ du produit ── */

let migrating = false;
export async function migrateLegacyDlc() {
  if (migrating || !app.firebaseMode) return;
  const legacy = [...SHARED.dlc];
  if (!legacy.length) return;
  migrating = true;
  try {
    // Regroupe par produit (code-barres, sinon nom normalisé), garde la DLC la plus proche.
    const groups = new Map();
    legacy.forEach((d) => {
      if (!d.name || !d.date) return;
      const key = (d.barcode || "").trim() || normName(d.name);
      const g = groups.get(key) || { name: d.name, supplier: d.supplier || "", barcode: (d.barcode || "").trim(), date: d.date, qty: d.qty || "" };
      if (d.date < g.date) g.date = d.date;
      if (!g.supplier && d.supplier) g.supplier = d.supplier;
      if (!g.barcode && d.barcode) g.barcode = (d.barcode || "").trim();
      groups.set(key, g);
    });
    groups.forEach((g) => upsertProductDlc(g.name, g.supplier, g.barcode, g.date, g.qty, ""));
    // Supprime les anciennes entrées DLC (désormais dans les produits).
    for (const d of legacy) await fbRemove(sp("dlc/" + d.id));
  } finally {
    migrating = false;
  }
}

/* ── Bindings ───────────────────────────────────────── */

export function bindDlcEvents() {
  $("dlc-schema-content")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    if (btn.dataset.action === "remove-dlc") {
      removeDlc(btn.dataset.id, parseInt(btn.dataset.days));
    } else if (btn.dataset.action === "edit-dlc") {
      openEditDlc(btn.dataset.id);
    }
  });
  $("dlc-focus")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    if (btn.dataset.action === "toggle-dlc-focus") toggleDlcFocus();
    else if (btn.dataset.action === "enable-dlc-reminders") enableDlcReminders();
  });
  $("dlc-search")?.addEventListener("input", renderDlc);
}

/* Register render for bus */
render.dlc = () => {
  renderDlc();
  updateDlcBadge();
  checkDlcAlerts();
};
render.migrateDlc = migrateLegacyDlc;

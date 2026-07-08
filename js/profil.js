import { $, esc, toast } from "./utils.js";
import { SHARED, app, isAdmin } from "./state.js";
import { fbSet, fbRemove, sp, loadAllUsers, saveUserStore, setUserRole } from "./firebase.js";
import { getLevel } from "./rpg.js";
import { ADMIN_EMAIL, STORES, ROLE_LABELS, CATEGORIES } from "./config.js";
import { closeModal, openModal } from "./modals.js";
import { getZoneConfig, getZoneData } from "./reserve.js";
import { render } from "./bus.js";

/* ── Helpers ────────────────────────────────────────── */

function storeName(id) {
  return STORES.find((s) => s.id === id)?.name || id || "—";
}

/* ── Leaderboard ────────────────────────────────────── */

export function renderLeaderboard() {
  const el = $("leaderboard-list");
  if (!el) return;
  const players = Object.values(SHARED.scores).sort((a, b) => (b.xp || 0) - (a.xp || 0));
  if (!players.length) {
    el.innerHTML = `<div class="leaderboard-empty">Pas encore de scores publiés</div>`;
    return;
  }
  const maxXP = players[0]?.xp || 1;
  const rankIcons = ["🥇", "🥈", "🥉"];
  const rankCls = ["gold", "silver", "bronze"];
  el.innerHTML = players
    .map((p, i) => {
      const isme = p.name === app.username;
      const pct = Math.round(((p.xp || 0) / maxXP) * 100);
      return `<div class="leaderboard-row${isme ? " is-me" : ""}">
      <div class="leaderboard-rank ${rankCls[i] || ""}">${rankIcons[i] || "#" + (i + 1)}</div>
      <div class="leaderboard-avatar">${p.avatar || "🧑"}</div>
      <div class="leaderboard-info">
        <div class="leaderboard-name">${esc(p.name || "?")} ${isme ? '<span class="leaderboard-me-badge">Moi</span>' : ""}</div>
        <div class="leaderboard-class">${esc(p.title || "")}</div>
        <div class="leaderboard-bar-wrap"><div class="leaderboard-bar" style="width:${pct}%"></div></div>
      </div>
      <div class="leaderboard-xp">${p.xp}<span class="xp-unit"> XP</span></div>
    </div>`;
    })
    .join("");
}

/* ── Store switcher (profil panel) ──────────────────── */

export function renderStoreSwitcher() {
  const el = $("store-switcher");
  if (!el) return;
  const cur = storeName(app.storeId);
  el.innerHTML = `
    <div class="store-current">Magasin actuel : <strong>${esc(cur)}</strong></div>
    <select id="store-select" class="input-field">
      ${STORES.map((s) => `<option value="${s.id}"${s.id === app.storeId ? " selected" : ""}>${esc(s.name)}</option>`).join("")}
    </select>
    <button class="btn-secondary" id="btn-change-store">Changer de magasin</button>
  `;
  $("btn-change-store")?.addEventListener("click", async () => {
    const newId = $("store-select").value;
    if (newId === app.storeId) return;
    if (!confirm(`Changer pour "${storeName(newId)}" ?`)) return;
    const { switchStore } = await import("./firebase.js");
    await switchStore(newId);
    renderStoreSwitcher();
    toast("✅ Magasin changé : " + storeName(newId));
  });
}

/* ── Admin Panel ────────────────────────────────────── */

let _allUsers = {};

export async function renderAdminPanel() {
  const panel = $("admin-panel");
  if (!panel) return;
  if (!isAdmin() && app.email !== ADMIN_EMAIL) {
    panel.classList.add("hidden");
    return;
  }
  panel.classList.remove("hidden");

  // Peupler le filtre magasin
  const filterEl = $("admin-store-filter");
  if (filterEl && filterEl.options.length === 1) {
    STORES.forEach((s) => {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.name;
      filterEl.appendChild(opt);
    });
  }

  _allUsers = await loadAllUsers();
  renderAdminPlayers();
}

function renderAdminPlayers() {
  const el = $("admin-players-list");
  if (!el) return;
  const entries = Object.entries(_allUsers);
  if (!entries.length) {
    el.innerHTML = `<div class="admin-row admin-empty">Aucun utilisateur</div>`;
    return;
  }
  const filterStore = $("admin-store-filter")?.value || "";
  const filtered = filterStore
    ? entries.filter(([, u]) => u.store === filterStore)
    : entries;
  if (!filtered.length) {
    el.innerHTML = `<div class="admin-row admin-empty">Aucun utilisateur dans ce magasin</div>`;
    return;
  }
  // Tri : admin → staff → student, puis par XP
  const roleOrder = { admin: 0, staff: 1, student: 2 };
  el.innerHTML = filtered
    .sort((a, b) => {
      const ro = (roleOrder[a[1].role] ?? 9) - (roleOrder[b[1].role] ?? 9);
      if (ro !== 0) return ro;
      return (b[1].local?.rpg?.xp || 0) - (a[1].local?.rpg?.xp || 0);
    })
    .map(([uid, u]) => {
      const rpg = u.local?.rpg || {};
      const lvl = getLevel(rpg.xp || 0);
      const role = u.role || "staff";
      const isMe = uid === app.uid;
      return `
    <div class="admin-row">
      <div class="admin-avatar">${lvl.avatar || "🧑"}</div>
      <div class="admin-info">
        <div class="admin-name">${esc(u.username || uid)}${isMe ? ' <span class="leaderboard-me-badge">Moi</span>' : ""}</div>
        <div class="admin-detail">${ROLE_LABELS[role] || role} · Niv. ${lvl.lvl} · ${rpg.xp || 0} XP · ${esc(storeName(u.store))}</div>
      </div>
      <div class="admin-actions">
        <button class="icon-btn icon-edit" data-action="admin-edit" data-uid="${esc(uid)}">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
      </div>
    </div>`;
    })
    .join("");
}

export function openAdminEdit(uid) {
  const u = _allUsers[uid];
  if (!u) return;
  const rpg = u.local?.rpg || {};
  const lvl = getLevel(rpg.xp || 0);
  $("admin-edit-uid").value = uid;
  $("admin-edit-name").value = u.username || "";
  $("admin-edit-xp").value = rpg.xp || 0;
  $("admin-edit-level").value = "Niv. " + lvl.lvl + " — " + lvl.title;
  const storeEl = $("admin-edit-store");
  if (storeEl) {
    storeEl.innerHTML = STORES.map(
      (s) => `<option value="${s.id}"${s.id === u.store ? " selected" : ""}>${esc(s.name)}</option>`
    ).join("");
  }
  // Rôle (désactivé pour soi-même pour éviter de se démoter par erreur)
  const roleEl = $("admin-edit-role");
  if (roleEl) {
    const cur = u.role || "staff";
    roleEl.innerHTML = `
      <option value="admin"${cur === "admin" ? " selected" : ""}>🛡️ Admin</option>
      <option value="staff"${cur === "staff" ? " selected" : ""}>👷 Staff</option>
      <option value="student"${cur === "student" ? " selected" : ""}>🎓 Étudiant</option>
    `;
    roleEl.disabled = uid === app.uid;
  }
  openModal("modal-admin-edit");
}

export function onAdminXpChange() {
  const xp = parseInt($("admin-edit-xp").value) || 0;
  const lvl = getLevel(xp);
  $("admin-edit-level").value = "Niv. " + lvl.lvl + " — " + lvl.title;
}

export async function adminSaveProfile() {
  const uid = $("admin-edit-uid").value;
  const newName = $("admin-edit-name").value.trim();
  const newXp = parseInt($("admin-edit-xp").value) || 0;
  const newStore = $("admin-edit-store")?.value || "";
  const newRole = $("admin-edit-role")?.value || "";
  if (!newName) { toast("⚠️ Nom requis"); return; }

  const u = _allUsers[uid] || {};
  const oldName = u.username || "";
  const lvl = getLevel(newXp);

  // Mettre à jour les données utilisateur
  await fbSet(`users/${uid}/username`, newName);
  await fbSet(`users/${uid}/local/rpg`, {
    ...(u.local?.rpg || {}),
    xp: newXp,
    level: lvl.lvl,
  });
  if (newStore) await saveUserStore(uid, newStore);
  if (newRole && uid !== app.uid) await setUserRole(uid, newRole);

  // Mettre à jour le score dans le magasin courant (si nom change, renommer)
  const scoreData = {
    xp: newXp, level: lvl.lvl, title: lvl.title,
    avatar: lvl.avatar, name: newName, uid, updatedAt: Date.now(),
  };
  if (oldName && newName !== oldName) {
    await fbSet(sp(`renames/${oldName}`), { newName, at: Date.now() });
    await fbRemove(sp(`scores/${oldName}`));
  }
  if (oldName) await fbSet(sp(`scores/${newName}`), scoreData);

  // Mettre à jour le cache local
  _allUsers[uid] = {
    ...u,
    username: newName,
    store: newStore || u.store,
    role: newRole || u.role,
    local: { ...u.local, rpg: { ...(u.local?.rpg || {}), xp: newXp, level: lvl.lvl } },
  };

  closeModal("modal-admin-edit");
  toast("✅ Profil modifié");
  renderAdminPlayers();
}

export async function adminDeleteProfile() {
  const uid = $("admin-edit-uid").value;
  const u = _allUsers[uid];
  if (!confirm(`Supprimer définitivement "${u?.username || uid}" ?`)) return;
  await fbRemove(`users/${uid}`);
  if (u?.username) await fbRemove(sp(`scores/${u.username}`));
  delete _allUsers[uid];
  closeModal("modal-admin-edit");
  toast("🗑️ Profil supprimé");
  renderAdminPlayers();
}

export function switchAdminTab(tab) {
  $("admin-view-players").classList.toggle("hidden", tab !== "players");
  $("admin-view-products").classList.toggle("hidden", tab !== "products");
  $("admin-tab-players").classList.toggle("active", tab === "players");
  $("admin-tab-products").classList.toggle("active", tab === "products");
  if (tab === "products") renderAdminProducts();
}

export function renderAdminProducts() {
  const el = $("admin-products-list");
  if (!el) return;
  const searchEl = $("admin-prod-search");
  const q = searchEl ? searchEl.value.trim().toLowerCase() : "";
  let list = SHARED.products;
  if (q)
    list = list.filter(
      (p) => (p.name || "").toLowerCase().includes(q) || (p.supplier || "").toLowerCase().includes(q)
    );
  list = [...list].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  if (!list.length) {
    el.innerHTML = `<div class="admin-row admin-empty">${q ? "Aucun résultat" : "Aucun produit enregistré"}</div>`;
    return;
  }
  el.innerHTML = list
    .map(
      (p) => `
    <div class="admin-row">
      <div class="admin-product-icon">📦</div>
      <div class="admin-info">
        <div class="admin-name">${esc(p.name)}</div>
        <div class="admin-detail">${p.supplier ? `🏭 ${esc(p.supplier)}` : ""}${p.emplacementStock ? ` · 🏠 ${esc(p.emplacementStock)}` : ""}${p.emplacementRayon ? ` · 🗂️ ${esc(p.emplacementRayon)}` : ""}${p.barcode ? ` · 🔖 ${esc(p.barcode)}` : ""}</div>
      </div>
      <div class="admin-actions">
        <button class="icon-btn icon-edit icon-sm" data-action="edit-product" data-id="${esc(p.id)}">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="icon-btn danger icon-sm" data-action="del-product" data-id="${esc(p.id)}">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </div>
    </div>`
    )
    .join("");
}

/* ── Fiche produit (emplacement stock + rayon) ──────── */

function fillProdDatalists() {
  const zEl = $("prod-stock-list");
  if (zEl) {
    const labels = [...new Set(getZoneConfig().map((z) => getZoneData(z).label))];
    zEl.innerHTML = labels.map((l) => `<option value="${esc(l)}"></option>`).join("");
  }
  const rEl = $("prod-rayon-list");
  if (rEl) {
    const rayons = [...SHARED.rayons].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    rEl.innerHTML = rayons.map((r) => `<option value="${esc(r.name)}"></option>`).join("");
  }
}

export function openProductSheet(id) {
  const p = SHARED.products.find((x) => x.id === id);
  if (!p) return;
  fillProdDatalists();
  const catSel = $("pe-category");
  if (catSel) {
    catSel.innerHTML = ['<option value="">— Catégorie —</option>']
      .concat(CATEGORIES.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`))
      .join("");
  }
  $("pe-id").value = id;
  $("pe-name").value = p.name || "";
  $("pe-category").value = p.category || "";
  $("pe-sup").value = p.supplier || "";
  $("pe-barcode").value = p.barcode || "";
  $("pe-stock").value = p.emplacementStock || "";
  $("pe-dlc").value = p.dlc || "";
  $("pe-dlcqty").value = p.dlcQty || "";
  openModal("modal-edit-product");
}

export function saveProductSheet() {
  const id = $("pe-id").value;
  const p = SHARED.products.find((x) => x.id === id);
  if (!p) return;
  const name = $("pe-name").value.trim();
  if (!name) {
    toast("⚠️ Nom requis");
    return;
  }
  fbSet("products/" + id, {
    ...p,
    name,
    category: $("pe-category").value,
    supplier: $("pe-sup").value.trim(),
    barcode: $("pe-barcode").value.trim(),
    emplacementStock: $("pe-stock").value.trim(),
    dlc: $("pe-dlc").value,
    dlcQty: $("pe-dlcqty").value.trim(),
  });
  closeModal("modal-edit-product");
  toast("✅ Fiche produit enregistrée");
}

export function bindAdminEvents() {
  $("admin-players-list")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action='admin-edit']");
    if (btn) openAdminEdit(btn.dataset.uid);
  });
  $("admin-store-filter")?.addEventListener("change", renderAdminPlayers);
  $("admin-products-list")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    if (btn.dataset.action === "del-product") {
      const p = SHARED.products.find((x) => x.id === btn.dataset.id);
      if (p && confirm(`Supprimer "${p.name}" du catalogue ?`))
        fbRemove("products/" + btn.dataset.id);
    } else if (btn.dataset.action === "edit-product") {
      openProductSheet(btn.dataset.id);
    }
  });
  $("admin-prod-search")?.addEventListener("input", renderAdminProducts);
  $("admin-edit-xp")?.addEventListener("input", onAdminXpChange);
}

render.scores = () => {
  renderLeaderboard();
  if (app.email === ADMIN_EMAIL) renderAdminPanel();
};
render.products = renderAdminProducts;

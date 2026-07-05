import { $ } from "./utils.js";
import { LOCAL, app, applyRemoteLocal, saveLocal, registerRemoteSave } from "./state.js";
import {
  initFirebase,
  observeAuth,
  startSync,
  setSyncStatus,
  loadUserData,
  saveUserLocalNow,
  saveUserStore,
  ensureUserProfile,
  subscribeOwnProfile,
} from "./firebase.js";
import { updateRPG, renderBadges, checkStreak, closeLevelUp } from "./rpg.js";
import {
  filterTodo,
  renderTodo,
  bindTodoListEvents,
  addTodo,
  switchTodoTab,
  addTeamTodo,
  bindTeamTodoEvents,
  closeMissionDone,
} from "./todos.js";
import {
  renderDlc,
  addDlc,
  saveEditDlc,
  bindDlcEvents,
  switchDlcView,
} from "./dlc.js";
import { renderVrac, addVrac, saveEditVrac, bindVracEvents } from "./vrac.js";
import {
  renderSuppliers,
  bindSupplierEvents,
  addSupplier,
  saveEditSupplier,
} from "./fournisseurs.js";
import {
  renderReserve,
  bindReserveEvents,
  addReserve,
  saveEditReserve,
  saveZone,
  resetZone,
  toggleMap,
  showLocCombo,
  showEditReserveLocCombo,
} from "./reserve.js";
import {
  bindAdminEvents,
  switchAdminTab,
  adminSaveProfile,
  adminDeleteProfile,
  renderStoreSwitcher,
} from "./profil.js";
import { loginWithGoogle, logout, showLogin, hideLogin } from "./login.js";
import {
  openModal,
  closeModal,
  quickCreateSupplier,
  showSupplierCombo,
} from "./modals.js";
import { bindProductSuggestions } from "./productCatalog.js";
import {
  switchStockView,
  addRayon,
  saveEditRayon,
  addStockItem,
  bindStockEvents,
} from "./stock.js";
import { bindScanButtons } from "./scanner.js";
import {
  addCount,
  saveEditCount,
  generateLabel,
  confirmPrint,
  togglePrintAll,
  bindInventoryEvents,
} from "./inventory.js";
import { switchPanel, fabContextualOpen } from "./nav.js";

/* ── Event bindings ─────────────────────────────────── */

function bindClick(id, fn) {
  const el = $(id);
  if (el) el.addEventListener("click", fn);
}

function bindComboInputs(pairs, handler) {
  pairs.forEach((pair) => {
    const [inputId, dropId] = pair.split("/");
    const el = $(inputId);
    if (!el) return;
    el.addEventListener("input", () => handler(inputId, dropId));
    el.addEventListener("focus", () => handler(inputId, dropId));
  });
}

function bindAll() {
  // Nav
  ["todo", "dlc", "fournisseurs", "reserve", "stock", "profil"].forEach((p) =>
    bindClick("nav-" + p, () => switchPanel(p))
  );

  // Stock sub-tabs
  bindClick("stab-week", () => switchStockView("week"));
  bindClick("stab-rayons", () => switchStockView("rayons"));
  bindClick("stab-inventory", () => switchStockView("inventory"));

  // Todo tabs / filters
  bindClick("ttab-personal", () => switchTodoTab("personal"));
  bindClick("ttab-team", () => switchTodoTab("team"));
  ["all", "high", "med", "low", "done"].forEach((f) =>
    bindClick("tf-" + f, () => filterTodo(f))
  );

  // DLC view toggle
  bindClick("dvt-list", () => switchDlcView("list"));
  bindClick("dvt-schema", () => switchDlcView("schema"));
  bindClick("dvt-vrac", () => switchDlcView("vrac"));

  // Admin tabs
  bindClick("admin-tab-players", () => switchAdminTab("players"));
  bindClick("admin-tab-products", () => switchAdminTab("products"));

  // Modal open buttons (declarative)
  document
    .querySelectorAll("[data-open-modal]")
    .forEach((btn) =>
      btn.addEventListener("click", () => openModal(btn.dataset.openModal))
    );

  // Modal overlays close on backdrop click
  document.querySelectorAll(".modal-overlay").forEach((ov) =>
    ov.addEventListener("click", (e) => {
      if (e.target === ov) closeModal(ov.id);
    })
  );

  // Action buttons
  bindClick("btn-add-todo", addTodo);
  bindClick("btn-add-dlc", addDlc);
  bindClick("btn-add-supplier", addSupplier);
  bindClick("btn-add-rayon", addRayon);
  bindClick("btn-save-edit-rayon", saveEditRayon);
  bindClick("btn-add-stock-item", addStockItem);
  bindClick("btn-add-count", addCount);
  bindClick("btn-save-edit-count", saveEditCount);
  bindClick("btn-gen-label", generateLabel);
  bindClick("btn-print-confirm", confirmPrint);
  const printAll = $("print-all");
  if (printAll) printAll.addEventListener("change", togglePrintAll);
  bindClick("btn-add-reserve", addReserve);
  bindClick("btn-add-team-todo", addTeamTodo);
  bindClick("btn-add-vrac", addVrac);
  bindClick("btn-quick-create-sup", quickCreateSupplier);
  bindClick("btn-save-edit-sup", saveEditSupplier);
  bindClick("btn-save-edit-dlc", saveEditDlc);
  bindClick("btn-save-edit-reserve", saveEditReserve);
  bindClick("btn-save-edit-vrac", saveEditVrac);
  bindClick("btn-google-login", loginWithGoogle);
  bindClick("btn-logout", logout);
  bindClick("btn-close-levelup", closeLevelUp);
  bindClick("btn-close-mission-done", closeMissionDone);
  bindClick("btn-admin-save", adminSaveProfile);
  bindClick("btn-admin-delete", adminDeleteProfile);
  bindClick("btn-toggle-map", toggleMap);
  bindClick("btn-save-zone", saveZone);
  bindClick("btn-reset-zone", resetZone);

  // FAB — contextual
  bindClick("fab-add", () => fabContextualOpen(openModal));

  // Supplier combos
  bindComboInputs(
    [
      "dlc-sup/drop-dlc",
      "edit-dlc-sup/drop-edit-dlc",
      "vrac-sup/drop-vrac-sup",
      "edit-vrac-sup/drop-edit-vrac-sup",
    ],
    showSupplierCombo
  );

  // Reserve location combos
  const rvLoc = $("rv-loc");
  if (rvLoc) {
    rvLoc.addEventListener("input", showLocCombo);
    rvLoc.addEventListener("focus", showLocCombo);
  }
  const editRvLoc = $("edit-rv-loc");
  if (editRvLoc) {
    editRvLoc.addEventListener("input", showEditReserveLocCombo);
    editRvLoc.addEventListener("focus", showEditReserveLocCombo);
  }

  // Product suggestions
  bindProductSuggestions("dlc-prod", "dlc-prod-suggestions", "dlc");
  bindProductSuggestions("rv-prod", "rv-prod-suggestions", "reserve");
  bindProductSuggestions("vrac-name", "vrac-name-suggestions", "dlc");
  bindProductSuggestions("si-name", "si-name-suggestions", "stock");

  // List event delegations
  bindTodoListEvents();
  bindTeamTodoEvents();
  bindDlcEvents();
  bindVracEvents();
  bindSupplierEvents();
  bindReserveEvents();
  bindStockEvents();
  bindInventoryEvents();
  bindScanButtons();
  bindAdminEvents();
}

/* ── Time-based badge tracking ──────────────────────── */

function trackTimeBadges() {
  const h = new Date().getHours();
  if (h <= 7) {
    LOCAL.rpg.earlyUse = (LOCAL.rpg.earlyUse || 0) + 1;
    LOCAL.rpg.morningUse = (LOCAL.rpg.morningUse || 0) + 1;
  }
  if (h >= 21) LOCAL.rpg.nightUse = (LOCAL.rpg.nightUse || 0) + 1;
  const day = new Date().getDay();
  if (day === 0 || day === 6) LOCAL.rpg.weekendUse = (LOCAL.rpg.weekendUse || 0) + 1;
  saveLocal();
}

/* ── Username derivation ────────────────────────────── */

function deriveUsername(user) {
  const raw = user.displayName || user.email?.split("@")[0] || "Joueur";
  return raw.replace(/[.#$/[\]]/g, "").trim() || "Joueur";
}

/* ── Store selection screen ─────────────────────────── */

import { STORES, ADMIN_EMAIL } from "./config.js";

/* ── Role-based UI permissions ──────────────────────── */

function applyRolePermissions() {
  const body = document.body;
  body.classList.toggle("role-admin", app.role === "admin");
  body.classList.toggle("role-staff", app.role === "staff");
  body.classList.toggle("role-student", app.role === "student");
}

function showStoreSelect() {
  const screen = $("store-select-screen");
  if (!screen) return;
  const list = $("store-select-list");
  if (list) {
    list.innerHTML = STORES.map(
      (s) => `<button class="store-select-btn" data-store-id="${s.id}">${s.name}</button>`
    ).join("");
    list.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-store-id]");
      if (!btn) return;
      const storeId = btn.dataset.storeId;
      await saveUserStore(app.uid, storeId);
      app.storeId = storeId;
      screen.classList.remove("show");
      startSync(storeId);
      renderStoreSwitcher();
    });
  }
  screen.classList.add("show");
}

/* ── Init ───────────────────────────────────────────── */

function init() {
  try {
    $("dlc-date").valueAsDate = new Date();
  } catch {}

  bindAll();
  initFirebase();

  observeAuth(async (user) => {
    if (user) {
      app.uid = user.uid;
      app.email = user.email || "";

      // 1) Username candidat (sera utilisé si profile absent)
      const fallbackUsername = deriveUsername(user);

      // 2) S'assure que le profil existe (crée avec role + email + username au besoin,
      //    complète les champs manquants pour les anciens profils)
      const profile = await ensureUserProfile(user, fallbackUsername);

      // 3) Charger les données complètes (local rpg/todos + store) sur ce profil
      const remoteData = await loadUserData(user.uid);
      if (remoteData) {
        if (remoteData.username) app.username = remoteData.username;
        applyRemoteLocal(remoteData.local || null);
        if (remoteData.store) app.storeId = remoteData.store;
      }
      if (!app.username) app.username = fallbackUsername;

      // 4) Rôle : préfère Firebase, fallback sur l'email hardcodé admin
      app.role = (profile && profile.role) || (app.email === ADMIN_EMAIL ? "admin" : "staff");
      // Garde-fou : l'email admin hardcodé est TOUJOURS admin, peu importe Firebase
      if (app.email === ADMIN_EMAIL) app.role = "admin";

      applyRolePermissions();

      registerRemoteSave(() => saveUserLocalNow(user.uid));

      $("sync-user").textContent = app.username;
      $("p-name").textContent = app.username;
      checkStreak();
      updateRPG();
      renderTodo();
      renderBadges();
      trackTimeBadges();
      hideLogin();

      // 5) Écoute en live les changements de profil (admin promote/demote/move)
      subscribeOwnProfile(user.uid, (data) => {
        const newRole = data.role || "staff";
        const forcedAdmin = app.email === ADMIN_EMAIL;
        const effectiveRole = forcedAdmin ? "admin" : newRole;
        if (effectiveRole !== app.role) {
          app.role = effectiveRole;
          applyRolePermissions();
        }
        if (data.store && data.store !== app.storeId) {
          // Magasin changé par admin : recharger pour repartir propre
          location.reload();
        }
      });

      // 6) Si aucun magasin assigné → afficher l'écran de sélection
      if (!app.storeId) {
        showStoreSelect();
      } else {
        startSync(app.storeId);
        renderStoreSwitcher();
      }
    } else {
      app.username = "";
      app.uid = "";
      app.storeId = "";
      app.role = "staff";
      app.firebaseMode = false;
      applyRolePermissions();
      setSyncStatus("offline", "Non connecté");
      showLogin();
    }
  });
}

init();

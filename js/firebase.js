import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  set,
  get,
  remove,
  push,
  update,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import { app, SHARED, LOCAL, saveLocal } from "./state.js";
import { $, uid, toast } from "./utils.js";
import { FIREBASE_CONFIG, ADMIN_EMAIL, DEFAULT_ROLE } from "./config.js";
import { render } from "./bus.js";

export { ref, onValue };

let _provider = null;
let _unsubscribers = [];

/* ── Store path helper ──────────────────────────────── */

export function sp(path) {
  return `stores/${app.storeId}/${path}`;
}

/* ── Sync status pill ───────────────────────────────── */

export function setSyncStatus(state, label) {
  const dot = $("sync-dot");
  const lbl = $("sync-label");
  if (dot) dot.className = "sync-dot " + state;
  if (lbl) lbl.textContent = label;
}

/* ── Init ───────────────────────────────────────────── */

export function initFirebase() {
  const fbApp = initializeApp(FIREBASE_CONFIG);
  app.db = getDatabase(fbApp);
  app.auth = getAuth(fbApp);
  _provider = new GoogleAuthProvider();
  setPersistence(app.auth, browserLocalPersistence).catch(() => {});
}

export function observeAuth(callback) {
  if (!app.auth) return;
  onAuthStateChanged(app.auth, callback);
}

export async function signInWithGoogle() {
  if (!app.auth || !_provider) throw new Error("Firebase not initialized");
  return signInWithPopup(app.auth, _provider);
}

export async function signOutUser() {
  if (!app.auth) return;
  await signOut(app.auth);
}

export function startSync(storeId) {
  app.storeId = storeId;
  app.firebaseMode = true;
  setSyncStatus("connecting", "Connexion…");
  subscribeAll();
}

/* ── Write helpers ──────────────────────────────────── */

export async function fbSet(path, data) {
  if (!app.db) return;
  await set(ref(app.db, path), data);
}

export async function fbPush(path, data) {
  if (!app.db) return null;
  const r = push(ref(app.db, path));
  await set(r, { ...data, _by: app.username, _at: Date.now() });
  return r.key;
}

export async function fbRemove(path) {
  if (!app.db) return;
  await remove(ref(app.db, path));
}

/* ── Local / Firebase abstraction (store-prefixed) ──── */

export async function fbPushOrLocal(collection, data) {
  if (app.firebaseMode) {
    await fbPush(sp(collection), data);
  } else {
    SHARED[collection].push({ ...data, id: uid() });
    render[collection]?.();
  }
}

export async function fbRemoveOrLocal(collection, id) {
  if (app.firebaseMode) {
    await fbRemove(sp(`${collection}/${id}`));
  } else {
    SHARED[collection] = SHARED[collection].filter((x) => x.id !== id);
    render[collection]?.();
  }
}

export async function fbUpdateOrLocal(collection, id, data) {
  if (app.firebaseMode) {
    await fbSet(sp(`${collection}/${id}`), { ...data, _by: app.username, _at: Date.now() });
  } else {
    const idx = SHARED[collection].findIndex((x) => x.id === id);
    if (idx >= 0) SHARED[collection][idx] = { ...SHARED[collection][idx], ...data };
    render[collection]?.();
  }
}

/* ── Subscriptions ──────────────────────────────────── */

const STORE_COLLECTIONS = ["dlc", "suppliers", "reserve", "vrac", "rayons", "stockItems", "rayonChecks", "invCounts", "reassort"];

function unsubscribeAll() {
  _unsubscribers.forEach((unsub) => unsub());
  _unsubscribers = [];
  STORE_COLLECTIONS.forEach((c) => { SHARED[c] = []; });
  SHARED.products = [];
  SHARED.teamTodos = [];
  SHARED.scores = {};
  SHARED.zones = {};
  SHARED.invZones = {};
  SHARED.invMeta = {};
  SHARED.roulementMeta = {};
}

function subscribeAll() {
  if (!app.db) return;
  unsubscribeAll();

  STORE_COLLECTIONS.forEach((path) => {
    const unsub = onValue(ref(app.db, sp(path)), (snap) => {
      const val = snap.val();
      SHARED[path] = val ? Object.entries(val).map(([id, v]) => ({ ...v, id })) : [];
      render[path]?.();
      if (path === "reserve" || path === "invCounts") render.zones?.();
      if (path === "invCounts") render.reserve?.();
      if (path === "dlc") { render.migrateDlc?.(); render.infoProducts?.(); setSyncStatus("connected", "Synchronisé"); }
      if (path === "suppliers") render.infoProducts?.();
    });
    _unsubscribers.push(unsub);
  });

  // Produits partagés entre tous les magasins (racine Firebase)
  const unsubProducts = onValue(ref(app.db, "products"), (snap) => {
    const val = snap.val();
    SHARED.products = val ? Object.entries(val).map(([id, v]) => ({ ...v, id })) : [];
    render.products?.();
    render.zones?.();
    render.infoProducts?.();
    render.dlc?.();
    render.suppliers?.();
  });
  _unsubscribers.push(unsubProducts);

  const unsubTeam = onValue(ref(app.db, sp("teamTodos")), (snap) => {
    const val = snap.val();
    SHARED.teamTodos = val ? Object.entries(val).map(([id, v]) => ({ ...v, id })) : [];
    SHARED.teamTodos.forEach((t) => {
      if (
        t.status === "done" &&
        t._by === app.username &&
        t._validatedBy &&
        t._validatedBy !== app.username &&
        !LOCAL.notifiedDone.includes(t.id)
      ) {
        LOCAL.notifiedDone.push(t.id);
        saveLocal();
        render.missionDonePopup?.(t._validatedBy, t.text);
        setTimeout(() => fbRemove(sp("teamTodos/" + t.id)), 3000);
      }
    });
    render.teamTodos?.();
  });
  _unsubscribers.push(unsubTeam);

  const unsubScores = onValue(ref(app.db, sp("scores")), (snap) => {
    SHARED.scores = snap.val() || {};
    render.scores?.();
  });
  _unsubscribers.push(unsubScores);

  const unsubZones = onValue(ref(app.db, sp("zones")), (snap) => {
    SHARED.zones = snap.val() || {};
    render.zones?.();
  });
  _unsubscribers.push(unsubZones);

  const unsubInvZones = onValue(ref(app.db, sp("invZones")), (snap) => {
    SHARED.invZones = snap.val() || {};
    render.inventory?.();
  });
  _unsubscribers.push(unsubInvZones);

  const unsubInvMeta = onValue(ref(app.db, sp("invMeta")), (snap) => {
    SHARED.invMeta = snap.val() || {};
    render.inventory?.();
  });
  _unsubscribers.push(unsubInvMeta);

  const unsubRoul = onValue(ref(app.db, sp("roulementMeta")), (snap) => {
    SHARED.roulementMeta = snap.val() || {};
    render.roulement?.();
  });
  _unsubscribers.push(unsubRoul);

  onValue(
    ref(app.db, sp("renames/" + app.username)),
    (snap) => {
      const data = snap.val();
      if (!data || !data.newName) return;
      const newName = data.newName;
      const oldName = app.username;
      app.username = newName;
      const sync = $("sync-user");
      const pname = $("p-name");
      if (sync) sync.textContent = newName;
      if (pname) pname.textContent = newName;
      toast("👤 Ton nom a été modifié en : " + newName);
      setTimeout(() => fbRemove(sp("renames/" + oldName)), 1000);
    },
    { onlyOnce: true }
  );

  render.publishInitialScore?.();
}

/* ── Store switching ────────────────────────────────── */

export async function switchStore(storeId) {
  unsubscribeAll();
  app.storeId = storeId;
  app.firebaseMode = true;
  setSyncStatus("connecting", "Connexion…");
  await fbSet(`users/${app.uid}/store`, storeId);
  subscribeAll();
}

/* ── User data (LOCAL + username + store) ───────────── */

export async function loadUserData(uid) {
  if (!app.db) return null;
  try {
    const snap = await get(ref(app.db, `users/${uid}`));
    return snap.exists() ? snap.val() : null;
  } catch {
    return null;
  }
}

export async function saveUserLocalNow(uid) {
  if (!app.db || !uid) return;
  try {
    await set(ref(app.db, `users/${uid}/local`), LOCAL);
    if (app.username) await set(ref(app.db, `users/${uid}/username`), app.username);
  } catch {}
}

export async function saveUserStore(uid, storeId) {
  if (!app.db || !uid) return;
  await set(ref(app.db, `users/${uid}/store`), storeId);
}

export async function setUserRole(targetUid, role) {
  if (!app.db || !targetUid) return;
  await set(ref(app.db, `users/${targetUid}/role`), role);
}

/**
 * Initialise le profil user dans Firebase au premier login,
 * ou complète les champs manquants (role) pour les anciens users.
 */
export async function ensureUserProfile(authUser, fallbackUsername) {
  if (!app.db) return null;
  const uref = ref(app.db, `users/${authUser.uid}`);
  const snap = await get(uref);
  const existing = snap.exists() ? snap.val() : null;

  // Détermine le rôle : si email admin → admin sinon staff par défaut.
  const adminEmailMatch = (authUser.email || "") === ADMIN_EMAIL;

  if (!existing) {
    // Première connexion : créer le profil minimal
    const role = adminEmailMatch ? "admin" : DEFAULT_ROLE;
    const profile = {
      role,
      email: authUser.email || "",
      username: fallbackUsername,
      createdAt: Date.now(),
    };
    await set(uref, profile);
    return profile;
  }

  // Compatibilité descendante : compléter les champs manquants
  const patch = {};
  if (!existing.role) patch.role = adminEmailMatch ? "admin" : DEFAULT_ROLE;
  if (!existing.email && authUser.email) patch.email = authUser.email;
  if (!existing.username && fallbackUsername) patch.username = fallbackUsername;
  if (Object.keys(patch).length) {
    await update(uref, patch);
    return { ...existing, ...patch };
  }
  return existing;
}

/**
 * Écoute en temps réel les changements de rôle / store sur PROPRE profil
 * pour réagir si l'admin demote/promote ou change de magasin.
 */
export function subscribeOwnProfile(uid, onChange) {
  if (!app.db || !uid) return;
  onValue(ref(app.db, `users/${uid}`), (snap) => {
    const data = snap.val();
    if (!data) return;
    onChange(data);
  });
}

/* ── Admin : lire tous les users ───────────────────── */

export async function loadAllUsers() {
  if (!app.db) return {};
  try {
    const snap = await get(ref(app.db, "users"));
    return snap.exists() ? snap.val() : {};
  } catch {
    return {};
  }
}

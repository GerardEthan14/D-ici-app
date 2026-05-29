import { $, toast } from "./utils.js";
import { app, saveConfig } from "./state.js";
import { initFirebase, setSyncStatus } from "./firebase.js";
import { publishScore } from "./rpg.js";
import { STORAGE_KEYS } from "./config.js";
import { render } from "./bus.js";

export function openSetup() {
  $("setup-screen").classList.add("show");
}

export async function saveSetup() {
  const uname = $("setup-username").value.trim();
  const apiKey = $("fb-apiKey").value.trim();
  const projectId = $("fb-projectId").value.trim();
  const appId = $("fb-appId").value.trim();
  let dbUrl = $("fb-dbUrl").value.trim();
  if (!uname) {
    alert("Entre ton prénom !");
    return;
  }
  if (!apiKey || !projectId || !appId) {
    alert("Remplis les champs API Key, Project ID et App ID !");
    return;
  }
  if (!dbUrl) dbUrl = `https://${projectId}-default-rtdb.firebaseio.com`;
  dbUrl = dbUrl.replace(/\/+$/, "");

  app.username = uname;
  const cfg = {
    apiKey,
    authDomain: `${projectId}.firebaseapp.com`,
    databaseURL: dbUrl,
    projectId,
    appId,
  };

  const btn = document.querySelector(".setup-btn");
  btn.textContent = "Connexion en cours…";
  btn.disabled = true;
  setSyncStatus("connecting", "Connexion…");

  const ok = await initFirebase(cfg);
  btn.textContent = "Connecter et démarrer 🚀";
  btn.disabled = false;

  if (ok) {
    saveConfig({ ...cfg, username: uname });
    localStorage.setItem(STORAGE_KEYS.username, uname);
    $("setup-screen").classList.remove("show");
    $("sync-user").textContent = uname;
    $("p-name").textContent = uname;
    toast("🔥 Connecté en tant que " + uname);
    publishScore();
  } else {
    setSyncStatus("offline", "Erreur de connexion");
    alert(
      "❌ Connexion échouée.\n\nVérifie :\n• Les 3 identifiants Firebase\n• L'URL de la base de données\n• Que la base est bien en mode Test"
    );
  }
}

export function skipSetup() {
  const uname = $("setup-username").value.trim() || "Moi";
  app.username = uname;
  localStorage.setItem(STORAGE_KEYS.username, uname);
  localStorage.setItem(STORAGE_KEYS.skipSetup, "1");
  $("setup-screen").classList.remove("show");
  $("sync-user").textContent = uname + " (local)";
  $("p-name").textContent = uname;
  setSyncStatus("local", "Mode local");
  render.dlc?.();
  render.orders?.();
  render.suppliers?.();
  render.reserve?.();
  render.vrac?.();
}

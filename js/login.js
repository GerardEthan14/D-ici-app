import { $ } from "./utils.js";
import { signInWithGoogle, signOutUser, setSyncStatus } from "./firebase.js";

export function showLogin() {
  $("login-screen").classList.add("show");
}

export function hideLogin() {
  $("login-screen").classList.remove("show");
}

export async function loginWithGoogle() {
  const btn = $("btn-google-login");
  const errEl = $("login-error");
  if (errEl) errEl.textContent = "";
  if (btn) {
    btn.disabled = true;
    btn.classList.add("loading");
  }
  try {
    await signInWithGoogle();
  } catch (e) {
    console.error("Login error", e);
    if (errEl) {
      errEl.textContent =
        e.code === "auth/popup-blocked"
          ? "Popup bloqué — autorise les popups pour ce site et réessaie."
          : e.code === "auth/popup-closed-by-user"
          ? "Connexion annulée."
          : "Erreur de connexion. Réessaie.";
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove("loading");
    }
  }
}

export async function logout() {
  if (!confirm("Se déconnecter ?")) return;
  setSyncStatus("offline", "Déconnexion…");
  await signOutUser();
  location.reload();
}

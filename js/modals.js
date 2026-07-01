import { $, esc, toast } from "./utils.js";
import { SHARED, LOCAL, saveLocal } from "./state.js";
import { fbPushOrLocal } from "./firebase.js";
import { gainXP } from "./rpg.js";

export function openModal(id) {
  $(id)?.classList.add("open");
}

export function closeModal(id) {
  $(id)?.classList.remove("open");
  hideAllCombos();
}

export function hideAllCombos() {
  document.querySelectorAll(".combo-dropdown").forEach((d) => (d.style.display = "none"));
}

/* ── Supplier combo (add/search/quick-create) ───────── */
let pendingCombo = null;

export function showSupplierCombo(inputId, dropId) {
  const q = $(inputId).value.trim().toLowerCase();
  const drop = $(dropId);
  const matches = SHARED.suppliers.filter((s) => !q || s.name.toLowerCase().includes(q));

  let html = matches
    .map((s) => {
      const safe = esc(s.name);
      return `<div class="combo-item" data-action="selectSup" data-input="${inputId}" data-drop="${dropId}" data-name="${safe}">🏭 ${safe}</div>`;
    })
    .join("");

  const label = q ? `Créer "${esc(q)}"` : "Créer un nouveau fournisseur";
  html += `<div class="combo-item create" data-action="quickCreate" data-input="${inputId}" data-drop="${dropId}" data-pf="${esc(q)}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>${label}</div>`;

  drop.innerHTML = html;
  drop.style.display = "block";

  drop.onclick = (e) => {
    const item = e.target.closest(".combo-item");
    if (!item) return;
    e.stopPropagation();
    if (item.dataset.action === "selectSup") {
      $(item.dataset.input).value = item.dataset.name;
      $(item.dataset.drop).style.display = "none";
    } else if (item.dataset.action === "quickCreate") {
      pendingCombo = { iid: item.dataset.input, did: item.dataset.drop };
      hideAllCombos();
      $("qs-name").value = item.dataset.pf || "";
      $("qs-contact").value = "";
      $("qs-day").value = "";
      openModal("modal-qs");
    }
  };
  setTimeout(() => document.addEventListener("click", () => hideAllCombos(), { once: true }), 50);
}

export async function quickCreateSupplier() {
  const name = $("qs-name").value.trim();
  if (!name) {
    toast("⚠️ Nom requis");
    return;
  }
  const data = {
    name,
    contact: $("qs-contact").value.trim(),
    day: $("qs-day").value.trim(),
    franco: "",
    notes: "",
  };
  await fbPushOrLocal("suppliers", data);
  LOCAL.rpg.supAdded = (LOCAL.rpg.supAdded || 0) + 1;
  gainXP("supplier_add");
  saveLocal();
  if (pendingCombo) {
    $(pendingCombo.iid).value = name;
    pendingCombo = null;
  }
  closeModal("modal-qs");
  toast(`✅ Fournisseur "${name}" créé`);
}

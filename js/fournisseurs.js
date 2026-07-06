import { $, esc, toast } from "./utils.js";
import { SHARED, LOCAL, saveLocal } from "./state.js";
import { fbPushOrLocal, fbRemoveOrLocal, fbUpdateOrLocal } from "./firebase.js";
import { gainXP, checkBadges } from "./rpg.js";
import { closeModal, openModal } from "./modals.js";
import { render } from "./bus.js";

/* ── Type fournisseur (central / direct) ────────────── */

const TYPE_LABELS = {
  central: "🏢 Central",
  direct: "🚚 Direct",
};

/* ── Suppliers ──────────────────────────────────────── */

export function renderSuppliers() {
  const el = $("sup-list");
  if (!el) return;
  const q = ($("sup-search")?.value || "").trim().toLowerCase();
  let list = SHARED.suppliers;
  if (q)
    list = list.filter(
      (s) =>
        (s.name || "").toLowerCase().includes(q) ||
        (s.contact || "").toLowerCase().includes(q) ||
        (s.notes || "").toLowerCase().includes(q)
    );
  if (!list.length) {
    el.innerHTML = `<div class="empty-state"><p>${q ? "Aucun fournisseur trouvé." : "Aucune fiche fournisseur."}</p></div>`;
    return;
  }
  el.innerHTML = list
    .map(
      (s) => `
    <div class="sup-card">
      <div class="sup-card-name">${esc(s.name)}
        ${s.type && TYPE_LABELS[s.type] ? `<span class="sup-type-chip sup-type-${esc(s.type)}">${TYPE_LABELS[s.type]}</span>` : ""}
        <span class="sup-card-actions">
          <button class="icon-btn icon-edit" data-action="edit-sup" data-id="${esc(s.id)}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="icon-btn danger" data-action="del-sup" data-id="${esc(s.id)}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg></button>
        </span>
      </div>
      <div class="sup-grid">
        <div class="sup-block"><div class="sup-block-lbl">📞 Contact</div><div class="sup-block-val">${esc(s.contact || "—")}</div></div>
        <div class="sup-block"><div class="sup-block-lbl">📅 Livraison</div><div class="sup-block-val">${esc(s.day || "—")}</div></div>
        <div class="sup-block"><div class="sup-block-lbl">🔀 Approvisionnement</div><div class="sup-block-val">${s.type && TYPE_LABELS[s.type] ? TYPE_LABELS[s.type] : "—"}</div></div>
        <div class="sup-block"><div class="sup-block-lbl">🚚 Franco de port</div><div class="sup-block-val">${esc(s.franco || "—")}</div></div>
        ${s.notes ? `<div class="sup-block sup-block-full"><div class="sup-block-lbl">📝 Notes</div><div class="sup-block-val">${esc(s.notes)}</div></div>` : ""}
      </div>
    </div>`
    )
    .join("");
}

export function bindSupplierEvents() {
  $("sup-list")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    if (btn.dataset.action === "edit-sup") openEditSupplier(btn.dataset.id);
    else if (btn.dataset.action === "del-sup") {
      if (confirm("Supprimer cette fiche ?"))
        fbRemoveOrLocal("suppliers", btn.dataset.id);
    }
  });
}

export async function addSupplier() {
  const name = $("cs-name").value.trim();
  if (!name) {
    toast("⚠️ Nom requis");
    return;
  }
  await fbPushOrLocal("suppliers", {
    name,
    contact: $("cs-contact").value.trim(),
    day: $("cs-day").value.trim(),
    type: $("cs-type").value,
    franco: $("cs-franco").value.trim(),
    notes: $("cs-notes").value.trim(),
  });
  LOCAL.rpg.supAdded = (LOCAL.rpg.supAdded || 0) + 1;
  gainXP("supplier_add");
  saveLocal();
  ["cs-name", "cs-contact", "cs-day", "cs-franco", "cs-notes"].forEach((i) => ($(i).value = ""));
  $("cs-type").value = "";
  closeModal("modal-add-supplier");
  checkBadges();
  toast("✅ Fiche créée +5 XP", true);
}

export function openEditSupplier(id) {
  const s = SHARED.suppliers.find((x) => x.id === id);
  if (!s) return;
  $("edit-sup-id").value = id;
  $("edit-sup-name").value = s.name || "";
  $("edit-sup-contact").value = s.contact || "";
  $("edit-sup-day").value = s.day || "";
  $("edit-sup-type").value = s.type || "";
  $("edit-sup-franco").value = s.franco || "";
  $("edit-sup-notes").value = s.notes || "";
  openModal("modal-edit-supplier");
}

export async function saveEditSupplier() {
  const id = $("edit-sup-id").value;
  const s = SHARED.suppliers.find((x) => x.id === id);
  if (!s) return;
  const updated = {
    ...s,
    name: $("edit-sup-name").value.trim(),
    contact: $("edit-sup-contact").value.trim(),
    day: $("edit-sup-day").value.trim(),
    type: $("edit-sup-type").value,
    franco: $("edit-sup-franco").value.trim(),
    notes: $("edit-sup-notes").value.trim(),
  };
  if (!updated.name) {
    toast("⚠️ Nom requis");
    return;
  }
  await fbUpdateOrLocal("suppliers", id, updated);
  closeModal("modal-edit-supplier");
  toast("✅ Fournisseur modifié");
}

/* Register renders for bus */
render.suppliers = renderSuppliers;

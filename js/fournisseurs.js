import { $, esc, toast } from "./utils.js";
import { SHARED, LOCAL, saveLocal } from "./state.js";
import { fbPushOrLocal, fbUpdateOrLocal } from "./firebase.js";
import { gainXP, checkBadges } from "./rpg.js";
import { closeModal, openModal } from "./modals.js";
import { normName } from "./productCatalog.js";
import { render } from "./bus.js";

/* ── Type fournisseur (central / direct) ────────────── */

const TYPE_LABELS = {
  central: "🏢 Central",
  direct: "🚚 Direct",
};

/* ── Suppliers ──────────────────────────────────────── */

// La liste des fournisseurs est dérivée des PRODUITS (import Excel).
// Chaque fournisseur reste éditable (fiche stockée par nom).
export function renderSuppliers() {
  const el = $("sup-list");
  if (!el) return;
  const q = ($("sup-search")?.value || "").trim().toLowerCase();

  const names = new Map(); // clé normalisée -> nom affiché
  SHARED.products.forEach((p) => {
    const n = (p.supplier || "").trim();
    if (n && !names.has(normName(n))) names.set(normName(n), n);
  });
  let list = [...names.entries()].map(([key, name]) => ({ key, name }));
  if (q) list = list.filter((x) => x.name.toLowerCase().includes(q));
  list.sort((a, b) => a.name.localeCompare(b.name));

  if (!list.length) {
    el.innerHTML = `<div class="empty-state"><p>${
      q ? "Aucun fournisseur trouvé." : "Aucun fournisseur. Importe tes produits (Info → Produit → Importer) : les fournisseurs de l'Excel apparaîtront ici."
    }</p></div>`;
    return;
  }

  const pencil = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;

  el.innerHTML = list
    .map(({ key, name }) => {
      const s = SHARED.suppliers.find((x) => normName(x.name) === key);
      const count = SHARED.products.filter((p) => normName(p.supplier) === key).length;
      const action = s ? `data-action="edit-sup" data-id="${esc(s.id)}"` : `data-action="new-sup" data-name="${esc(name)}"`;
      return `<div class="sup-card">
      <div class="sup-card-name">${esc(name)}
        ${s && s.type && TYPE_LABELS[s.type] ? `<span class="sup-type-chip sup-type-${esc(s.type)}">${TYPE_LABELS[s.type]}</span>` : ""}
        <span class="sup-card-actions">
          <button class="icon-btn icon-edit" ${action}>${pencil}</button>
        </span>
      </div>
      <div class="sup-grid">
        <div class="sup-block"><div class="sup-block-lbl">📦 Produits</div><div class="sup-block-val">${count}</div></div>
        <div class="sup-block"><div class="sup-block-lbl">📞 Contact</div><div class="sup-block-val">${esc((s && s.contact) || "—")}</div></div>
        <div class="sup-block"><div class="sup-block-lbl">📅 Livraison</div><div class="sup-block-val">${esc((s && s.day) || "—")}</div></div>
        <div class="sup-block"><div class="sup-block-lbl">🚚 Franco de port</div><div class="sup-block-val">${esc((s && s.franco) || "—")}</div></div>
        ${s && s.notes ? `<div class="sup-block sup-block-full"><div class="sup-block-lbl">📝 Notes</div><div class="sup-block-val">${esc(s.notes)}</div></div>` : ""}
      </div>
    </div>`;
    })
    .join("");
}

export function bindSupplierEvents() {
  $("sup-list")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    if (btn.dataset.action === "edit-sup") openEditSupplier(btn.dataset.id);
    else if (btn.dataset.action === "new-sup") openAddSupplier(btn.dataset.name);
  });
}

// Ouvre la fiche d'ajout, pré-remplie avec un nom (depuis un fournisseur dérivé).
export function openAddSupplier(name) {
  ["cs-name", "cs-contact", "cs-day", "cs-franco", "cs-notes"].forEach((i) => ($(i).value = ""));
  $("cs-type").value = "";
  if (name) $("cs-name").value = name;
  openModal("modal-add-supplier");
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

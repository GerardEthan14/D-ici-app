import { $, esc, toast } from "./utils.js";
import { SHARED, LOCAL, app, saveLocal } from "./state.js";
import { fbPushOrLocal, fbRemoveOrLocal, fbUpdateOrLocal } from "./firebase.js";
import { gainXP, checkBadges } from "./rpg.js";
import { closeModal, openModal } from "./modals.js";
import { saveProductToCatalog } from "./productCatalog.js";
import { render } from "./bus.js";

/* ── Tabs ───────────────────────────────────────────── */

export function switchCmdTab(t) {
  $("view-orders").classList.toggle("hidden", t !== "orders");
  $("view-suppliers").classList.toggle("hidden", t !== "suppliers");
  $("tab-orders").classList.toggle("active", t === "orders");
  $("tab-suppliers").classList.toggle("active", t === "suppliers");
}

let activeKanban = "todo";
export function switchKanban(s) {
  activeKanban = s;
  ["todo", "waiting"].forEach((k) => $("kt-" + k).classList.toggle("active", k === s));
  renderKanban();
}
export function getActiveKanban() {
  return activeKanban;
}

/* ── Kanban ─────────────────────────────────────────── */

const kanbanExpanded = {};

export function renderKanban() {
  const el = $("kanban-list");
  if (!el) return;
  const searchEl = $("order-search");
  const q = searchEl ? searchEl.value.trim().toLowerCase() : "";
  let filtered = SHARED.orders.filter((o) => o.status === activeKanban);
  if (q)
    filtered = filtered.filter(
      (o) =>
        (o.name || "").toLowerCase().includes(q) ||
        (o.supplier || "").toLowerCase().includes(q)
    );

  if (!filtered.length) {
    el.innerHTML = `<div class="empty-state kanban-empty"><p>${q ? "Aucun résultat." : "Aucun produit ici."}</p></div>`;
    return;
  }

  const groups = {};
  filtered.forEach((o) => {
    const key = o.supplier || "Sans fournisseur";
    (groups[key] ||= []).push(o);
  });
  const sortedKeys = Object.keys(groups).sort((a, b) => a.localeCompare(b));
  const dot = { todo: "dot-todo", waiting: "dot-waiting" };

  el.innerHTML = sortedKeys
    .map((sup) => {
      const items = groups[sup];
      const expanded = q ? true : !!kanbanExpanded[sup];
      return `<div class="supplier-group">
      <div class="supplier-group-header" data-action="toggle-group" data-sup="${esc(sup)}">
        <span class="supplier-group-name">🏭 ${esc(sup)}</span>
        <span class="supplier-group-count">${items.length} produit${items.length > 1 ? "s" : ""}</span>
        <span class="supplier-group-chevron ${expanded ? "open" : ""}">▶</span>
      </div>
      <div class="supplier-group-body ${expanded ? "" : "collapsed"}">
        ${items
          .map((o) => {
            const by =
              o._by && o._by !== app.username
                ? `<span class="order-by">par ${esc(o._by)}</span>`
                : "";
            return `<div class="order-card">
            <div class="order-inner">
              <div class="order-dot ${dot[o.status] || ""}"></div>
              <div class="order-info">
                <div class="order-name">${esc(o.name)}</div>
                <div class="order-meta">${o.qty ? `<span>${esc(o.qty)}</span>` : ""}${by}</div>
              </div>
              <div class="order-actions">
                <button class="icon-btn icon-edit icon-sm" data-action="edit-order" data-id="${esc(o.id)}">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                ${
                  o.status === "todo"
                    ? `<button class="icon-btn icon-adv icon-sm" data-action="adv-order" data-id="${esc(o.id)}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>`
                    : ""
                }
                ${
                  o.status === "waiting"
                    ? `<button class="icon-btn success icon-sm" data-action="adv-order" data-id="${esc(o.id)}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></button>`
                    : ""
                }
                <button class="icon-btn danger icon-sm" data-action="del-order" data-id="${esc(o.id)}">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg>
                </button>
              </div>
            </div>
          </div>`;
          })
          .join("")}
      </div>
    </div>`;
    })
    .join("");
}

export function bindKanbanEvents() {
  $("kanban-list")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    switch (btn.dataset.action) {
      case "toggle-group":
        kanbanExpanded[btn.dataset.sup] = !kanbanExpanded[btn.dataset.sup];
        renderKanban();
        break;
      case "adv-order":
        advOrder(id);
        break;
      case "del-order":
        delOrder(id);
        break;
      case "edit-order":
        openEditOrder(id);
        break;
    }
  });
  $("order-search")?.addEventListener("input", renderKanban);
}

/* ── Orders CRUD ────────────────────────────────────── */

export async function addOrder() {
  const name = $("ord-prod").value.trim();
  const sup = $("ord-sup").value.trim();
  if (!name) {
    toast("⚠️ Nom requis");
    return;
  }
  await fbPushOrLocal("orders", {
    name,
    supplier: sup,
    qty: $("ord-qty").value.trim(),
    status: "todo",
  });
  if ($("ord-save-product").checked) saveProductToCatalog(name, sup);
  gainXP("order_add");
  ["ord-prod", "ord-sup", "ord-qty"].forEach((i) => ($(i).value = ""));
  closeModal("modal-add-order");
  toast("✅ Produit ajouté !");
  if (activeKanban !== "todo") switchKanban("todo");
}

async function advOrder(id) {
  const o = SHARED.orders.find((x) => x.id === id);
  if (!o) return;
  if (o.status === "todo") {
    await fbUpdateOrLocal("orders", id, { ...o, status: "waiting" });
    gainXP("order_advance");
    toast("📦 En attente de livraison", true);
  } else if (o.status === "waiting") {
    await fbRemoveOrLocal("orders", id);
    LOCAL.rpg.ordersRcv = (LOCAL.rpg.ordersRcv || 0) + 1;
    gainXP("order_receive");
    checkBadges();
    saveLocal();
    toast("🎉 Commande reçue ! +20 XP", true);
  }
}

async function delOrder(id) {
  await fbRemoveOrLocal("orders", id);
}

export function openEditOrder(id) {
  const o = SHARED.orders.find((x) => x.id === id);
  if (!o) return;
  $("edit-ord-id").value = id;
  $("edit-ord-name").value = o.name || "";
  $("edit-ord-sup").value = o.supplier || "";
  $("edit-ord-qty").value = o.qty || "";
  openModal("modal-edit-order");
}

export async function saveEditOrder() {
  const id = $("edit-ord-id").value;
  const o = SHARED.orders.find((x) => x.id === id);
  if (!o) return;
  const name = $("edit-ord-name").value.trim();
  if (!name) {
    toast("⚠️ Nom requis");
    return;
  }
  const updated = {
    ...o,
    name,
    supplier: $("edit-ord-sup").value.trim(),
    qty: $("edit-ord-qty").value.trim(),
  };
  await fbUpdateOrLocal("orders", id, updated);
  closeModal("modal-edit-order");
  toast("✅ Commande modifiée");
}

/* ── Suppliers ──────────────────────────────────────── */

export function renderSuppliers() {
  const el = $("sup-list");
  if (!el) return;
  if (!SHARED.suppliers.length) {
    el.innerHTML = `<div class="empty-state"><p>Aucune fiche fournisseur.</p></div>`;
    return;
  }
  el.innerHTML = SHARED.suppliers
    .map(
      (s) => `
    <div class="sup-card">
      <div class="sup-card-name">${esc(s.name)}
        <span class="sup-card-actions">
          <button class="icon-btn icon-edit" data-action="edit-sup" data-id="${esc(s.id)}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          <button class="icon-btn danger" data-action="del-sup" data-id="${esc(s.id)}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg></button>
        </span>
      </div>
      <div class="sup-grid">
        <div class="sup-block"><div class="sup-block-lbl">📞 Contact</div><div class="sup-block-val">${esc(s.contact || "—")}</div></div>
        <div class="sup-block"><div class="sup-block-lbl">📅 Livraison</div><div class="sup-block-val">${esc(s.day || "—")}</div></div>
        <div class="sup-block sup-block-full"><div class="sup-block-lbl">🚚 Franco de port</div><div class="sup-block-val">${esc(s.franco || "—")}</div></div>
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
    franco: $("cs-franco").value.trim(),
    notes: $("cs-notes").value.trim(),
  });
  LOCAL.rpg.supAdded = (LOCAL.rpg.supAdded || 0) + 1;
  gainXP("supplier_add");
  saveLocal();
  ["cs-name", "cs-contact", "cs-day", "cs-franco", "cs-notes"].forEach((i) => ($(i).value = ""));
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
render.orders = renderKanban;
render.suppliers = renderSuppliers;

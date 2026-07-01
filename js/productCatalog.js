import { $, esc, fmtD } from "./utils.js";
import { SHARED, app } from "./state.js";
import { fbPush, fbSet } from "./firebase.js";
import { dlcStatus } from "./dlc.js";

const SUPPLIER_FIELD_MAP = {
  "dlc-prod": "dlc-sup",
  "rv-prod": null,
  "vrac-name": "vrac-sup",
};

export function saveProductToCatalog(name, supplier, barcode) {
  if (!name || !app.firebaseMode) return;
  const existing = SHARED.products.find(
    (p) => p.name.toLowerCase() === name.toLowerCase()
  );
  if (existing) {
    const patch = {};
    if (supplier && !existing.supplier) patch.supplier = supplier;
    if (barcode && !existing.barcode) patch.barcode = barcode;
    if (Object.keys(patch).length) {
      fbSet(`products/${existing.id}`, { ...existing, ...patch });
    }
    return;
  }
  fbPush("products", { name, supplier: supplier || "", barcode: barcode || "" });
}

// Retrouve le nom d'un produit déjà connu à partir de son code-barres.
export function findProductByBarcode(barcode) {
  if (!barcode) return "";
  const p = SHARED.products.find((x) => x.barcode && x.barcode === barcode);
  return p ? p.name : "";
}

export function showProductSuggestions(inputId, dropId, context) {
  const q = $(inputId).value.trim().toLowerCase();
  const drop = $(dropId);
  if (!q || q.length < 2) {
    drop.style.display = "none";
    return;
  }

  const catalog = {};
  const ensure = (key, base) => {
    if (!catalog[key]) {
      catalog[key] = { name: base.name, supplier: base.supplier || "", dlcDates: [] };
    }
    return catalog[key];
  };

  SHARED.products.forEach((p) => {
    const key = p.name.toLowerCase();
    if (!key.includes(q)) return;
    const entry = ensure(key, p);
    if (p.supplier && !entry.supplier) entry.supplier = p.supplier;
  });
  SHARED.dlc.forEach((d) => {
    const key = (d.name || "").toLowerCase();
    if (!key.includes(q)) return;
    const entry = ensure(key, d);
    if (d.supplier && !entry.supplier) entry.supplier = d.supplier;
    entry.dlcDates.push({ date: d.date, status: dlcStatus(d.date) });
  });
  SHARED.reserve.forEach((r) => {
    const key = (r.name || "").toLowerCase();
    if (!key.includes(q)) return;
    ensure(key, { name: r.name, supplier: "" });
  });

  const entries = Object.values(catalog);
  if (!entries.length) {
    drop.style.display = "none";
    return;
  }

  let html = `<div class="dlc-sug-warn">📋 Produits existants :</div>`;
  entries.forEach((p) => {
    let extra = "";
    if (context === "dlc" && p.dlcDates.length) {
      extra = " — " + p.dlcDates
        .map((d) => `<span class="dlc-sug-date">${fmtD(d.date)} (${d.status.label})</span>`)
        .join(", ");
    }
    html += `<div class="dlc-sug-item" data-name="${esc(p.name)}" data-supplier="${esc(p.supplier)}" style="cursor:pointer">
      <span class="dlc-sug-name">${esc(p.name)}</span>${p.supplier ? ` · <span style="color:var(--ink3)">🏭 ${esc(p.supplier)}</span>` : ""}${extra}
    </div>`;
  });
  drop.innerHTML = html;
  drop.style.display = "block";

  drop.onclick = (e) => {
    const item = e.target.closest(".dlc-sug-item");
    if (!item) return;
    $(inputId).value = item.dataset.name;
    const supField = SUPPLIER_FIELD_MAP[inputId];
    if (supField && item.dataset.supplier) $(supField).value = item.dataset.supplier;
    drop.style.display = "none";
  };
}

export function bindProductSuggestions(inputId, dropId, context) {
  const el = $(inputId);
  if (!el) return;
  el.addEventListener("input", () => showProductSuggestions(inputId, dropId, context));
  el.addEventListener("focus", () => showProductSuggestions(inputId, dropId, context));
  el.addEventListener("blur", () => {
    setTimeout(() => {
      const d = $(dropId);
      if (d) d.style.display = "none";
    }, 250);
  });
}

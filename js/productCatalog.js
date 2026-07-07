import { $, esc, fmtD } from "./utils.js";
import { SHARED, app } from "./state.js";
import { fbPush, fbSet } from "./firebase.js";
import { dlcStatus } from "./dlc.js";

const SUPPLIER_FIELD_MAP = {
  "dlc-prod": "dlc-sup",
  "rv-prod": null,
  "vrac-name": "vrac-sup",
};

// Champs code-barres à remplir automatiquement quand on choisit un produit.
const BARCODE_FIELD_MAP = {
  "si-name": "si-barcode",
};

export function saveProductToCatalog(name, supplier, barcode, extra = {}) {
  if (!name || !app.firebaseMode) return;
  const existing = SHARED.products.find(
    (p) => p.name.toLowerCase() === name.toLowerCase()
  );
  if (existing) {
    // On complète seulement les champs manquants (ne pas écraser une saisie manuelle).
    const patch = {};
    if (supplier && !existing.supplier) patch.supplier = supplier;
    if (barcode && !existing.barcode) patch.barcode = barcode;
    if (extra.emplacementStock && !existing.emplacementStock) patch.emplacementStock = extra.emplacementStock;
    if (extra.emplacementRayon && !existing.emplacementRayon) patch.emplacementRayon = extra.emplacementRayon;
    if (Object.keys(patch).length) {
      fbSet(`products/${existing.id}`, { ...existing, ...patch });
    }
    return;
  }
  fbPush("products", {
    name,
    supplier: supplier || "",
    barcode: barcode || "",
    emplacementStock: extra.emplacementStock || "",
    emplacementRayon: extra.emplacementRayon || "",
  });
}

// Retrouve le nom d'un produit déjà connu à partir de son code-barres.
export function findProductByBarcode(barcode) {
  if (!barcode) return "";
  const p = SHARED.products.find((x) => x.barcode && x.barcode === barcode);
  return p ? p.name : "";
}

// Normalise un nom pour comparer (accents/casse/ponctuation/espaces ignorés).
export function normName(s) {
  return (s || "")
    .toString()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Retrouve un produit par code-barres (exact) puis par nom normalisé.
export function findProduct(name, barcode) {
  const bc = (barcode || "").trim();
  if (bc) {
    const byBc = SHARED.products.find((p) => (p.barcode || "").trim() === bc);
    if (byBc) return byBc;
  }
  const nk = normName(name);
  return SHARED.products.find((p) => normName(p.name) === nk) || null;
}

// Crée/met à jour un produit avec sa DLC (garde la date la plus proche).
export function upsertProductDlc(name, supplier, barcode, date, qty, emplacement) {
  if (!name || !app.firebaseMode) return;
  const p = findProduct(name, barcode);
  if (p) {
    const patch = {};
    if (supplier && !p.supplier) patch.supplier = supplier;
    if (barcode && !p.barcode) patch.barcode = barcode;
    if (emplacement && !p.emplacementStock) patch.emplacementStock = emplacement;
    if (date && (!p.dlc || date < p.dlc)) patch.dlc = date;
    if (qty) patch.dlcQty = qty;
    if (Object.keys(patch).length) fbSet(`products/${p.id}`, { ...p, ...patch });
  } else {
    fbPush("products", {
      name,
      supplier: supplier || "",
      barcode: barcode || "",
      emplacementStock: emplacement || "",
      emplacementRayon: "",
      dlc: date || "",
      dlcQty: qty || "",
    });
  }
}

// Efface la DLC d'un produit (produit "traité").
export function clearProductDlc(id) {
  const p = SHARED.products.find((x) => x.id === id);
  if (!p) return;
  fbSet(`products/${id}`, { ...p, dlc: "", dlcQty: "" });
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
      catalog[key] = { name: base.name, supplier: base.supplier || "", barcode: base.barcode || "", dlcDates: [] };
    }
    return catalog[key];
  };

  SHARED.products.forEach((p) => {
    const key = p.name.toLowerCase();
    if (!key.includes(q)) return;
    const entry = ensure(key, p);
    if (p.supplier && !entry.supplier) entry.supplier = p.supplier;
    if (p.barcode && !entry.barcode) entry.barcode = p.barcode;
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
    html += `<div class="dlc-sug-item" data-name="${esc(p.name)}" data-supplier="${esc(p.supplier)}" data-barcode="${esc(p.barcode || "")}" style="cursor:pointer">
      <span class="dlc-sug-name">${esc(p.name)}</span>${p.supplier ? ` · <span style="color:var(--ink3)">🏭 ${esc(p.supplier)}</span>` : ""}${p.barcode ? ` · <span style="color:var(--ink3)">🔖 ${esc(p.barcode)}</span>` : ""}${extra}
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
    const bcField = BARCODE_FIELD_MAP[inputId];
    if (bcField && item.dataset.barcode && $(bcField)) $(bcField).value = item.dataset.barcode;
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

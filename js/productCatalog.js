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

// DLC d'un produit sous forme de tableau [{date, qty}] (compat champ unique).
export function productDlcs(p) {
  if (Array.isArray(p.dlcs)) return p.dlcs.filter((d) => d && d.date);
  if (p.dlc) return [{ date: p.dlc, qty: p.dlcQty || "" }];
  return [];
}

// Écrit les DLC (tableau) et nettoie l'ancien champ unique.
function writeProductDlcs(p, dlcs, extraPatch = {}) {
  dlcs = dlcs
    .filter((d) => d && d.date)
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const clean = { ...p, ...extraPatch, dlcs };
  delete clean.dlc;
  delete clean.dlcQty;
  fbSet(`products/${p.id}`, clean);
}

// Crée/met à jour un produit en AJOUTANT une DLC (plusieurs possibles).
export function upsertProductDlc(name, supplier, barcode, date, qty, emplacement) {
  if (!name || !app.firebaseMode) return;
  const p = findProduct(name, barcode);
  if (p) {
    const dlcs = productDlcs(p);
    if (!dlcs.some((d) => d.date === date)) dlcs.push({ date, qty: qty || "" });
    const extra = {};
    if (supplier && !p.supplier) extra.supplier = supplier;
    if (barcode && !p.barcode) extra.barcode = barcode;
    if (emplacement && !p.emplacementStock) extra.emplacementStock = emplacement;
    writeProductDlcs(p, dlcs, extra);
  } else {
    fbPush("products", {
      name,
      supplier: supplier || "",
      barcode: barcode || "",
      emplacementStock: emplacement || "",
      emplacementRayon: "",
      category: "",
      dlcs: [{ date, qty: qty || "" }],
    });
  }
}

// Enlève UNE DLC (date précise) d'un produit — produit "traité" pour ce lot.
export function removeProductDlc(id, date) {
  const p = SHARED.products.find((x) => x.id === id);
  if (!p) return;
  writeProductDlcs(p, productDlcs(p).filter((d) => d.date !== date));
}

// Remplace toutes les DLC d'un produit (utilisé par la fiche produit).
export function setProductDlcs(id, dlcs) {
  const p = SHARED.products.find((x) => x.id === id);
  if (!p) return;
  writeProductDlcs(p, dlcs);
}

// Import d'un produit depuis Excel : crée ou met à jour (par code-barres/nom)
// SANS toucher à l'emplacement stock ni aux DLC (données propres à l'app).
export function importProduct(row) {
  if (!row.name || !app.firebaseMode) return "skip";
  const p = findProduct(row.name, row.barcode);
  if (p) {
    const patch = {};
    if (row.name && row.name !== p.name) patch.name = row.name;
    if (row.barcode && (row.barcode || "").trim() && !(p.barcode || "").trim()) patch.barcode = row.barcode.trim();
    if (row.supplier) patch.supplier = row.supplier;
    if (row.category) patch.category = row.category;
    if (Object.keys(patch).length) fbSet(`products/${p.id}`, { ...p, ...patch });
    return "update";
  }
  fbPush("products", {
    name: row.name,
    barcode: (row.barcode || "").trim(),
    supplier: row.supplier || "",
    category: row.category || "",
    emplacementStock: "",
    emplacementRayon: "",
    dlcs: [],
  });
  return "create";
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

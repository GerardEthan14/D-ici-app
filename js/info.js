import { $, esc, fmtD, toast } from "./utils.js";
import { SHARED } from "./state.js";
import { dlcStatus } from "./dlc.js";
import { openProductSheet } from "./profil.js";
import { openEditSupplier } from "./fournisseurs.js";
import { render } from "./bus.js";

/* ── Sous-onglets ───────────────────────────────────── */

let infoView = "produit";
const expanded = new Set();

export function switchInfoView(v) {
  infoView = v;
  $("info-produit-view")?.classList.toggle("hidden", v !== "produit");
  $("info-fournisseur-view")?.classList.toggle("hidden", v !== "fournisseur");
  $("itab-produit")?.classList.toggle("active", v === "produit");
  $("itab-fournisseur")?.classList.toggle("active", v === "fournisseur");
  if (v === "produit") renderInfoProducts();
  else render.suppliers?.();
}

/* ── Vue Produit ────────────────────────────────────── */

// Liste unifiée : produits du catalogue + produits ayant une DLC
// (pour que les DLC apparaissent même si le produit n'est pas au catalogue).
function getInfoProducts() {
  const map = new Map();
  const ensure = (name) => {
    const k = (name || "").trim().toLowerCase();
    if (!k) return null;
    if (!map.has(k)) {
      map.set(k, { name, supplier: "", barcode: "", emplacementStock: "", emplacementRayon: "", id: null });
    }
    return map.get(k);
  };
  SHARED.products.forEach((p) => {
    const e = ensure(p.name);
    if (!e) return;
    e.id = p.id;
    if (p.supplier && !e.supplier) e.supplier = p.supplier;
    if (p.barcode && !e.barcode) e.barcode = p.barcode;
    if (p.emplacementStock && !e.emplacementStock) e.emplacementStock = p.emplacementStock;
    if (p.emplacementRayon && !e.emplacementRayon) e.emplacementRayon = p.emplacementRayon;
  });
  SHARED.dlc.forEach((d) => {
    const e = ensure(d.name);
    if (!e) return;
    if (d.supplier && !e.supplier) e.supplier = d.supplier;
  });
  return [...map.values()];
}

function dlcsForProduct(p) {
  const key = (p.name || "").toLowerCase();
  return SHARED.dlc
    .filter((d) => (d.name || "").toLowerCase() === key)
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
}

function dlcChip(d) {
  const s = dlcStatus(d.date);
  return `<span class="dlc-chip ${s.cls}">${fmtD(d.date)} · ${s.label}</span>`;
}

function infoProductCard(p) {
  const dlcs = dlcsForProduct(p);
  const pkey = (p.name || "").toLowerCase();
  const isOpen = expanded.has(pkey);

  let dlcHtml;
  if (!dlcs.length) {
    dlcHtml = `<span class="info-nodlc">Pas de DLC</span>`;
  } else {
    dlcHtml = dlcChip(dlcs[0]);
    if (dlcs.length > 1) {
      dlcHtml += `<button class="info-dlc-more" data-action="toggle-dlc" data-key="${esc(pkey)}">${isOpen ? "▼" : "▶"} ${dlcs.length}</button>`;
    }
  }

  const extraDlc =
    isOpen && dlcs.length > 1
      ? `<div class="info-dlc-list">${dlcs.slice(1).map((d) => `<div class="info-dlc-row">${dlcChip(d)}${d.qty ? `<span class="info-dlc-qty">~${esc(d.qty)}</span>` : ""}</div>`).join("")}</div>`
      : "";

  return `<div class="info-card">
    <div class="info-card-top">
      <div class="info-card-main" data-action="open-prod" data-id="${p.id ? esc(p.id) : ""}">
        <div class="info-card-name">${esc(p.name)}</div>
        <div class="info-card-meta">
          ${p.supplier ? `<button type="button" class="info-chip info-sup-link" data-action="open-sup" data-sup="${esc(p.supplier)}">🏭 ${esc(p.supplier)}</button>` : ""}
          ${p.emplacementStock ? `<span class="info-chip">🏠 ${esc(p.emplacementStock)}</span>` : ""}
          ${p.emplacementRayon ? `<span class="info-chip">🗂️ ${esc(p.emplacementRayon)}</span>` : ""}
          ${p.barcode ? `<span class="info-chip">🔖 ${esc(p.barcode)}</span>` : ""}
        </div>
      </div>
      <div class="info-card-dlc">${dlcHtml}</div>
    </div>
    ${extraDlc}
  </div>`;
}

export function renderInfoProducts() {
  const el = $("info-prod-list");
  if (!el) return;
  const q = ($("info-prod-search")?.value || "").trim().toLowerCase();
  let list = getInfoProducts();
  if (q)
    list = list.filter(
      (p) =>
        (p.name || "").toLowerCase().includes(q) ||
        (p.supplier || "").toLowerCase().includes(q) ||
        (p.barcode || "").includes(q) ||
        (p.emplacementStock || "").toLowerCase().includes(q) ||
        (p.emplacementRayon || "").toLowerCase().includes(q)
    );
  list = [...list].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  if (!list.length) {
    el.innerHTML = `<div class="empty-state"><p>${q ? "Aucun produit trouvé." : "Aucun produit enregistré."}</p></div>`;
    return;
  }
  el.innerHTML = list.map(infoProductCard).join("");
}

function openSupplierByName(name) {
  const s = SHARED.suppliers.find((x) => (x.name || "").toLowerCase() === (name || "").toLowerCase());
  if (s) openEditSupplier(s.id);
  else toast("Ce fournisseur n'a pas encore de fiche");
}

/* ── Bindings ───────────────────────────────────────── */

export function bindInfoEvents() {
  $("info-prod-search")?.addEventListener("input", renderInfoProducts);
  $("info-prod-list")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const a = btn.dataset.action;
    if (a === "open-prod") {
      if (btn.dataset.id) openProductSheet(btn.dataset.id);
      else toast("Ce produit n'a pas encore de fiche (seulement une DLC)");
    }
    else if (a === "open-sup") openSupplierByName(btn.dataset.sup);
    else if (a === "toggle-dlc") {
      const k = btn.dataset.key;
      if (expanded.has(k)) expanded.delete(k);
      else expanded.add(k);
      renderInfoProducts();
    }
  });
}

/* Register renders for bus */
render.infoProducts = renderInfoProducts;
render.info = () => switchInfoView(infoView);

import { $, esc, toast } from "./utils.js";
import { SHARED } from "./state.js";
import { CATEGORIES } from "./config.js";
import { importProduct, normName, productDlcs } from "./productCatalog.js";
import { fbSet, fbRemove } from "./firebase.js";
import { openModal } from "./modals.js";
import { render } from "./bus.js";

const XLSX_URL = "https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs";

let rows = [];
let headers = [];

// Devine la catégorie (parmi les 8) à partir du libellé de famille.
const CAT_GUESS = [
  [/bi[eè]re|pils|\bipa\b|triple|blonde|brune|abbaye/i, "Bière"],
  [/\bvin\b|rouge|blanc|ros[ée]|champagne|cr[ée]mant|mousseux/i, "Vin"],
  [/vrac/i, "Vrac"],
  [/non.?alcool|boisson.?non|soft|\bjus\b|\beau\b|soda|limonade|sirop|nectar/i, "Boisson non-alcoolisée"],
  [/boisson.?alcool|alcool.?autre|spiritueux|whisky|rhum|vodka|\bgin\b|ap[ée]ritif|liqueur|digestif|p[ée]ket|alcool/i, "Boisson alcoolisée"],
  [/sucr|biscuit|chocolat|confiserie|bonbon|c[ée]r[ée]ale|p[aâ]tisserie|goûter/i, "Épicerie sucrée"],
  [/sal|chips|conserve|sauce|p[aâ]tes|\briz\b|ap[ée]ro|snack|\bsel\b/i, "Épicerie salée"],
  [/dph|non.?aliment|non.?food|droguerie|hygi|entretien|parfum|papeterie|m[ée]nage|animal/i, "DPH & Non alimentaire"],
];

function guessCat(famille) {
  for (const [re, cat] of CAT_GUESS) if (re.test(famille)) return cat;
  return "";
}

function guessCol(re) {
  return headers.find((h) => re.test(h)) || "";
}

export function openImport() {
  rows = [];
  headers = [];
  const f = $("imp-file");
  if (f) f.value = "";
  $("imp-config")?.classList.add("hidden");
  const res = $("imp-result");
  if (res) res.innerHTML = "";
  openModal("modal-import");
}

async function onImportFile(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const res = $("imp-result");
  if (res) res.innerHTML = `<div class="imp-status">⏳ Lecture du fichier…</div>`;
  try {
    const XLSX = await import(XLSX_URL);
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
    headers = rows.length ? Object.keys(rows[0]) : [];
  } catch (err) {
    if (res) res.innerHTML = `<div class="imp-status err">⚠️ Lecture impossible : ${esc(String(err && err.message ? err.message : err))}</div>`;
    return;
  }
  if (!rows.length) {
    if (res) res.innerHTML = `<div class="imp-status err">Fichier vide ou illisible.</div>`;
    return;
  }
  if (res) res.innerHTML = "";
  fillColSelects();
  renderCatMap();
  $("imp-config")?.classList.remove("hidden");
}

function colOptions(sel, guessRe, required) {
  if (!sel) return;
  const guess = guessCol(guessRe);
  sel.innerHTML =
    (required ? "" : `<option value="">— aucune —</option>`) +
    headers.map((h) => `<option value="${esc(h)}"${h === guess ? " selected" : ""}>${esc(h)}</option>`).join("");
}

function fillColSelects() {
  colOptions($("imp-col-name"), /libell|d[ée]signation|nom.?du.?produit|^produit/i, true);
  colOptions($("imp-col-barcode"), /gtin|code.?barre|\bean\b|gencod|barcode/i, false);
  colOptions($("imp-col-sup"), /fournisseur/i, false);
  colOptions($("imp-col-cat"), /cat[ée]gorie|famille/i, false);
}

function distinctFamilies() {
  const col = $("imp-col-cat")?.value;
  if (!col) return [];
  return [...new Set(rows.map((r) => String(r[col] ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function renderCatMap() {
  const el = $("imp-cat-map");
  if (!el) return;
  const fams = distinctFamilies();
  if (!fams.length) {
    el.innerHTML = "";
    updatePreview();
    return;
  }
  el.innerHTML =
    `<div class="imp-map-title">Correspondance famille → catégorie</div>` +
    fams
      .map((f) => {
        const g = guessCat(f);
        return `<div class="imp-map-row"><span class="imp-map-fam">${esc(f)}</span>
          <select class="imp-map-sel input-field" data-fam="${esc(f)}">
            <option value="">— ignorer —</option>
            ${CATEGORIES.map((c) => `<option value="${esc(c)}"${c === g ? " selected" : ""}>${esc(c)}</option>`).join("")}
          </select></div>`;
      })
      .join("");
  updatePreview();
}

function updatePreview() {
  const el = $("imp-preview");
  if (el) el.textContent = `${rows.length} ligne(s) prête(s) à importer.`;
}

async function runImport() {
  const colName = $("imp-col-name")?.value;
  const colBc = $("imp-col-barcode")?.value;
  const colSup = $("imp-col-sup")?.value;
  const colCat = $("imp-col-cat")?.value;
  if (!colName) {
    toast("⚠️ Choisis la colonne Nom");
    return;
  }
  const catMap = {};
  document.querySelectorAll(".imp-map-sel").forEach((s) => (catMap[s.dataset.fam] = s.value));

  let create = 0, update = 0, skip = 0;
  rows.forEach((r) => {
    const name = String(r[colName] ?? "").trim();
    if (!name) {
      skip++;
      return;
    }
    const fam = colCat ? String(r[colCat] ?? "").trim() : "";
    const res = importProduct({
      name,
      barcode: colBc ? String(r[colBc] ?? "").trim() : "",
      supplier: colSup ? String(r[colSup] ?? "").trim() : "",
      category: colCat ? catMap[fam] || "" : "",
    });
    if (res === "create") create++;
    else if (res === "update") update++;
    else skip++;
  });

  const res = $("imp-result");
  if (res) res.innerHTML = `<div class="imp-status ok">✅ ${create} créé(s) · ${update} mis à jour${skip ? ` · ${skip} ignoré(s)` : ""}</div>`;
  render.infoProducts?.();
  toast(`✅ Import : ${create} créés, ${update} MAJ`, true);
}

/* ── Déduplication des produits ─────────────────────── */

const FIELDS = ["name", "barcode", "supplier", "category", "emplacementStock", "emplacementRayon"];

function infoScore(p) {
  return FIELDS.filter((k) => String(p[k] ?? "").trim()).length + productDlcs(p).length;
}

// Regroupe les doublons (même code-barres, sinon même nom normalisé),
// fusionne toutes les infos dans la fiche la plus complète, supprime les autres.
async function dedupeProducts() {
  const groups = new Map();
  SHARED.products.forEach((p) => {
    const bc = (p.barcode || "").trim();
    const key = bc ? "bc:" + bc : "nm:" + normName(p.name);
    if (key === "bc:" && !bc) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  });

  let removed = 0;
  let mergedGroups = 0;
  for (const arr of groups.values()) {
    if (arr.length < 2) continue;
    arr.sort((a, b) => infoScore(b) - infoScore(a));
    const keep = arr[0];
    const merged = { ...keep };
    // Complète les champs manquants depuis les autres doublons.
    FIELDS.forEach((k) => {
      if (!String(merged[k] ?? "").trim()) {
        const src = arr.find((p) => String(p[k] ?? "").trim());
        if (src) merged[k] = src[k];
      }
    });
    // Union des DLC.
    const dlcMap = new Map();
    arr.forEach((p) => productDlcs(p).forEach((d) => { if (d.date && !dlcMap.has(d.date)) dlcMap.set(d.date, d); }));
    merged.dlcs = [...dlcMap.values()].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    delete merged.dlc;
    delete merged.dlcQty;
    await fbSet(`products/${keep.id}`, merged);
    for (const p of arr.slice(1)) {
      await fbRemove(`products/${p.id}`);
      removed++;
    }
    mergedGroups++;
  }
  return { removed, mergedGroups };
}

async function runDedupe() {
  const btn = $("btn-dedupe");
  // Compte d'abord les doublons pour informer.
  const seen = new Map();
  let dupCount = 0;
  SHARED.products.forEach((p) => {
    const bc = (p.barcode || "").trim();
    const key = bc ? "bc:" + bc : "nm:" + normName(p.name);
    seen.set(key, (seen.get(key) || 0) + 1);
  });
  seen.forEach((n) => { if (n > 1) dupCount += n - 1; });
  if (!dupCount) {
    toast("✅ Aucun doublon trouvé");
    return;
  }
  if (!confirm(`Fusionner et supprimer ${dupCount} doublon(s) ? Les infos (emplacement, DLC…) sont conservées dans la fiche gardée.`)) return;
  if (btn) btn.disabled = true;
  try {
    const { removed, mergedGroups } = await dedupeProducts();
    toast(`🧹 ${removed} doublon(s) supprimé(s) sur ${mergedGroups} produit(s)`, true);
    render.infoProducts?.();
  } catch (e) {
    toast("⚠️ Erreur pendant la déduplication");
  } finally {
    if (btn) btn.disabled = false;
  }
}

export function bindImportEvents() {
  $("imp-file")?.addEventListener("change", onImportFile);
  $("imp-col-cat")?.addEventListener("change", renderCatMap);
  $("btn-import-open")?.addEventListener("click", openImport);
  $("imp-run")?.addEventListener("click", runImport);
  $("btn-dedupe")?.addEventListener("click", runDedupe);
}

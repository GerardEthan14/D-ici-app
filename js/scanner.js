import { $, toast } from "./utils.js";
import { openModal, closeModal } from "./modals.js";
import { findProductByBarcode, saveProductToCatalog } from "./productCatalog.js";

/* ──────────────────────────────────────────────────────
   Scanner de code-barres (caméra) + recherche OpenFoodFacts.
   Stratégie : API native BarcodeDetector si disponible
   (Android/Chrome), sinon repli sur ZXing chargé à la volée.
   ────────────────────────────────────────────────────── */

let stream = null;
let detector = null;
let rafId = null;
let zxingControls = null;
let onResultCb = null;
let active = false;

function setStatus(t) {
  const el = $("scanner-status");
  if (el) el.textContent = t;
}

export async function startScanner(onResult) {
  onResultCb = onResult;
  openModal("modal-scanner");
  setStatus("Initialisation de la caméra…");
  try {
    await beginCamera();
  } catch (e) {
    setStatus("⚠️ Caméra inaccessible. Autorise l'accès à la caméra puis réessaie.");
  }
}

async function beginCamera() {
  const video = $("scanner-video");
  if (!video) return;

  // 1) API native BarcodeDetector
  if ("BarcodeDetector" in window) {
    let formats = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];
    try {
      const supported = await window.BarcodeDetector.getSupportedFormats();
      if (supported && supported.length) formats = formats.filter((f) => supported.includes(f));
    } catch {}
    detector = new window.BarcodeDetector({ formats });
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = stream;
    await video.play();
    active = true;
    setStatus("Vise le code-barres…");
    scanLoop(video);
    return;
  }

  // 2) Repli ZXing (iOS Safari, etc.)
  setStatus("Chargement du scanner…");
  const mod = await import("https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm");
  const reader = new mod.BrowserMultiFormatReader();
  active = true;
  setStatus("Vise le code-barres…");
  zxingControls = await reader.decodeFromVideoDevice(undefined, video, (result) => {
    if (result && active) handleResult(result.getText());
  });
}

async function scanLoop(video) {
  if (!active) return;
  try {
    const codes = await detector.detect(video);
    if (codes && codes.length && codes[0].rawValue) {
      handleResult(codes[0].rawValue);
      return;
    }
  } catch {}
  rafId = requestAnimationFrame(() => scanLoop(video));
}

function handleResult(code) {
  if (!active) return;
  active = false;
  stopScanner();
  closeModal("modal-scanner");
  const cb = onResultCb;
  onResultCb = null;
  cb?.(String(code).trim());
}

export function stopScanner() {
  active = false;
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  if (zxingControls) {
    try {
      zxingControls.stop();
    } catch {}
    zxingControls = null;
  }
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  const v = $("scanner-video");
  if (v) v.srcObject = null;
}

export function cancelScanner() {
  stopScanner();
  onResultCb = null;
  closeModal("modal-scanner");
}

/* ── Recherche du nom produit via OpenFoodFacts ─────── */

export async function lookupProductName(barcode) {
  try {
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(
      barcode
    )}.json?fields=product_name,product_name_fr,brands`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === 1 && data.product) {
      const p = data.product;
      const name = (p.product_name_fr || p.product_name || "").trim();
      const brand = (p.brands || "").split(",")[0].trim();
      if (name && brand && !name.toLowerCase().includes(brand.toLowerCase())) {
        return `${name} ${brand}`;
      }
      return name;
    }
  } catch {}
  return "";
}

/* ── Câblage des boutons « Scanner » ────────────────── */

// Chaque bouton .scan-btn porte data-target-name (champ nom à remplir)
// et, en option, data-target-barcode (champ code-barres à remplir).
export function bindScanButtons() {
  document.querySelectorAll(".scan-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      startScanner(async (code) => {
        const bcEl = btn.dataset.targetBarcode ? $(btn.dataset.targetBarcode) : null;
        if (bcEl) bcEl.value = code;
        const nameEl = btn.dataset.targetName ? $(btn.dataset.targetName) : null;

        // 1) Déjà connu dans le catalogue (scanner intelligent) ?
        const known = findProductByBarcode(code);
        if (known) {
          if (nameEl) nameEl.value = known;
          toast(`✅ ${known}`, true);
          return;
        }

        // 2) Recherche OpenFoodFacts
        toast("🔎 Recherche du produit…");
        const name = await lookupProductName(code);
        if (name) {
          if (nameEl) nameEl.value = name;
          saveProductToCatalog(name, "", code); // mémorise pour la prochaine fois
          toast(`✅ ${name}`, true);
        } else {
          toast(`Produit inconnu (code ${code})`);
          if (nameEl && !nameEl.value) nameEl.focus();
        }
      });
    });
  });

  // Arrêt propre de la caméra si on ferme par le fond ou le bouton annuler
  $("btn-scanner-cancel")?.addEventListener("click", cancelScanner);
  $("modal-scanner")?.addEventListener("click", (e) => {
    if (e.target.id === "modal-scanner") cancelScanner();
  });
}

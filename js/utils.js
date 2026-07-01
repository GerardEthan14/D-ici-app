export const $ = (id) => document.getElementById(id);

export const uid = () => Math.random().toString(36).slice(2, 9);

export const today = () => new Date().toISOString().slice(0, 10);

export function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function fmtD(d) {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

let toastTimer = null;
export function toast(msg, isXP = false) {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.className = "toast" + (isXP ? " xp" : "");
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2500);
}

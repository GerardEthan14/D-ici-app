import { LEVELS, XP_MAP, BADGES, BADGE_CATEGORIES } from "./config.js";
import { LOCAL, app, saveLocal } from "./state.js";
import { $, esc, today, toast } from "./utils.js";
import { fbSet, sp } from "./firebase.js";
import { render } from "./bus.js";

/* ── LEVELS ───────────────────────────────────────── */

export function getLevel(xp) {
  let cur = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.xp) cur = l;
  return cur;
}

export function getNext(xp) {
  const cur = getLevel(xp);
  const i = LEVELS.findIndex((l) => l.lvl === cur.lvl);
  return LEVELS[i + 1] || null;
}

/* ── STREAK ───────────────────────────────────────── */

export function checkStreak() {
  const t = today();
  if (!LOCAL.rpg.lastDate) {
    LOCAL.rpg.lastDate = t;
    saveLocal();
    return;
  }
  if (LOCAL.rpg.lastDate === t) return;

  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  const yestStr = yest.toISOString().slice(0, 10);

  if (LOCAL.rpg.lastDate === yestStr) {
    LOCAL.rpg.streak = (LOCAL.rpg.streak || 0) + 1;
    LOCAL.rpg.xp += XP_MAP.streak_bonus;
    updateRPG();
    toast(`🔥 Streak x${LOCAL.rpg.streak} ! +${XP_MAP.streak_bonus} XP`, true);
  } else {
    LOCAL.rpg.streak = 1;
  }
  LOCAL.rpg.lastDate = t;
  saveLocal();
}

/* ── XP ───────────────────────────────────────────── */

export function gainXP(key, show = true) {
  const amt = XP_MAP[key] || 0;
  if (!amt) return;
  const prev = getLevel(LOCAL.rpg.xp).lvl;
  LOCAL.rpg.xp += amt;
  LOCAL.rpg.level = getLevel(LOCAL.rpg.xp).lvl;
  saveLocal();
  updateRPG();
  if (show) toast(`+${amt} XP ⚡`, true);
  if (LOCAL.rpg.level > prev) {
    setTimeout(() => showLevelUp(getLevel(LOCAL.rpg.xp)), 500);
  }
  checkBadges();
  publishScore();
}

export function publishScore() {
  if (!app.firebaseMode || !app.username) return;
  const cur = getLevel(LOCAL.rpg.xp);
  fbSet(sp(`scores/${app.username}`), {
    xp: LOCAL.rpg.xp,
    level: LOCAL.rpg.level,
    title: cur.title,
    avatar: cur.avatar,
    name: app.username,
    uid: app.uid,
    updatedAt: Date.now(),
  });
}

export function updateRPG() {
  const cur = getLevel(LOCAL.rpg.xp);
  const nxt = getNext(LOCAL.rpg.xp);
  const inLvl = LOCAL.rpg.xp - cur.xp;
  const forNxt = nxt ? nxt.xp - cur.xp : 1;
  const pct = nxt ? Math.min(100, Math.round((inLvl / forNxt) * 100)) : 100;

  const setText = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  setText("hdr-level", `Niv. ${cur.lvl}`);
  setText("hdr-title", cur.title);
  setText("hdr-streak", `🔥 ${LOCAL.rpg.streak}`);
  const bar = $("xp-bar");
  if (bar) bar.style.width = pct + "%";
  setText("xp-label", nxt ? `${inLvl} / ${forNxt} XP` : "MAX");
  setText("p-avatar", cur.avatar);
  setText("p-class", `✦ ${cur.title} ✦`);
  setText("p-level", cur.lvl);
  setText("p-xp", LOCAL.rpg.xp);
  setText("p-streak", LOCAL.rpg.streak);
}

export function showLevelUp(lvl) {
  const title = $("lu-title");
  const sub = $("lu-sub");
  if (title) title.textContent = `Niveau ${lvl.lvl} !`;
  if (sub) sub.innerHTML = `Tu es maintenant<br><strong>${esc(lvl.title)}</strong>`;
  $("lu-overlay")?.classList.add("show");
}

export function closeLevelUp() {
  $("lu-overlay")?.classList.remove("show");
}

/* ── BADGES ───────────────────────────────────────── */

export function checkBadges() {
  BADGES.forEach((b) => {
    if (LOCAL.rpg.badges.includes(b.id)) return;
    if (b.ok(LOCAL.rpg)) {
      LOCAL.rpg.badges.push(b.id);
      saveLocal();
      showBadgePopup(b);
      renderBadges();
    }
  });
}

let badgeTimer = null;
export function showBadgePopup(b) {
  const icon = $("bp-icon");
  const name = $("bp-name");
  const popup = $("badge-popup");
  if (!popup) return;
  icon.textContent = b.icon;
  name.textContent = b.name;
  popup.classList.add("show");
  clearTimeout(badgeTimer);
  badgeTimer = setTimeout(() => popup.classList.remove("show"), 3500);
}

/* Register publish-initial-score for bus (fired after Firebase subscribes) */
render.publishInitialScore = () => setTimeout(() => publishScore(), 1500);

export function renderBadges() {
  const el = $("badges-container");
  if (!el) return;
  el.innerHTML = BADGE_CATEGORIES.map((cat) => {
    const list = BADGES.filter((b) => b.cat === cat.key);
    if (!list.length) return "";
    const unlocked = list.filter((b) => LOCAL.rpg.badges.includes(b.id)).length;
    return `<div class="badge-category-title">${cat.label} <span style="font-size:0.62rem;color:var(--ink3);font-family:DM Sans,sans-serif;font-weight:500;text-transform:none;letter-spacing:0">${unlocked}/${list.length}</span></div>
      <div class="badges-grid-sm">${list
        .map((b) => {
          const ok = LOCAL.rpg.badges.includes(b.id);
          return `<div class="badge-card-sm ${ok ? "unlocked" : "locked"}"><div class="badge-icon">${b.icon}</div><div class="badge-name">${b.name}</div></div>`;
        })
        .join("")}</div>`;
  }).join("");
}

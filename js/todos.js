import { $, uid, esc, toast } from "./utils.js";
import { LOCAL, SHARED, app, saveLocal } from "./state.js";
import { XP_MAP } from "./config.js";
import { gainXP, checkBadges } from "./rpg.js";
import { fbPushOrLocal, fbRemoveOrLocal, fbUpdateOrLocal, fbRemove, sp } from "./firebase.js";
import { closeModal } from "./modals.js";
import { render } from "./bus.js";

/* ── PERSONAL TODOS (local only) ────────────────────── */

let todoFilter = "all";

export function filterTodo(f) {
  todoFilter = f;
  ["all", "high", "med", "low", "done"].forEach((id) =>
    $("tf-" + id).classList.toggle("active", id === f)
  );
  renderTodo();
}

export function renderTodo() {
  const el = $("todo-list");
  if (!el) return;

  let list = [...LOCAL.todos];
  if (todoFilter === "done") list = list.filter((t) => t.done);
  else if (todoFilter !== "all") list = list.filter((t) => !t.done && t.prio === todoFilter);
  else list = list.filter((t) => !t.done);

  const order = { high: 0, med: 1, low: 2 };
  list.sort((a, b) => (order[a.prio] || 1) - (order[b.prio] || 1));

  const total = LOCAL.todos.length;
  const done = LOCAL.todos.filter((t) => t.done).length;
  $("td-done").textContent = done;
  $("td-total").textContent = total;
  $("td-bar").style.width = total ? Math.round((done / total) * 100) + "%" : "0%";

  updateTeamNavBadge();

  if (!list.length) {
    el.innerHTML = `<div class="empty-state"><p>${todoFilter === "done" ? "Aucune mission complétée." : "🎉 Aucune mission en cours !"}</p></div>`;
    return;
  }

  const pLbl = { high: "🔴 Urgent", med: "🟠 Normal", low: "🟢 Bas" };
  const pCls = { high: "prio-high", med: "prio-med", low: "prio-low" };
  const xpMap = { high: 25, med: 15, low: 10 };

  el.innerHTML = list
    .map(
      (t) => `
    <div class="todo-item ${t.done ? "done" : ""}">
      <button class="todo-check ${t.done ? "checked" : ""}" data-action="toggle-todo" data-id="${esc(t.id)}">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </button>
      <div class="todo-content">
        <div class="todo-text">${esc(t.text)}</div>
        <div class="todo-meta">
          <span class="prio-chip ${pCls[t.prio]}">${pLbl[t.prio]}</span>
          ${t.cat ? `<span>📁 ${esc(t.cat)}</span>` : ""}
          ${!t.done ? `<span class="xp-chip">+${xpMap[t.prio]} XP</span>` : ""}
        </div>
      </div>
      <button class="icon-btn danger" data-action="delete-todo" data-id="${esc(t.id)}">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg>
      </button>
    </div>`
    )
    .join("");
}

export function bindTodoListEvents() {
  $("todo-list")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === "toggle-todo") {
      const t = LOCAL.todos.find((x) => x.id === id);
      if (!t) return;
      if (!t.done) {
        t.done = true;
        LOCAL.rpg.todoDone = (LOCAL.rpg.todoDone || 0) + 1;
        if (t.prio === "high") LOCAL.rpg.todoHighDone = (LOCAL.rpg.todoHighDone || 0) + 1;
        gainXP("todo_" + t.prio);
        toast(`✅ Mission accomplie ! +${XP_MAP["todo_" + t.prio]} XP`, true);
      } else {
        t.done = false;
      }
      saveLocal();
      renderTodo();
      checkBadges();
    } else if (btn.dataset.action === "delete-todo") {
      LOCAL.todos = LOCAL.todos.filter((x) => x.id !== id);
      saveLocal();
      renderTodo();
    }
  });
}

export function addTodo() {
  const text = $("td-text").value.trim();
  if (!text) {
    toast("⚠️ Texte requis");
    return;
  }
  LOCAL.todos.push({
    id: uid(),
    text,
    prio: $("td-prio").value,
    cat: $("td-cat").value.trim(),
    done: false,
  });
  saveLocal();
  renderTodo();
  $("td-text").value = "";
  $("td-cat").value = "";
  $("td-prio").value = "med";
  closeModal("modal-add-todo");
  toast("🎯 Mission ajoutée !");
}

/* ── TEAM TODOS (firebase) ──────────────────────────── */

let activeTodoTab = "personal";
export function switchTodoTab(tab) {
  activeTodoTab = tab;
  $("todo-personal-view").classList.toggle("hidden", tab !== "personal");
  $("todo-team-view").classList.toggle("hidden", tab !== "team");
  $("ttab-personal").classList.toggle("active", tab === "personal");
  $("ttab-team").classList.toggle("active", tab === "team");
  if (tab === "team") renderTeamTodos();
}

export async function addTeamTodo() {
  const text = $("ttd-text").value.trim();
  if (!text) {
    toast("⚠️ Texte requis");
    return;
  }
  await fbPushOrLocal("teamTodos", {
    text,
    prio: $("ttd-prio").value,
    note: $("ttd-note").value.trim(),
    status: "open",
  });
  LOCAL.rpg.teamCreated = (LOCAL.rpg.teamCreated || 0) + 1;
  saveLocal();
  checkBadges();
  $("ttd-text").value = "";
  $("ttd-note").value = "";
  $("ttd-prio").value = "med";
  closeModal("modal-add-team-todo");
  toast("👥 Mission publiée pour l'équipe !");
}

export function renderTeamTodos() {
  const el = $("team-todo-list");
  if (!el) return;
  const list = SHARED.teamTodos.filter((t) => t.status !== "done");
  if (!list.length) {
    el.innerHTML = `<div class="card"><div class="empty-state"><p>🎉 Aucune mission d'équipe en cours !</p></div></div>`;
    return;
  }

  const prioLbl = { high: "🔴 Urgent", med: "🟠 Normal", low: "🟢 Bas" };
  const prioCls = { high: "prio-high", med: "prio-med", low: "prio-low" };
  const order = { high: 0, med: 1, low: 2 };
  const sorted = [...list].sort((a, b) => (order[a.prio] || 1) - (order[b.prio] || 1));

  el.innerHTML = sorted
    .map((t) => {
      const mine = t._by === app.username;
      return `<div class="team-mission-card">
      <div class="team-mission-inner">
        <div class="team-mission-info">
          <div class="team-mission-text">${esc(t.text)}</div>
          <div class="team-mission-meta">
            <span class="prio-chip ${prioCls[t.prio] || "prio-med"}">${prioLbl[t.prio] || "Normal"}</span>
            ${t._by ? `<span>par ${esc(t._by)}</span>` : ""}
            ${mine ? `<span class="team-mine-badge">Ma mission</span>` : ""}
            ${t.note ? `<span>📝 ${esc(t.note)}</span>` : ""}
          </div>
        </div>
        <div style="display:flex;gap:5px;flex-shrink:0;align-items:center">
          <button class="team-validate-btn" data-action="validate-team" data-id="${esc(t.id)}" data-text="${esc(t.text)}" data-by="${esc(t._by || "")}">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Valider
          </button>
          ${mine ? `<button class="icon-btn danger" data-action="del-team" data-id="${esc(t.id)}">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M9 6V4h6v2"/></svg>
          </button>` : ""}
        </div>
      </div>
    </div>`;
    })
    .join("");
}

export function bindTeamTodoEvents() {
  $("team-todo-list")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    if (btn.dataset.action === "validate-team") {
      validateTeamTodo(btn.dataset.id, btn.dataset.text);
    } else if (btn.dataset.action === "del-team") {
      if (confirm("Supprimer cette mission ?")) fbRemoveOrLocal("teamTodos", btn.dataset.id);
    }
  });
}

async function validateTeamTodo(id, text) {
  if (!confirm(`Valider la mission "${text}" ?`)) return;
  const t = SHARED.teamTodos.find((x) => x.id === id);
  if (!t) return;
  await fbUpdateOrLocal("teamTodos", id, {
    ...t,
    status: "done",
    _validatedBy: app.username,
    _validatedAt: Date.now(),
  });
  LOCAL.rpg.teamDone = (LOCAL.rpg.teamDone || 0) + 1;
  gainXP("team_validate");
  saveLocal();
  toast("✅ Mission validée ! +15 XP", true);
  checkBadges();
}

export function updateTeamBadge() {
  const el = $("team-badge");
  if (!el) return;
  const pending = SHARED.teamTodos.filter((t) => t.status !== "done" && t._by !== app.username).length;
  if (pending > 0) {
    el.style.display = "inline";
    el.textContent = pending;
  } else {
    el.style.display = "none";
  }
}

export function updateTeamNavBadge() {
  const el = $("team-nav-badge");
  if (!el) return;
  // Missions restantes = perso (non faites) + équipe (non validées)
  const personalPending = LOCAL.todos.filter((t) => !t.done).length;
  const teamPending = SHARED.teamTodos.filter((t) => t.status !== "done").length;
  const count = personalPending + teamPending;
  if (count > 0) {
    el.style.display = "flex";
    el.textContent = count;
  } else {
    el.style.display = "none";
  }
}

/* ── Mission-done popup ─────────────────────────────── */

export function showMissionDonePopup(validatorName, taskText) {
  $("mdo-title").textContent = "Mission accomplie ! 🎉";
  $("mdo-msg").textContent = `${validatorName} a validé ta mission : "${taskText}"`;
  $("mission-done-overlay").classList.add("show");
  gainXP("team_validated_by_other");
}

export function closeMissionDone() {
  $("mission-done-overlay")?.classList.remove("show");
}

/* Handle incoming team todo updates: show popup + cleanup */
export function handleTeamTodoUpdates() {
  SHARED.teamTodos.forEach((t) => {
    if (
      t.status === "done" &&
      t._by === app.username &&
      t._validatedBy &&
      t._validatedBy !== app.username &&
      !LOCAL.notifiedDone.includes(t.id)
    ) {
      LOCAL.notifiedDone.push(t.id);
      saveLocal();
      showMissionDonePopup(t._validatedBy, t.text);
      setTimeout(() => fbRemove(sp(`teamTodos/${t.id}`)), 3000);
    }
  });
}

/* Register renders for bus */
render.teamTodos = () => {
  renderTeamTodos();
  updateTeamBadge();
  updateTeamNavBadge();
};
render.missionDonePopup = showMissionDonePopup;

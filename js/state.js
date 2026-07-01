const DEFAULT_RPG = {
  xp: 0,
  level: 1,
  streak: 1,
  lastDate: "",
  todoDone: 0,
  todoHighDone: 0,
  dlcTreated: 0,
  dlcUrgent: 0,
  supAdded: 0,
  teamDone: 0,
  teamCreated: 0,
  teamValidatedByOther: 0,
  reserveAdded: 0,
  reserveLocs: 0,
  badges: [],
};

export const LOCAL = {
  todos: [],
  rpg: { ...DEFAULT_RPG },
  notifiedDone: [],
  dlcAlertDate: "",
};

export const SHARED = {
  dlc: [],
  suppliers: [],
  reserve: [],
  teamTodos: [],
  scores: {},
  products: [],
  vrac: [],
  zones: {},
  rayons: [],
  stockItems: [],
  invCounts: [],
  invZones: {},
  invMeta: {},
};

export const app = {
  db: null,
  auth: null,
  username: "",
  uid: "",
  email: "",
  storeId: "",
  role: "staff", // admin | staff | student
  firebaseMode: false,
};

export function isAdmin() {
  return app.role === "admin";
}
export function isStudent() {
  return app.role === "student";
}
export function canWriteStock() {
  return app.role !== "student";
}

export function applyRemoteLocal(data) {
  if (!data) return;
  Object.assign(LOCAL, data);
  LOCAL.rpg = { ...DEFAULT_RPG, ...data.rpg };
  if (!Array.isArray(LOCAL.notifiedDone)) LOCAL.notifiedDone = [];
}

let _remoteSaveFn = null;
let _debounceTimer = null;

export function registerRemoteSave(fn) {
  _remoteSaveFn = fn;
}

export function saveLocal() {
  if (_remoteSaveFn) {
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(_remoteSaveFn, 2000);
  }
}

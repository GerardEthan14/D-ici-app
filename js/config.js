export const LEVELS = [
  { lvl: 1, xp: 0, title: "Stagiaire Rayon", avatar: "🧑‍🍳" },
  { lvl: 2, xp: 100, title: "Apprenti Liquides", avatar: "🍺" },
  { lvl: 3, xp: 250, title: "Gestionnaire Rayon", avatar: "📦" },
  { lvl: 4, xp: 500, title: "Expert des DLC", avatar: "📅" },
  { lvl: 5, xp: 900, title: "Maître Commandes", avatar: "🛒" },
  { lvl: 6, xp: 1400, title: "Chef de Rayon", avatar: "🏆" },
  { lvl: 7, xp: 2000, title: "Seigneur des Stocks", avatar: "👑" },
  { lvl: 8, xp: 2800, title: "Légende du Frigo", avatar: "🌟" },
  { lvl: 9, xp: 4000, title: "Maître Brasseur", avatar: "🍻" },
  { lvl: 10, xp: 6000, title: "Dieu du Rayon D'ici", avatar: "⚡" },
];

export const XP_MAP = {
  todo_low: 10,
  todo_med: 15,
  todo_high: 25,
  dlc_add: 10,
  dlc_urgent: 30,
  dlc_soon: 20,
  dlc_ok: 10,
  order_add: 5,
  order_advance: 15,
  order_receive: 20,
  supplier_add: 5,
  reserve_add: 5,
  streak_bonus: 20,
  team_validate: 15,
  team_validated_by_other: 20,
};

export const BADGES = [
  { id: "level2", icon: "🌱", name: "Pousse", desc: "Niveau 2", cat: "progression", ok: s => s.level >= 2 },
  { id: "level5", icon: "🏆", name: "Mi-chemin", desc: "Niveau 5", cat: "progression", ok: s => s.level >= 5 },
  { id: "level8", icon: "💎", name: "Diamant", desc: "Niveau 8", cat: "progression", ok: s => s.level >= 8 },
  { id: "level10", icon: "👑", name: "Légende", desc: "Niveau 10", cat: "progression", ok: s => s.level >= 10 },
  { id: "xp500", icon: "⚡", name: "Chargé", desc: "500 XP total", cat: "progression", ok: s => s.xp >= 500 },
  { id: "xp2000", icon: "🔋", name: "Plein d'énergie", desc: "2000 XP total", cat: "progression", ok: s => s.xp >= 2000 },
  { id: "xp5000", icon: "☀️", name: "Solaire", desc: "5000 XP total", cat: "progression", ok: s => s.xp >= 5000 },
  { id: "streak3", icon: "🔥", name: "En feu", desc: "3 jours de suite", cat: "progression", ok: s => s.streak >= 3 },
  { id: "streak7", icon: "🌟", name: "Semaine parfaite", desc: "7 jours de suite", cat: "progression", ok: s => s.streak >= 7 },
  { id: "streak30", icon: "🏅", name: "Marathonien", desc: "30 jours de suite", cat: "progression", ok: s => s.streak >= 30 },
  { id: "first_todo", icon: "✅", name: "Première mission", desc: "1 tâche complétée", cat: "missions", ok: s => s.todoDone >= 1 },
  { id: "todo10", icon: "🎯", name: "Série de 10", desc: "10 tâches complétées", cat: "missions", ok: s => s.todoDone >= 10 },
  { id: "todo50", icon: "💪", name: "Cinquantaine", desc: "50 tâches complétées", cat: "missions", ok: s => s.todoDone >= 50 },
  { id: "todo100", icon: "🎖️", name: "Centurion", desc: "100 tâches complétées", cat: "missions", ok: s => s.todoDone >= 100 },
  { id: "todo_high5", icon: "🚨", name: "Pompier", desc: "5 tâches urgentes faites", cat: "missions", ok: s => s.todoHighDone >= 5 },
  { id: "morning_bird", icon: "🌅", name: "Lève-tôt", desc: "Utiliser l'app avant 8h", cat: "missions", ok: s => s.morningUse >= 1 },
  { id: "team_first", icon: "🤲", name: "Esprit d'équipe", desc: "1ère mission d'équipe créée", cat: "team", ok: s => s.teamCreated >= 1 },
  { id: "team_validator5", icon: "🦸", name: "Validateur", desc: "5 missions d'équipe validées", cat: "team", ok: s => s.teamDone >= 5 },
  { id: "team_validated", icon: "🙏", name: "Reconnu", desc: "Ta mission validée par un.e collègue", cat: "team", ok: s => s.teamValidatedByOther >= 1 },
  { id: "team_both", icon: "👫", name: "Duo parfait", desc: "5 validations mutuelles", cat: "team", ok: s => s.teamDone >= 5 && s.teamValidatedByOther >= 5 },
  { id: "dlc_first", icon: "📅", name: "Veilleur DLC", desc: "1ère DLC traitée", cat: "dlc", ok: s => s.dlcTreated >= 1 },
  { id: "dlc_urgentx5", icon: "🚨", name: "Pompier DLC", desc: "5 DLC critiques traitées", cat: "dlc", ok: s => s.dlcUrgent >= 5 },
  { id: "dlc10", icon: "📆", name: "Gestionnaire", desc: "10 DLC traitées", cat: "dlc", ok: s => s.dlcTreated >= 10 },
  { id: "dlc50", icon: "🗓️", name: "Maître du temps", desc: "50 DLC traitées", cat: "dlc", ok: s => s.dlcTreated >= 50 },
  { id: "dlc_zero", icon: "✨", name: "Rayon propre", desc: "0 DLC périmée en stock", cat: "dlc", ok: s => s.dlcZeroStreak >= 1 },
  { id: "dlc_week", icon: "🛡️", name: "Gardien", desc: "7j sans DLC critique", cat: "dlc", ok: s => s.dlcSafeWeek >= 1 },
  { id: "order_first", icon: "📦", name: "Premier ordre", desc: "1ère commande reçue", cat: "commandes", ok: s => s.ordersRcv >= 1 },
  { id: "order10", icon: "🚚", name: "Logisticien", desc: "10 commandes reçues", cat: "commandes", ok: s => s.ordersRcv >= 10 },
  { id: "order50", icon: "🏭", name: "Directeur logistique", desc: "50 commandes reçues", cat: "commandes", ok: s => s.ordersRcv >= 50 },
  { id: "order_speed", icon: "⚡", name: "Éclair", desc: "Commande reçue le jour même", cat: "commandes", ok: s => s.orderSameDay >= 1 },
  { id: "supplier_first", icon: "🤝", name: "Premier contact", desc: "1er fournisseur créé", cat: "commandes", ok: s => s.supAdded >= 1 },
  { id: "sup5", icon: "🗂️", name: "Réseau solide", desc: "5 fournisseurs créés", cat: "commandes", ok: s => s.supAdded >= 5 },
  { id: "sup10", icon: "🌐", name: "Ambassadeur", desc: "10 fournisseurs créés", cat: "commandes", ok: s => s.supAdded >= 10 },
  { id: "reserve_first", icon: "🏠", name: "Cartographe", desc: "1er emplacement enregistré", cat: "reserve", ok: s => s.reserveAdded >= 1 },
  { id: "reserve10", icon: "🗺️", name: "Explorateur", desc: "10 emplacements enregistrés", cat: "reserve", ok: s => s.reserveAdded >= 10 },
  { id: "reserve_loc5", icon: "📍", name: "Organisateur", desc: "5 emplacements différents", cat: "reserve", ok: s => s.reserveLocs >= 5 },
  { id: "reserve_all", icon: "🔭", name: "Tout-terrain", desc: "20 produits en réserve", cat: "reserve", ok: s => s.reserveAdded >= 20 },
  { id: "early_bird", icon: "🐦", name: "L'aurore", desc: "Utiliser l'app à 7h ou avant", cat: "social", ok: s => s.earlyUse >= 1 },
  { id: "night_owl", icon: "🦉", name: "Noctambule", desc: "Utiliser l'app après 21h", cat: "social", ok: s => s.nightUse >= 1 },
  { id: "weekend", icon: "🎉", name: "Dédié", desc: "Utiliser l'app le weekend", cat: "social", ok: s => s.weekendUse >= 1 },
  { id: "allmodules", icon: "🌈", name: "Complet", desc: "Utiliser les 4 modules en 1 jour", cat: "social", ok: s => s.allModulesDay >= 1 },
  { id: "perfectday", icon: "⭐", name: "Journée parfaite", desc: "10 actions en 1 jour", cat: "social", ok: s => s.actionsToday >= 10 },
  { id: "legend", icon: "🌌", name: "Galaxie", desc: "Tous les autres badges débloqués", cat: "social", ok: s => s.badges && s.badges.length >= 45 },
];

export const BADGE_CATEGORIES = [
  { key: "progression", label: "⚡ Progression" },
  { key: "missions", label: "🎯 Missions personnelles" },
  { key: "team", label: "👥 Missions d'équipe" },
  { key: "dlc", label: "📅 DLC" },
  { key: "commandes", label: "📦 Commandes" },
  { key: "reserve", label: "🏠 Réserve" },
  { key: "social", label: "🤝 Social" },
];

export const ADMIN_EMAIL = "oikedo@gmail.com";

export const DEFAULT_ROLE = "staff"; // role assigné aux nouveaux utilisateurs
export const ROLES = ["admin", "staff", "student"];
export const ROLE_LABELS = {
  admin: "🛡️ Admin",
  staff: "👷 Staff",
  student: "🎓 Étudiant",
};

export const STORES = [
  { id: "dici-champion",     name: "D'ici Champion" },
  { id: "dici-naninne",   name: "D'ici Naninne" },
  { id: "dici-wepion",   name: "D'ici Wepion" },
];

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCTQjBp6R_afxrEsBj9iL7vtHtPu4HY_oQ",
  authDomain: "d-ici-app.firebaseapp.com",
  databaseURL: "https://d-ici-app-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "d-ici-app",
  storageBucket: "d-ici-app.firebasestorage.app",
  messagingSenderId: "597825200048",
  appId: "1:597825200048:web:ede1a2eeb0513dde580075",
};

export const STORAGE_KEYS = {
  local: "dici-local-v3",
  username: "dici-username",
};

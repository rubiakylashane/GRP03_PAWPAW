/* js/owner/pets-store.js
   Shared helpers for the pet pages (my-pets, add-pet, edit-pet).
   Demo storage = this browser's localStorage. When the backend is ready,
   replace the bodies of load / save (or the add / update functions) with fetch() calls. */
window.PawPets = (() => {
  const BASE = "pawpaw_pets";
  let memory = []; // fallback when localStorage is blocked

  /* Data is saved per signed-in user, so each account only sees its own records. */
  function userKey(base) {
    let name = "guest";
    for (const store of ["sessionStorage", "localStorage"]) {
      try {
        const u = JSON.parse(window[store].getItem("pawpaw_user") || "null");
        if (u && u.name) { name = String(u.name).trim().toLowerCase(); break; }
      } catch (_) { /* ignore */ }
    }
    return base + ":" + name;
  }

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function load() {
    try {
      const v = JSON.parse(localStorage.getItem(userKey(BASE)) || "null");
      return Array.isArray(v) ? v : [];
    } catch (_) { /* storage blocked: use memory */ }
    return memory;
  }
  function save(list) {
    memory = list;
    try { localStorage.setItem(userKey(BASE), JSON.stringify(list)); } catch (_) { /* ignore */ }
  }

  const get = (id) => load().find((p) => p.id === id) || null;

  function add(pet) {
    const list = load();
    const created = { ...pet, id: "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) };
    list.push(created);
    save(list);
    return created;
  }
  function update(id, patch) {
    const list = load();
    const i = list.findIndex((p) => p.id === id);
    if (i === -1) return null;
    list[i] = { ...list[i], ...patch, id };
    save(list);
    return list[i];
  }

  /* dob is "YYYY-MM-DD" */
  function ageText(dob) {
    if (!dob) return "";
    const b = new Date(dob + "T00:00:00");
    if (isNaN(b)) return "";
    const now = new Date();
    let months = (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth());
    if (now.getDate() < b.getDate()) months -= 1;
    if (months < 0) return "";
    if (months >= 12) {
      const y = Math.floor(months / 12);
      return y + (y === 1 ? " yr" : " yrs");
    }
    return months >= 1 ? months + " mo" : "Under 1 mo";
  }
  function fmtDate(dob) {
    if (!dob) return "";
    const d = new Date(dob + "T00:00:00");
    return isNaN(d) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  /* one-time message shown on the next page (e.g. "Pet added.") */
  function setFlash(msg) { try { sessionStorage.setItem("pawpaw_flash", msg); } catch (_) { /* ignore */ } }
  function takeFlash() {
    try {
      const m = sessionStorage.getItem("pawpaw_flash");
      sessionStorage.removeItem("pawpaw_flash");
      return m;
    } catch (_) { return null; }
  }

  return { esc, load, get, add, update, ageText, fmtDate, setFlash, takeFlash };
})();
/* js/owner/appts-store.js
   Demo storage for appointment requests (this browser's localStorage).
   Replace load / save with fetch() calls when the backend is ready.
   The My Appointments page and the dashboard can read the same list. */
window.PawAppts = (() => {
  const BASE = "pawpaw_appointments";
  let memory = [];

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

  /* a new request always starts as "pending" until staff approve it */
  function add(appt) {
    const list = load();
    const created = {
      ...appt,
      id: "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      status: "pending",
      createdAt: new Date().toISOString()
    };
    list.push(created);
    save(list);
    return created;
  }

  const get = (id) => load().find((a) => a.id === id) || null;

  /* change fields of one appointment (reschedule, cancel ...) */
  function update(id, patch) {
    const list = load();
    const i = list.findIndex((a) => a.id === id);
    if (i < 0) return null;
    list[i] = { ...list[i], ...patch, updatedAt: new Date().toISOString() };
    save(list);
    return list[i];
  }

  return { load, get, add, update };
})();
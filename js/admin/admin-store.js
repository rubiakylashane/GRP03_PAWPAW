/* js/admin/admin-store.js
   Demo storage for the admin pages (this browser's localStorage).
     pawpaw_users          [ { id, username, name, email, phone, role, status, createdAt, mustChange } ]  staff / vet / admin accounts
     pawpaw_owner_status   { <owner key>: "active" | "inactive" }                                        owners register themselves, so they are read from
                                                                                                          their own keys ("pawpaw_profile:<key>" ...)
     pawpaw_audit          [ { at, text } ]   newest last (the admin Dashboard "Recent activity" reads it)
   Passwords are NEVER saved here: the backend must hash the temporary password and flag mustChange.
   Backend: replace the functions below with fetch() calls:
     GET /api/admin/users?role=   POST /api/admin/users   PATCH /api/admin/users/:id  { role | status }
     POST /api/admin/users/:id/reset-password  { temporaryPassword }   GET /api/admin/audit */
window.PawAdmin = (() => {
  const USERS = "pawpaw_users", AUDIT = "pawpaw_audit", OSTAT = "pawpaw_owner_status", FLASH = "pawpaw_flash";
  const ROLES = { owner: "Owner", staff: "Staff", vet: "Veterinarian", admin: "Admin" };
  const NOT_OWNERS = ["guest", "staff", "vet", "admin"];
  const memory = {};

  const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (_) { return k in memory ? memory[k] : d; } };
  const write = (k, v) => { memory[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* ignore */ } };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const iso = (d = new Date()) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const validPhone = (s) => /^(09\d{9}|\+639\d{9})$/.test(String(s).replace(/[\s-]/g, ""));
  const validEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

  const SEED = [
    { id: "u-1", username: "adelacruz", name: "Ana Dela Cruz", email: "ana.delacruz@pawpaw.clinic", phone: "09170000001", role: "staff", status: "active", createdAt: "2026-02-02" },
    { id: "u-2", username: "rsoriano", name: "Rico Soriano", email: "rico.soriano@pawpaw.clinic", phone: "09170000002", role: "staff", status: "inactive", createdAt: "2026-02-02" },
    { id: "u-3", username: "aabila", name: "Dr. Anajoy N. Abila", email: "anajoy.abila@pawpaw.clinic", phone: "09175550101", role: "vet", status: "active", createdAt: "2026-01-15" },
    { id: "u-4", username: "sbuerano", name: "Dr. Sean Kurvie G. Buerano", email: "sean.buerano@pawpaw.clinic", phone: "09175550102", role: "vet", status: "active", createdAt: "2026-01-15" },
    { id: "u-6", username: "rregulacion", name: "Dr. Roxanne N. Regulacion", email: "roxanne.regulacion@pawpaw.clinic", phone: "09175550103", role: "vet", status: "active", createdAt: "2026-01-15" },
    { id: "u-7", username: "jronquillo", name: "Dr. Jenmarc M. Ronquillo", email: "jenmarc.ronquillo@pawpaw.clinic", phone: "09175550104", role: "vet", status: "active", createdAt: "2026-01-15" },
    { id: "u-8", username: "krubia", name: "Dr. Kyla Shane T. Rubia", email: "kyla.rubia@pawpaw.clinic", phone: "09175550105", role: "vet", status: "active", createdAt: "2026-01-15" },
    { id: "u-5", username: "admin", name: "Admin", email: "admin@pawpaw.clinic", phone: "09170000005", role: "admin", status: "active", createdAt: "2026-01-01" }
  ];
  /* one-time: the first sample doctors (Paolo Reyes, Lia Mendoza, Carlo Tan) are replaced by the clinic's real doctors */
  try {
    if (localStorage.getItem("pawpaw_seed_v") !== "2") {
      const old = JSON.parse(localStorage.getItem("pawpaw_users") || "null");
      if (Array.isArray(old)) { const keep = old.filter((u) => ["preyes", "ctan"].indexOf(u.username) < 0); SEED.forEach((u) => { if (u.role === "vet" && !keep.some((k) => k.id === u.id)) keep.push({ ...u }); }); localStorage.setItem("pawpaw_users", JSON.stringify(keep)); }
      localStorage.removeItem("pawpaw_vets"); localStorage.setItem("pawpaw_seed_v", "2");
    }
  } catch (_) { /* ignore */ }
  const accounts = () => { let v = read(USERS, null); if (!Array.isArray(v)) { v = SEED.map((u) => ({ ...u })); write(USERS, v); } else if (v.some((u) => !u || typeof u !== "object")) { v = v.filter((u) => u && typeof u === "object"); write(USERS, v); } return v; };   // a broken saved entry is dropped instead of stopping every admin page

  /* signed-in admin (for the audit log and so you cannot lock yourself out) */
  function me() {
    for (const st of ["sessionStorage", "localStorage"]) {
      try { const u = JSON.parse(window[st].getItem("pawpaw_user") || "null"); if (u && u.name) return String(u.name).trim(); } catch (_) { /* ignore */ }
    }
    return "Admin";
  }
  const cap = (s) => (s && s === s.toLowerCase() ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  /* owners: read from the keys the owner pages save */
  function owners() {
    const keys = new Set(), stat = read(OSTAT, {});
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) || "";
        for (const pre of ["pawpaw_profile:", "pawpaw_pets:", "pawpaw_appointments:"]) if (k.indexOf(pre) === 0) keys.add(k.slice(pre.length));
      }
    } catch (_) { /* ignore */ }
    return [...keys].filter((k) => k && NOT_OWNERS.indexOf(k) < 0 && k.indexOf("walkin-") !== 0).map((k) => {
      const p = read("pawpaw_profile:" + k, {}) || {};
      return { id: "o:" + k, username: k, name: p.name || k, email: p.email || "", phone: p.phone || "", role: "owner", status: stat[k] || "active", createdAt: /^\d{4}-\d{2}-\d{2}/.test(p.memberSince || "") ? p.memberSince.slice(0, 10) : "", owner: true };
    });
  }
  const list = () => [...owners(), ...accounts()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  /* audit trail: "pawpaw_audit" [ { at, user, role, action: create|update|delete, record, details, text } ] (newest last).
     text = the same sentence with the actor in bold (used by the Dashboard "Recent activity").
     Staff, vet and owner pages write to the same list (see audit() in owners-store.js). Backend: the server writes this itself. */
  const plain = (h) => String(h).replace(/<[^>]*>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  function myRole() {
    for (const st of ["sessionStorage", "localStorage"]) {
      try { const u = JSON.parse(window[st].getItem("pawpaw_user") || "null"); if (u && u.name) return u.role || "admin"; } catch (_) { /* ignore */ }
    }
    return "admin";
  }
  /* log("added staff account x", "create", "user")  - the text may hold esc()'d values; action and record are optional (guessed from the words) */
  function log(text, action, record) {
    const d = plain(text).trim();
    if (!action) action = /^(regist|add|creat|book)/i.test(d) ? "create" : /^(delet|remov|cancel)/i.test(d) ? "delete" : "update";
    if (!record) record = /veterinarian/i.test(d) ? "veterinarian" : /appointment/i.test(d) ? "appointment" : /\bpet\b/i.test(d) ? "pet" : /owner/i.test(d) ? "owner" : /service/i.test(d) ? "service" : "user";
    const who = cap(me()), a = read(AUDIT, []);
    a.push({ at: new Date().toISOString(), user: who, role: myRole(), action, record, details: d.charAt(0).toUpperCase() + d.slice(1) + (/[.!?]$/.test(d) ? "" : "."), text: "<strong>" + esc(who) + "</strong> " + text });
    write(AUDIT, a.slice(-500));
  }

  /* ---------- the signed-in admin's / staff member's own profile (My Profile page) ----------
     pawpaw_admin_profile:<name> or pawpaw_staff_profile:<name> (signed-in name, lower case)  { name, email, phone, photo }
     name / email / phone are also written to the login account so the Users and Staff list stays the same. */
  const profKey = () => (myRole() === "admin" ? "pawpaw_admin_profile:" : "pawpaw_" + myRole() + "_profile:") + me().toLowerCase();
  function myAccount() {
    const m = me().toLowerCase(), r = myRole();
    return accounts().find((u) => u.role === r && (String(u.username).toLowerCase() === m || String(u.name || "").toLowerCase() === m)) || null;
  }
  function myProfile() {
    const a = myAccount(), s = read(profKey(), {}) || {};
    return { username: a ? a.username : me(), accountId: a ? a.id : null, name: s.name || (a && a.name) || cap(me()),
      email: "email" in s ? s.email : (a ? a.email : ""), phone: "phone" in s ? s.phone : (a ? a.phone : ""), photo: s.photo || "" };
  }
  function saveMyProfile({ name, email, phone, photo }, passwordChanged) {
    const vet = myRole() === "vet";
    if (vet) name = withDr(name);
    write(profKey(), { name, email, phone, photo: photo || "" });
    const a = myAccount();
    if (a) {
      const all = accounts(), i = all.findIndex((x) => x.id === a.id); if (i >= 0) { all[i] = { ...all[i], name, email, phone }; write(USERS, all); }
      if (vet) { const list = vets(), j = list.findIndex((v) => v.userId === a.id); if (j >= 0) { const old = list[j].name; list[j] = { ...list[j], name, email, phone }; write(VETS, list); renameVetEverywhere(old, name); } }
    }
    log("updated their own profile" + (passwordChanged ? " (password changed)" : ""), "update", "user");
  }

  /* username: first initial + last name ("Maria Santos" -> msantos), unique */
  function makeUsername(name) {
    const t = String(name).toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/).filter(Boolean);
    let base = t.length > 1 ? t[0][0] + t[t.length - 1] : (t[0] || "user");
    const taken = new Set(list().map((u) => u.username)); let u = base, n = 2;
    while (taken.has(u)) u = base + n++;
    return u;
  }
  const emailTaken = (email, exceptId) => list().some((u) => u.id !== exceptId && u.email && u.email.toLowerCase() === email.toLowerCase());

  function add({ name, phone, email, role }) {
    const all = accounts();
    const u = { id: "u-" + Date.now().toString(36), username: makeUsername(name), name, email, phone: phone.replace(/[\s-]/g, ""), role, status: "active", createdAt: iso(), mustChange: true };
    if (role === "owner") {   // an owner is saved the way the owner pages save their own profile (key = username), so the owner pages and staff list find it
      write("pawpaw_profile:" + u.username, { name, email, phone: u.phone, memberSince: u.createdAt });
      u.id = "o:" + u.username; u.owner = true;
    } else { all.push(u); write(USERS, all); }
    log("added " + esc(ROLES[role].toLowerCase()) + " account " + esc(u.username), "create", role === "owner" ? "owner" : "user");
    return u;
  }
  function patch(u, change, what) {
    if (u.owner) { const s = read(OSTAT, {}); s[u.username] = change.status; write(OSTAT, s); }
    else { const all = accounts(), i = all.findIndex((x) => x.id === u.id); if (i >= 0) { all[i] = { ...all[i], ...change }; write(USERS, all); } }
    Object.assign(u, change);
    log(what, "update", "user");
  }
  /* a veterinarian's name is how appointments, records and vaccines point to them, so a rename is carried over to all of them */
  function renameVetEverywhere(oldName, newName) {
    if (!oldName || !newName || oldName === newName) return;
    try {
      const keys = []; for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i) || "");
      keys.forEach((k) => {
        if (k.indexOf("pawpaw_appointments:") === 0) { const l = read(k, []); if (Array.isArray(l) && l.some((a) => a && a.vet === oldName)) write(k, l.map((a) => (a && a.vet === oldName ? { ...a, vet: newName } : a))); }
        else if (k.indexOf("pawpaw_records:") === 0) {
          const r = read(k, {}) || {}, fix = (arr) => (Array.isArray(arr) ? arr.map((x) => (x && x.vet === oldName ? { ...x, vet: newName } : x)) : arr);
          if (JSON.stringify(r).indexOf(oldName) >= 0) write(k, { ...r, visits: fix(r.visits), prescriptions: fix(r.prescriptions) });
        } else if (k.indexOf("pawpaw_vaccinations:") === 0) { const l = read(k, []); if (Array.isArray(l) && l.some((x) => x && x.administeredBy === oldName)) write(k, l.map((x) => (x && x.administeredBy === oldName ? { ...x, administeredBy: newName } : x))); }
      });
    } catch (_) { /* ignore */ }
  }

  /* edit the details of a staff / vet / admin account (name, phone, email); a vet's profile on the Veterinarians page is kept in step */
  function updateUser(u, { name, phone, email }) {
    phone = String(phone).replace(/[\s-]/g, "");
    name = u.role === "vet" ? withDr(name) : String(name).trim().replace(/\s+/g, " ");
    const all = accounts(), i = all.findIndex((x) => x.id === u.id); if (i < 0) return;
    all[i] = { ...all[i], name, phone, email }; write(USERS, all);
    if (u.role === "vet") {
      const list = vets(), j = list.findIndex((v) => v.userId === u.id);
      if (j >= 0) { const old = list[j].name; list[j] = { ...list[j], name, phone, email }; write(VETS, list); renameVetEverywhere(old, name); }
    }
    Object.assign(u, { name, phone, email });
    log("updated the details of " + esc(ROLES[u.role].toLowerCase()) + " account " + esc(u.username), "update", "user");
  }
  const setRole = (u, role) => patch(u, { role }, "changed the role of " + esc(u.username) + " to " + esc(ROLES[role].toLowerCase()));
  const setStatus = (u, status) => {
    patch(u, { status }, (status === "active" ? "activated " : "deactivated ") + "account " + esc(u.username));
    if (u.role === "vet") { const list = vets(), j = list.findIndex((v) => v.userId === u.id); if (j >= 0) { list[j] = { ...list[j], status }; write(VETS, list); } }   // keep the Veterinarians page in step
  };
  const resetPassword = (u) => { if (!u.owner) { const all = accounts(), i = all.findIndex((x) => x.id === u.id); if (i >= 0) { all[i].mustChange = true; write(USERS, all); } } log("reset the password of " + esc(u.username), "update", "user"); };

  /* ---------- veterinarian profiles (the Veterinarians page) ----------
     pawpaw_vets  [ { id, name, specialization, license, phone, email, userId } ]   userId = the vet's login account (pawpaw_users) */
  const VETS = "pawpaw_vets";
  const SPECS = ["General Practice", "Dermatology", "Surgery", "Internal Medicine", "Dentistry", "Emergency and Critical Care", "Exotic Animals"];
  const SEEDV = [
    { id: "v-1", name: "Dr. Anajoy N. Abila", specialization: "General Practice", license: "PRC 0012345", phone: "09175550101", email: "anajoy.abila@pawpaw.clinic", userId: "u-3" },
    { id: "v-2", name: "Dr. Sean Kurvie G. Buerano", specialization: "Surgery", license: "PRC 0023456", phone: "09175550102", email: "sean.buerano@pawpaw.clinic", userId: "u-4" },
    { id: "v-3", name: "Dr. Roxanne N. Regulacion", specialization: "Dermatology", license: "PRC 0034567", phone: "09175550103", email: "roxanne.regulacion@pawpaw.clinic", userId: "u-6" },
    { id: "v-4", name: "Dr. Jenmarc M. Ronquillo", specialization: "Internal Medicine", license: "PRC 0045678", phone: "09175550104", email: "jenmarc.ronquillo@pawpaw.clinic", userId: "u-7" },
    { id: "v-5", name: "Dr. Kyla Shane T. Rubia", specialization: "Dentistry", license: "PRC 0056789", phone: "09175550105", email: "kyla.rubia@pawpaw.clinic", userId: "u-8" }
  ];
  accounts();   // seeds the login accounts first (the sample vets point to them)
  const vets = () => { let v = read(VETS, null); if (!Array.isArray(v)) { v = SEEDV.map((x) => ({ ...x })); write(VETS, v); } return v; };
  const withDr = (n) => { const t = String(n).trim().replace(/\s+/g, " "); const rest = t.replace(/^dr\.?\s+/i, "").split(" ").map((w) => (w === w.toLowerCase() ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(" "); return "Dr. " + rest; };
  const phoneShow = (p) => { const d = String(p || "").replace(/\D/g, ""); return /^09\d{9}$/.test(d) ? d.slice(0, 4) + " " + d.slice(4, 7) + " " + d.slice(7) : (p || "-"); };
  const normLicense = (s) => { const m = String(s).trim().match(/^(?:PRC)?\s*(\d{7})$/i); return m ? "PRC " + m[1] : ""; };
  const licenseTaken = (lic, exceptId) => vets().some((v) => v.id !== exceptId && v.license === lic);
  const vetEmailTaken = (email, exceptId) => vets().some((v) => v.id !== exceptId && v.email.toLowerCase() === email.toLowerCase());
  const freeVetAccounts = () => accounts().filter((u) => u.role === "vet" && !vets().some((v) => v.userId === u.id));

  /* what the vet already has in the clinic records: delete is blocked when any of it exists */
  function history(v) {
    const h = { appointments: 0, records: 0, prescriptions: 0, vaccinations: 0 };
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) || "";
        if (k.indexOf("pawpaw_appointments:") === 0) (JSON.parse(localStorage.getItem(k) || "[]") || []).forEach((a) => { if (a.vet === v.name) h.appointments++; });
        else if (k.indexOf("pawpaw_records:") === 0) { const r = JSON.parse(localStorage.getItem(k) || "{}") || {}; (r.visits || []).forEach((x) => { if (x.vet === v.name) h.records++; }); (r.prescriptions || []).forEach((x) => { if (x.vet === v.name) h.prescriptions++; }); }
        else if (k.indexOf("pawpaw_vaccinations:") === 0) (JSON.parse(localStorage.getItem(k) || "[]") || []).forEach((x) => { if (x.administeredBy === v.name) h.vaccinations++; });
      }
    } catch (_) { /* ignore */ }
    h.total = h.appointments + h.records + h.prescriptions + h.vaccinations;
    return h;
  }

  /* account: "new" creates a login account for the vet, or the id of an existing vet account without a profile */
  function addVet({ name, specialization, license, phone, email, account }) {
    const list = vets(), v = { id: "v-" + Date.now().toString(36), name: withDr(name), specialization, license, phone: phone.replace(/[\s-]/g, ""), email, userId: null };
    if (account && account !== "new") v.userId = account;
    else {
      const all = accounts(), u = { id: "u-" + Date.now().toString(36), username: makeUsername(v.name.replace(/^Dr\.\s*/, "")), name: v.name, email, phone: v.phone, role: "vet", status: "active", createdAt: iso(), mustChange: true };
      all.push(u); write(USERS, all); v.userId = u.id;
    }
    list.push(v); write(VETS, list);
    log("added veterinarian " + esc(v.name), "create", "veterinarian");
    return v;
  }
  function updateVet(v, f) {
    const list = vets(), i = list.findIndex((x) => x.id === v.id); if (i < 0) return;
    f = { ...f, name: withDr(f.name), phone: f.phone.replace(/[\s-]/g, "") };
    const oldName = list[i].name;
    list[i] = { ...list[i], ...f }; write(VETS, list); Object.assign(v, list[i]); renameVetEverywhere(oldName, v.name);
    if (v.userId) { const all = accounts(), j = all.findIndex((u) => u.id === v.userId); if (j >= 0) { all[j] = { ...all[j], name: v.name, email: v.email, phone: v.phone }; write(USERS, all); } }
    log("updated veterinarian " + esc(v.name), "update", "veterinarian");
  }
  /* deactivate / activate a veterinarian: nothing is deleted, the login account follows, history stays */
  function setVetStatus(v, status) {
    const list = vets(), i = list.findIndex((x) => x.id === v.id); if (i < 0) return;
    list[i] = { ...list[i], status }; write(VETS, list); v.status = status;
    if (v.userId) { const all = accounts(), j = all.findIndex((u) => u.id === v.userId); if (j >= 0 && all[j].status !== status) { all[j] = { ...all[j], status }; write(USERS, all); } }
    log((status === "active" ? "activated" : "deactivated") + " veterinarian " + esc(v.name), "update", "veterinarian");
  }
  function removeVet(v) {
    write(VETS, vets().filter((x) => x.id !== v.id));
    log("deleted veterinarian " + esc(v.name), "delete", "veterinarian");
  }

  /* ---------- owners and pets (the admin Owners and Pets page uses PawOwners for the data) ---------- */
  const readList = (k) => { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
  /* what an owner (or one pet, when petId is given) already has: delete is blocked when any of it exists */
  function ownerHistory(key, petId) {
    const mine = (x) => !petId || x.petId === petId;
    const rec = read("pawpaw_records:" + key, {}) || {};
    const h = {
      pets: petId ? 0 : readList("pawpaw_pets:" + key).length,
      appointments: readList("pawpaw_appointments:" + key).filter(mine).length,
      records: ((rec.visits || []).filter(mine).length) + ((rec.prescriptions || []).filter(mine).length),
      vaccinations: readList("pawpaw_vaccinations:" + key).filter(mine).length
    };
    h.total = h.pets + h.appointments + h.records + h.vaccinations;
    return h;
  }
  const describe = (h) => [h.pets && h.pets + " pet" + (h.pets > 1 ? "s" : ""), h.appointments && h.appointments + " appointment" + (h.appointments > 1 ? "s" : ""), h.records && h.records + " record" + (h.records > 1 ? "s" : ""), h.vaccinations && h.vaccinations + " vaccination" + (h.vaccinations > 1 ? "s" : "")].filter(Boolean).join(", ");
  /* deactivate / activate an owner or one of their pets (nothing is deleted; history stays) */
  const ownerStatus = (key) => (read(OSTAT, {})[key] === "inactive" ? "inactive" : "active");
  function setOwnerStatus(key, name, status) {
    const s = read(OSTAT, {}); s[key] = status; write(OSTAT, s);
    log((status === "active" ? "activated" : "deactivated") + " owner " + esc(name), "update", "owner");
  }
  function setPetStatus(key, petId, petName, ownerName, status) {
    const list = readList("pawpaw_pets:" + key), i = list.findIndex((p) => p.id === petId); if (i < 0) return;
    list[i] = { ...list[i], status }; write("pawpaw_pets:" + key, list);
    log((status === "active" ? "activated" : "deactivated") + " pet " + esc(petName) + " of " + esc(ownerName), "update", "pet");
  }
  function deleteOwner(key, name) {
    ["pawpaw_profile:", "pawpaw_pets:", "pawpaw_notifications:", "pawpaw_notif_toasted:"].forEach((pre) => { try { localStorage.removeItem(pre + key); } catch (_) { /* ignore */ } });
    write("pawpaw_walkins", readList("pawpaw_walkins").filter((w) => w.key !== key));
    const s = read(OSTAT, {}); delete s[key]; write(OSTAT, s);
    log("deleted owner " + esc(name), "delete", "owner");
  }
  function deletePet(key, petId, petName, ownerName) {
    write("pawpaw_pets:" + key, readList("pawpaw_pets:" + key).filter((p) => p.id !== petId));
    log("deleted pet " + esc(petName) + " of " + esc(ownerName), "delete", "pet");
  }

  /* ---------- services (the Services page) ----------
     pawpaw_services  [ { id, name, price, desc, options? } ]   options = the vaccine list (same price as the service)
     Seeded from services-data.js the first time. services-data.js and staff-appts-store.js read this key, so owners and staff see the changes. */
  const SVC = "pawpaw_services";
  const services = () => {
    let v = read(SVC, null);
    if (!Array.isArray(v) || !v.length) { v = (Array.isArray(window.PawServices) ? window.PawServices : []).map((x) => JSON.parse(JSON.stringify(x))); write(SVC, v); }
    return v;
  };
  const peso = (n) => "\u20B1" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const svcKey = (n) => String(n).trim().replace(/\s+/g, " ").toLowerCase();
  const serviceNameTaken = (name, exceptId) => services().some((x) => x.id !== exceptId && svcKey(x.name) === svcKey(name));
  /* how many appointments (of every owner) already include this service: delete is blocked when any */
  function serviceUses(sv) {
    let n = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) || "";
        if (k.indexOf("pawpaw_appointments:") !== 0) continue;
        (JSON.parse(localStorage.getItem(k) || "[]") || []).forEach((a) => {
          if ((a.services || []).some((l) => String(l.id || "").split(":")[0] === sv.id || String(l.name || "").split(" (")[0].toLowerCase() === svcKey(sv.name))) n++;
        });
      }
    } catch (_) { /* ignore */ }
    return n;
  }
  function addService({ name, price, desc }) {
    const all = services(), base = svcKey(name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "service";
    let id = base, n = 2; while (all.some((x) => x.id === id)) id = base + "-" + n++;
    const sv = { id, name: name.trim().replace(/\s+/g, " "), price, desc: desc.trim() };
    all.push(sv); write(SVC, all);
    log("added service " + esc(sv.name) + " (" + esc(peso(price)) + ")", "create", "service");
    return sv;
  }
  function updateService(id, { name, price, desc }) {
    const all = services(), i = all.findIndex((x) => x.id === id); if (i < 0) return null;
    const old = all[i], nm = name.trim().replace(/\s+/g, " "), bits = [];
    if (Number(old.price) !== price) bits.push("changed the price of " + esc(old.name) + " from " + esc(peso(old.price)) + " to " + esc(peso(price)));
    if (old.name !== nm) bits.push("renamed service " + esc(old.name) + " to " + esc(nm));
    if (old.desc !== desc.trim()) bits.push("updated the description of " + esc(nm));
    all[i] = { ...old, name: nm, price, desc: desc.trim() };
    if (all[i].options) all[i].options = all[i].options.map((o) => ({ ...o, price }));   // the vaccine options follow the service price
    write(SVC, all);
    if (bits.length) log(bits.join(". "), "update", "service");
    return all[i];
  }
  /* deactivate / activate a service (it is kept; owners and staff just stop seeing it when booking) */
  function setServiceStatus(id, status) {
    const all = services(), i = all.findIndex((x) => x.id === id); if (i < 0) return null;
    all[i] = { ...all[i], status }; write(SVC, all);
    log((status === "active" ? "activated" : "deactivated") + " service " + esc(all[i].name), "update", "service");
    return all[i];
  }
  function deleteService(id) {
    const all = services(), sv = all.find((x) => x.id === id); if (!sv) return;
    write(SVC, all.filter((x) => x.id !== id));
    log("deleted service " + esc(sv.name), "delete", "service");
  }

  const setFlash = (m) => { try { sessionStorage.setItem(FLASH, m); } catch (_) { /* ignore */ } };
  const takeFlash = () => { try { const m = sessionStorage.getItem(FLASH) || ""; sessionStorage.removeItem(FLASH); return m; } catch (_) { return ""; } };
  const fmtDate = (s) => { if (!s) return "-"; const d = new Date(s + "T00:00:00"); return isNaN(d) ? "-" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); };

  return { services, addService, updateService, deleteService, setServiceStatus, serviceUses, serviceNameTaken, peso, log, ownerHistory, describe, deleteOwner, deletePet, ownerStatus, setOwnerStatus, setPetStatus, VETS, SPECS, vets, history, addVet, updateVet, setVetStatus, removeVet, withDr, phoneShow, normLicense, licenseTaken, vetEmailTaken, freeVetAccounts, validName: (s) => /^[A-Za-zÀ-ÿ.'\- ]{2,60}$/.test(s), ROLES, list, add, updateUser, myAccount, myProfile, saveMyProfile, setRole, setStatus, resetPassword, validPhone, validEmail, emailTaken, setFlash, takeFlash, fmtDate, esc, me };
})();
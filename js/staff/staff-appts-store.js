/* js/staff/staff-appts-store.js
   Demo data for the staff Appointments page: reads the requests that owners made
   (saved by js/owner/appts-store.js, one list per owner: "pawpaw_appointments:<owner>").
   Replace load / change / add with fetch() calls when the backend is ready:
     GET   /api/staff/appointments
     PATCH /api/staff/appointments/:id   { status, vet, date, time, reason }
     POST  /api/staff/appointments       { owner, petId, service, date, time, vet } */
window.PawStaffAppts = (() => {
  const KEY = "pawpaw_appointments:";
  const VETS = ["Dr. Maria Santos", "Dr. Jose Reyes"];
  const SERVICES = ["General Consultation", "Vaccination", "Deworming", "Grooming", "Dental Cleaning", "Laboratory Test"];   // same names as the owner Services page (svc/services-data.js)
  const STATUS = { pending: "Pending", confirmed: "Confirmed", checked_in: "Checked in", with_vet: "With vet", completed: "Completed", cancelled: "Cancelled", no_show: "No-show" };
  const ORDER = ["pending", "confirmed", "checked_in", "with_vet", "completed", "no_show", "cancelled"];
  const ACTIVE = ["pending", "confirmed", "checked_in", "with_vet"];   // still occupy a vet's time
  const TBA = "To be assigned";

  function load() {
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || k.indexOf(KEY) !== 0) continue;
        const owner = k.slice(KEY.length);
        (JSON.parse(localStorage.getItem(k) || "[]") || []).forEach((a) => out.push({ ...a, owner, _key: k }));
      }
    } catch (_) { /* storage blocked */ }
    return out;
  }

  /* a message for a vet's notification bell ("pawpaw_notifications:vet:<vet name>").
     Backend: the server creates this itself when the staff / owner action is saved. */
  function notifyVet(vet, title, text) {
    if (!vet || vet === TBA) return;
    const key = "pawpaw_notifications:vet:" + String(vet).toLowerCase();
    try {
      const list = JSON.parse(localStorage.getItem(key) || "[]");
      list.push({ id: "n-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), type: "appointment", title, text, createdAt: new Date().toISOString(), readAt: null });
      localStorage.setItem(key, JSON.stringify(list.slice(-50)));
    } catch (_) { /* ignore */ }
  }
  /* tell the vet what staff / owner just did to a patient of theirs (not for the vet's own start / complete) */
  function vetChanged(before, patch) {
    const after = { ...before, ...patch };
    const what = (after.petName || after.pet || "Pet") + ", " + after.date + " " + (after.time || "") + ".";
    const newVet = patch.vet && patch.vet !== before.vet;
    if (newVet && before.vet && before.vet !== TBA) notifyVet(before.vet, "Patient reassigned", what);
    if (!after.vet || after.vet === TBA) return;
    if (newVet || (patch.status === "confirmed" && before.status === "pending")) notifyVet(after.vet, "New patient assigned", what);
    else if (patch.status === "with_vet" && patch.vet) notifyVet(after.vet, "Patient is ready", what);   // staff "Assign Vet" on a checked-in patient
    else if (patch.status === "checked_in") notifyVet(after.vet, "Patient checked in", what);
    else if (patch.status === "cancelled") notifyVet(after.vet, "Appointment cancelled", what);
    else if (patch.status === "no_show") notifyVet(after.vet, "Marked as no-show", what);
    else if ((patch.date && patch.date !== before.date) || (patch.time && patch.time !== before.time)) notifyVet(after.vet, "Appointment rescheduled", what);
  }

  /* save a change (status / vet / date / time ...) back to the owner's list */
  function change(appt, patch) {
    const before = { ...appt };
    try {
      const list = JSON.parse(localStorage.getItem(appt._key) || "[]");
      const i = list.findIndex((a) => a.id === appt.id);
      if (i >= 0) { list[i] = { ...list[i], ...patch, updatedAt: new Date().toISOString() }; localStorage.setItem(appt._key, JSON.stringify(list)); }
    } catch (_) { /* ignore */ }
    vetChanged(before, patch);
    Object.assign(appt, patch);
    return appt;
  }

  /* staff books for an owner that is already registered */
  function add(ownerKey, data) {
    const key = KEY + ownerKey;
    const now = new Date().toISOString();
    const a = { id: "ap-" + Date.now().toString(36), status: "confirmed", total: 0, reason: "", createdAt: now, updatedAt: now, ...data };
    try {
      const list = JSON.parse(localStorage.getItem(key) || "[]");
      list.push(a);
      localStorage.setItem(key, JSON.stringify(list));
    } catch (_) { /* ignore */ }
    if (a.vet && a.vet !== TBA) notifyVet(a.vet, "New patient assigned", (a.petName || "Pet") + ", " + a.date + " " + (a.time || "") + ".");
    return { ...a, owner: ownerKey, _key: key };
  }

  /* another active appointment with the same vet at the same date and time */
  function conflict(all, vet, date, time, exceptId) {
    if (!vet || vet === TBA || !date || !time) return null;
    return all.find((x) => x.id !== exceptId && x.vet === vet && x.date === date && x.time === time && ACTIVE.indexOf(x.status) >= 0) || null;
  }
  /* a message for the owner's notification bell ("pawpaw_notifications:<owner>").
     Backend: the server creates this itself when the staff action is saved. */
  function notify(ownerKey, type, title, text) {
    if (!ownerKey) return;
    const key = "pawpaw_notifications:" + ownerKey;
    try {
      const list = JSON.parse(localStorage.getItem(key) || "[]");
      list.push({ id: "n-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), type, title, text, createdAt: new Date().toISOString(), readAt: null });
      localStorage.setItem(key, JSON.stringify(list.slice(-50)));
    } catch (_) { /* ignore */ }
  }
  return { load, change, add, conflict, notify, notifyVet, vetChanged, VETS, SERVICES, STATUS, ORDER, ACTIVE, TBA };
})();
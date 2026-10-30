/* js/staff/staff-appts-store.js - shared live appointment API access. */
window.PawStaffAppts = (() => {
  const KEY = "pawpaw_appointments:";
  const backend = Boolean(window.PawApi && window.PawApi.isBackendSession());
  const signedInRole = (() => {
    try { return String(JSON.parse(sessionStorage.getItem("pawpaw_user") || localStorage.getItem("pawpaw_user") || "{}").role || "").toLowerCase(); }
    catch (_) { return ""; }
  })();
  let VETS = [];
  let SERVICES = [];
  const STATUS = { pending: "Pending", confirmed: "Confirmed", checked_in: "Checked in", with_vet: "With Vet", completed: "Completed", cancelled: "Cancelled", no_show: "No Show" };
  const ORDER = ["pending", "confirmed", "checked_in", "with_vet", "completed", "no_show", "cancelled"];
  const ACTIVE = ["pending", "confirmed", "checked_in", "with_vet"];   // still occupy a vet's time
  const TBA = "To be assigned";
  let remoteAppointments = [];
  let remoteOwners = [];
  const ready = backend ? Promise.all([
    window.PawApi.request(signedInRole === "vet" ? "/api/vet/appointments" : signedInRole === "owner" ? "/api/appointments" : "/api/staff/appointments"),
    window.PawApi.loadOwners(),
    window.PawApi.request("/api/vets"),
    window.PawApi.request("/api/services")
  ]).then(([appointments, owners, vets, services]) => {
    remoteAppointments = appointments.map((a) => ({ ...a, id: String(a.id), owner: String(a.owner), _key: KEY + String(a.owner), pet: a.petName }));
    remoteOwners = owners;
    VETS = vets.filter((v) => v.status !== "inactive").map((v) => v.name);
    SERVICES = services.filter((s) => s.status !== "inactive").map((s) => s.name);
    return remoteAppointments;
  }) : Promise.resolve([]);

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function load() {
    return remoteAppointments.slice();
  }

  async function change(appt, patch) {
    if (!backend) throw new Error("An authenticated clinic session is required.");
    await window.PawApi.request("/api/appointments/" + encodeURIComponent(appt.id), { method: "PATCH", body: patch });
    Object.assign(appt, patch);
    return appt;
  }

  async function add(ownerKey, data) {
    if (!backend) throw new Error("An authenticated clinic session is required.");
    const saved = await window.PawApi.request("/api/appointments", {
      method: "POST",
      body: { ownerId: ownerKey, petId: data.petId, vet: data.vet, date: data.date, time: data.time, reason: data.reason, services: data.services }
    });
    const mapped = { ...saved, id: String(saved.id), owner: String(saved.owner), _key: KEY + String(saved.owner), pet: saved.petName };
    remoteAppointments.push(mapped);
    return mapped;
  }

  /* another active appointment with the same vet at the same date and time */
  function conflict(all, vet, date, time, exceptId) {
    if (!vet || vet === TBA || !date || !time) return null;
    return all.find((x) => x.id !== exceptId && x.vet === vet && x.date === date && x.time === time && ACTIVE.indexOf(x.status) >= 0) || null;
  }
  return {
    load, change, add, ready, backend, conflict,
    get VETS() { return VETS; },
    get SERVICES() { return SERVICES; },
    getOwners: () => remoteOwners,
    STATUS, ORDER, ACTIVE, TBA
  };
})();
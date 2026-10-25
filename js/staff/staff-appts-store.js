/* Shared API access for staff and veterinary appointment workflows. */
window.PawStaffAppts = (() => {
  const STATUS = { pending: "Pending", confirmed: "Confirmed", checked_in: "Checked in", with_vet: "With vet", completed: "Completed", cancelled: "Cancelled", no_show: "No-show" };
  const ORDER = ["pending", "confirmed", "checked_in", "with_vet", "completed", "no_show", "cancelled"];
  const ACTIVE = ["pending", "confirmed", "checked_in", "with_vet"];
  const TBA = "To be assigned";
  const VETS = [];
  const SERVICES = [];
  let appointments = [];

  async function get(url, options) {
    const response = await fetch(url, {
      headers: { Accept: "application/json", ...(options && options.body ? { "Content-Type": "application/json" } : {}) },
      ...options
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Clinic request failed (${response.status}).`);
    }
    return response.status === 204 ? null : response.json();
  }

  async function load() {
    const [rows, veterinarians, services] = await Promise.all([
      get("/api/appointments"),
      get("/api/veterinarians"),
      get("/api/services")
    ]);
    appointments = rows.map((appointment) => ({
      ...appointment,
      id: String(appointment.id),
      ownerId: appointment.ownerId,
      date: String(appointment.date).slice(0, 10),
      time: String(appointment.time || "00:00").slice(0, 5),
      walkIn: false
    }));
    VETS.splice(0, VETS.length, ...veterinarians.map((vet) => vet.name));
    SERVICES.splice(0, SERVICES.length, ...services.map((service) => service.name));
    return appointments.slice();
  }

  async function owners() {
    return get("/api/owners");
  }

  async function pets(ownerId) {
    return get(`/api/pets/owner/${encodeURIComponent(ownerId)}`);
  }

  async function createWalkIn(data) {
    const result = await get("/api/owners/walk-in", {
      method: "POST",
      body: JSON.stringify(data)
    });
    return result.owner;
  }

  async function change(appointment, patch) {
    const result = await get(`/api/appointments/${encodeURIComponent(appointment.id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch)
    });
    Object.assign(appointment, patch);
    if (result && result.appointment && result.appointment.status) {
      appointment.status = result.appointment.status;
    }
    return appointment;
  }

  async function add(ownerId, data) {
    const result = await get("/api/appointments", {
      method: "POST",
      body: JSON.stringify({
        pet_id: data.petId,
        veterinarian_name: data.vet && data.vet !== TBA ? data.vet : null,
        appointment_date: data.date,
        appointment_time: data.time,
        reason: data.reason || null,
        services: (data.services || []).map((service) => ({
          service_name: service.name,
          quantity: service.qty || service.quantity || 1
        })),
        owner_id: ownerId
      })
    });
    const rows = await load();
    return rows.find((appointment) => String(appointment.id) === String(result.appointmentId)) || result;
  }

  function conflict(all, vet, date, time, exceptId) {
    if (!vet || vet === TBA || !date || !time) return null;
    return all.find((appointment) => String(appointment.id) !== String(exceptId) &&
      appointment.vet === vet && appointment.date === date &&
      appointment.time === time && ACTIVE.includes(appointment.status)) || null;
  }

  function notify() {}
  function notifyVet() {}
  function vetChanged() {}

  return { load, owners, pets, createWalkIn, change, add, conflict, notify, notifyVet, vetChanged, VETS, SERVICES, STATUS, ORDER, ACTIVE, TBA };
})();

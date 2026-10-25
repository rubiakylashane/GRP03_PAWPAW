window.PawAppts = (() => {
  let appointments = [];

  function ownerId() {
    const user = JSON.parse(sessionStorage.getItem("pawpaw_user") || "null");
    if (!user || !user.ownerId) throw new Error("The signed-in account has no owner profile.");
    return user.ownerId;
  }

  function normalize(appointment) {
    return {
      ...appointment,
      id: String(appointment.id),
      date: String(appointment.date).slice(0, 10),
      time: String(appointment.time || "00:00").slice(0, 5),
      declineReason: appointment.cancellationReason || "",
      rescheduleReason: appointment.rescheduleReason || "",
      rescheduledFrom: appointment.rescheduledFromDate
        ? { date: String(appointment.rescheduledFromDate).slice(0, 10), time: String(appointment.rescheduledFromTime || "").slice(0, 5) }
        : null
    };
  }

  async function request(url, options) {
    const response = await fetch(url, {
      headers: { Accept: "application/json", ...(options && options.body ? { "Content-Type": "application/json" } : {}) },
      ...options
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Appointment request failed (${response.status}).`);
    }
    return response.status === 204 ? null : response.json();
  }

  async function load() {
    const result = await request(`/api/appointments/owner/${encodeURIComponent(ownerId())}`);
    appointments = result.map(normalize);
    return appointments.slice();
  }

  async function get(id) {
    const list = await load();
    return list.find((appointment) => appointment.id === String(id)) || null;
  }

  async function add(appointment) {
    const result = await request("/api/appointments", {
      method: "POST",
      body: JSON.stringify(appointment)
    });
    await load();
    return appointments.find((item) => item.id === String(result.appointmentId)) || result;
  }

  async function update(id, patch) {
    await request(`/api/appointments/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch)
    });
    return get(id);
  }

  return { load, get, add, update };
})();

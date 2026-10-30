/* js/staff/vaccine-book.js - route vaccine reminders into the live booking flow. */
(async () => {
  const A = window.PawStaffAppts, S = window.PawStaff;
  const qs = new URLSearchParams(location.search);
  const owner = qs.get("owner") || "";
  const petId = qs.get("petid") || "";
  try {
    await A.ready;
    const vaccination = (await window.PawApi.request("/api/services")).find((service) => /vaccin/i.test(service.name));
    if (!vaccination) throw new Error("No active vaccination service is configured by the clinic.");
    const destination = /[\\/]owner[\\/]/i.test(location.pathname)
      ? `book-appointment.html?service=${encodeURIComponent(vaccination.id)}&pet=${encodeURIComponent(petId)}`
      : `appointments.html?owner=${encodeURIComponent(owner)}&petid=${encodeURIComponent(petId)}&service=${encodeURIComponent(vaccination.name)}`;
    location.replace(destination);
  } catch (error) {
    S.toast(error.message || "Clinic services could not be loaded.");
  }
})();

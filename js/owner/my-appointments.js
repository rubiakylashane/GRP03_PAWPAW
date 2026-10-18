/* js/owner/my-appointments.js
   My Appointments: list, search, sort, cancel. Reschedule opens reschedule-appointment.html.
   Needs pets-store.js (esc) and appts-store.js loaded first. */
(() => {
  const { esc } = window.PawPets;
  const Appts = window.PawAppts;
  const $ = (id) => document.getElementById(id);

  const rowsEl = $("rows"), search = $("search"), sortEl = $("sort");
  const dialog = $("cancel-dialog"), toast = $("toast");

  const pad = (n) => String(n).padStart(2, "0");
  const longDate = (iso) => new Date(iso + "T00:00:00")
    .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  function time12(hhmm) {
    const [h24, m] = (hhmm || "00:00").split(":").map(Number);
    const h = h24 % 12 === 0 ? 12 : h24 % 12;
    return h + ":" + pad(m) + " " + (h24 < 12 ? "AM" : "PM");
  }
  const label = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const STATUS_ORDER = { confirmed: 0, pending: 1, cancelled: 2 };

  function services(a) {
    const names = (a.services || []).map((l) => l.name);
    if (!names.length) return "-";
    return names.length > 2 ? names.slice(0, 2).join(", ") + " +" + (names.length - 2) : names.join(", ");
  }

  function row(a) {
    const done = a.status === "cancelled";
    const actions = done
      ? `<span class="ma-none">-</span>`
      : `<a class="abtn abtn-outline ma-btn" href="reschedule-appointment.html?id=${encodeURIComponent(a.id)}">Reschedule</a>
         <button type="button" class="abtn abtn-cancel ma-btn" data-cancel="${esc(a.id)}">Cancel</button>`;
    return `
      <div class="ma-row" role="row">
        <span role="cell"><strong>${esc(longDate(a.date))}</strong><small>${esc(time12(a.time))}</small></span>
        <span role="cell"><strong>${esc(a.petName)}</strong><small>${esc(a.vet || "To be assigned")}</small></span>
        <span role="cell" class="ma-services" title="${esc((a.services || []).map((l) => l.name).join(", "))}">${esc(services(a))}</span>
        <span role="cell" class="ma-c"><span class="ma-pill ma-${esc(a.status)}">${esc(label(a.status))}</span></span>
        <span role="cell" class="ma-c ma-actions">${actions}</span>
      </div>`;
  }

  function visible() {
    const q = search.value.trim().toLowerCase();
    let list = Appts.load();
    if (q) {
      list = list.filter((a) => [a.petName, a.vet, a.status, longDate(a.date), (a.services || []).map((l) => l.name).join(" ")]
        .join(" ").toLowerCase().includes(q));
    }
    const key = (a) => a.date + " " + a.time;
    const by = {
      soon: (a, b) => key(a).localeCompare(key(b)),
      late: (a, b) => key(b).localeCompare(key(a)),
      status: (a, b) => (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) || key(a).localeCompare(key(b)),
      pet: (a, b) => a.petName.localeCompare(b.petName) || key(a).localeCompare(key(b))
    };
    return list.sort(by[sortEl.value] || by.soon);
  }

  function render() {
    const all = Appts.load();
    const list = visible();
    rowsEl.innerHTML = list.length
      ? list.map(row).join("")
      : `<div class="ma-empty">${all.length
          ? "No appointments match your search."
          : `No appointments yet. <a href="book-appointment.html">Book an appointment</a>`}</div>`;
  }

  /* ----- Cancel ----- */
  let cancelId = null;
  rowsEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-cancel]");
    if (!btn) return;
    const a = Appts.get(btn.dataset.cancel);
    if (!a) return;
    cancelId = a.id;
    $("cancel-text").textContent = a.petName + " · " + longDate(a.date) + ", " + time12(a.time);
    if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
  });
  $("cancel-keep").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
  $("cancel-yes").addEventListener("click", () => {
    if (cancelId) Appts.update(cancelId, { status: "cancelled" });
    cancelId = null;
    dialog.close();
    render();
    showToast("Appointment cancelled.");
  });

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2800);
  }

  search.addEventListener("input", render);
  sortEl.addEventListener("change", render);

  render();
  try {
    const m = sessionStorage.getItem("pawpaw_flash");
    if (m) { sessionStorage.removeItem("pawpaw_flash"); showToast(m); }
  } catch (_) { /* ignore */ }
})();
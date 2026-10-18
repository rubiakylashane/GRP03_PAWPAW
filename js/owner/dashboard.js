/* js/owner/dashboard.js
   Sample data is used until the backend is ready.
   Set USE_BACKEND = true and edit API to load real data. */
(() => {
  const USE_BACKEND = false;
  const API = {
    me: "/api/me",                          // { name, avatar }
    appointments: "/api/appointments",      // [{ date, time, pet, doctor, service, status }]
    pets: "/api/pets",                      // [{ name, species, breed, photo }]
    overdue: "/api/vaccinations/overdue"    // [{ pet, photo }]
  };

  /* ---------- Demo data (NOT used now, kept for testing the layout) ---------- */
  const DEMO_DATA = {
    user: { name: "User", avatar: "" },
    appointments: [
      { date: "2026-10-20", time: "09:00", pet: "Bruno",  doctor: "Dr. Maria Santos", service: "Checkup",     status: "confirmed" },
      { date: "2026-10-24", time: "14:30", pet: "Luna",   doctor: "Dr. Jose Reyes",   service: "Vaccination", status: "confirmed" },
      { date: "2026-10-27", time: "10:00", pet: "Bruno",  doctor: "Dr. Maria Santos", service: "Grooming",    status: "pending" },
      { date: "2026-10-30", time: "16:00", pet: "Milo",   doctor: "Dr. Jose Reyes",   service: "Dental",      status: "pending" }
    ],
    pets: [
      { name: "Bruno", species: "Dog", breed: "Aspin",       photo: "" },
      { name: "Luna",  species: "Cat", breed: "Puspin",      photo: "" },
      { name: "Milo",  species: "Dog", breed: "Shih Tzu",    photo: "" }
    ],
    overdue: [
      { pet: "Bruno", photo: "" },
      { pet: "Milo",  photo: "" }
    ]
  };

  const $ = (id) => document.getElementById(id);

  // Empty for now: a new user has no appointments, pets or vaccinations yet.
  // To preview the filled layout, replace this with: const SAMPLE = DEMO_DATA;
  const SAMPLE = {
    user: { name: "User", avatar: "" },
    appointments: [],
    pets: [],
    overdue: []
  };

  // Pets added on the Add pet page (saved by pets-store.js in demo mode)
  try { if (window.PawPets) SAMPLE.pets = window.PawPets.load(); } catch (_) {}

  // Name saved by login.js (demo mode)
  (function () {
    for (const store of ["sessionStorage", "localStorage"]) {
      try {
        const saved = JSON.parse(window[store].getItem("pawpaw_user") || "null");
        if (saved && saved.name) { SAMPLE.user.name = saved.name; return; }
      } catch (_) {}
    }
  })();
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  async function get(url) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("Request failed: " + url);
    return res.json();
  }

  async function loadData() {
    if (!USE_BACKEND) return SAMPLE;
    try {
      const [user, appointments, pets, overdue] = await Promise.all([
        get(API.me), get(API.appointments), get(API.pets), get(API.overdue)
      ]);
      return { user, appointments, pets, overdue };
    } catch (err) {
      console.warn("[dashboard] backend failed, using sample data:", err.message);
      return SAMPLE;
    }
  }

  /* ---------- Formatting ---------- */
  function fmtDate(iso) {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  }
  function fmtTime(hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    const d = new Date(2000, 0, 1, h, m);
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  }
  const label = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  /* ---------- Renderers ---------- */
  function appointmentRow(a) {
    return `
      <div class="row" role="row">
        <span role="cell">
          <span class="cell-main">${esc(fmtDate(a.date))}</span>
          <span class="cell-sub">${esc(fmtTime(a.time))}</span>
        </span>
        <span role="cell">
          <span class="cell-main">${esc(a.pet)}</span>
          <span class="cell-sub">${esc(a.doctor)}</span>
        </span>
        <span role="cell" class="cell-service">${esc(a.service)}</span>
        <span role="cell" class="status-cell">
          <span class="pill pill-${esc(a.status)}">${esc(label(a.status))}</span>
        </span>
      </div>`;
  }

  function fillRows(id, items, emptyText) {
    $(id).innerHTML = items.length
      ? items.map(appointmentRow).join("")
      : `<p class="empty">${emptyText}</p>`;
  }

  function thumb(photo) {
    // inline size/position so the picture shows whatever the page CSS says
    return `<span class="list-thumb"${photo ? ` style="background-image:url('${esc(photo)}');background-size:cover;background-position:center;background-repeat:no-repeat"` : ""}></span>`;
  }

  function render(data) {
    const name = SAMPLE.user.name !== "User" ? SAMPLE.user.name : (data.user.name || "User");
    $("greeting-name").textContent = name;
    $("sidebar-name").textContent = name;
    if (data.user.avatar) $("user-avatar").style.backgroundImage = `url('${data.user.avatar}')`;

    $("today").textContent = new Date().toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric"
    });

    const byDate = (a, b) => (a.date + a.time).localeCompare(b.date + b.time);
    const upcoming = data.appointments.filter((a) => a.status === "confirmed").sort(byDate);
    const pending = data.appointments.filter((a) => a.status === "pending").sort(byDate);

    $("stat-upcoming").textContent = upcoming.length;
    $("stat-pending").textContent = pending.length;
    $("stat-overdue").textContent = data.overdue.length;
    $("stat-pets").textContent = data.pets.length;

    fillRows("upcoming-rows", upcoming.slice(0, 3), "No upcoming appointments.");
    fillRows("pending-rows", pending.slice(0, 3), "No pending requests.");

    $("pets-list").innerHTML = data.pets.length
      ? data.pets.slice(0, 3).map((p) => `
          <li>${thumb(p.photo)}
            <div><strong>${esc(p.name)}</strong><small>${esc(p.species)} - ${esc(p.breed)}</small></div>
          </li>`).join("")
      : `<li class="empty">No pets yet. Click "Add pet" to get started.</li>`;

    $("vax-list").innerHTML = data.overdue.length
      ? data.overdue.slice(0, 3).map((v) => `
          <li>${thumb(v.photo)}
            <div><strong>${esc(v.pet)}</strong><small>Missed Vaccination</small></div>
          </li>`).join("")
      : `<li class="empty">No overdue vaccinations.</li>`;
  }

  /* ---------- Mobile menu ---------- */
  const sidebar = $("sidebar"), overlay = $("overlay"), menuBtn = $("menu-btn");
  function setMenu(open) {
    sidebar.classList.toggle("open", open);
    overlay.classList.toggle("show", open);
    menuBtn.setAttribute("aria-expanded", String(open));
  }
  menuBtn.addEventListener("click", () => setMenu(!sidebar.classList.contains("open")));
  overlay.addEventListener("click", () => setMenu(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });

  /* ---------- Logout ---------- */
  $("logout").addEventListener("click", () => {
    try { localStorage.removeItem("token"); localStorage.removeItem("pawpaw_user"); sessionStorage.clear(); } catch (_) {}
    // then follows href="login.html"
  });

  loadData().then(render);
})();
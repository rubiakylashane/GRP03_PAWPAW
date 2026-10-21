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

  // Appointments and vaccinations saved in demo mode (the staff pages update the same lists)
  const pad = (n) => String(n).padStart(2, "0");
  const todayIso = () => { const d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
  const readList = (base) => {
    let name = "guest";
    for (const store of ["sessionStorage", "localStorage"]) {
      try { const u = JSON.parse(window[store].getItem("pawpaw_user") || "null"); if (u && u.name) { name = String(u.name).trim().toLowerCase(); break; } } catch (_) {}
    }
    try { const v = JSON.parse(localStorage.getItem(base + ":" + name) || "null"); return Array.isArray(v) ? v : []; } catch (_) { return []; }
  };
  SAMPLE.appointments = readList("pawpaw_appointments").map((a) => ({
    date: a.date, time: a.time || "00:00", pet: a.petName || a.pet || "-",
    doctor: a.vet || a.doctor || "To be assigned",
    service: (a.services || []).map((x) => x.name).join(", ") || a.service || "-",
    status: a.status || "pending",
    note: a.status === "cancelled" ? (a.declineReason || "") : (a.rescheduleReason || "")
  }));
  SAMPLE.overdue = readList("pawpaw_vaccinations")
    .filter((r) => r.nextDue && r.nextDue < todayIso())
    .map((r) => { const p = SAMPLE.pets.find((x) => x.name === r.pet); return { pet: r.pet, photo: p ? p.photo : "" }; });

  // colours for the statuses the clinic staff can set
  (function () {
    const st = document.createElement("style");
    st.textContent = ".pill{display:inline-block;min-width:70px;padding:1px 12px;border-radius:999px;font-size:11px;line-height:1.6;text-align:center;color:#3a3a3a}"
      + ".pill-pending{background:var(--pill-yellow,#f6d98a)}.pill-confirmed{background:var(--pill-green,#a8dfb0)}.pill-cancelled{background:#f3b1b1}"
      + ".pill-checked_in{background:#f3e27a}.pill-with_vet{background:#9cc7ee}.pill-completed{background:#c9c9c9}.pill-no_show{background:#e3c4f0}"
      + ".cell-note{display:block;margin-top:3px;font-size:11px;line-height:1.3;color:#7a4a00}";
    document.head.appendChild(st);
  })();

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
  const label = (s) => ({ checked_in: "Checked in", with_vet: "With vet", no_show: "No-show" }[s] || s.charAt(0).toUpperCase() + s.slice(1));

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
          <span class="pill pill-${esc(a.status)}">${esc(label(a.status))}</span>${a.note ? `<span class="cell-note">${esc(a.note)}</span>` : ""}
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
    // profile picture: the one saved on Edit Profile (per user), else the one from the API
    let avatar = data.user.avatar || "";
    try {
      const prof = JSON.parse(localStorage.getItem("pawpaw_profile:" + String(name).trim().toLowerCase()) || "null");
      if (prof && prof.photo) avatar = prof.photo;
    } catch (_) { /* ignore */ }
    if (avatar) {
      const av = $("user-avatar");
      av.style.backgroundImage = `url('${avatar}')`;
      av.style.backgroundSize = "cover";
      av.style.backgroundPosition = "center";
      av.style.backgroundRepeat = "no-repeat";
    }

    $("today").textContent = new Date().toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric"
    });

    const byDate = (a, b) => (a.date + a.time).localeCompare(b.date + b.time);
    const today = todayIso();
    const upcoming = data.appointments.filter((a) => ["confirmed", "checked_in", "with_vet"].includes(a.status) && a.date >= today).sort(byDate);
    const pending = data.appointments.filter((a) => a.status === "pending").sort(byDate);
    // requests the clinic declined stay in this box so the owner can read the reason
    const declined = data.appointments.filter((a) => a.status === "cancelled" && a.note).sort(byDate).reverse();

    $("stat-upcoming").textContent = upcoming.length;
    $("stat-pending").textContent = pending.length;
    $("stat-overdue").textContent = data.overdue.length;
    $("stat-pets").textContent = data.pets.length;

    fillRows("upcoming-rows", upcoming.slice(0, 3), "No upcoming appointments.");
    fillRows("pending-rows", pending.concat(declined).slice(0, 3), "No pending requests.");

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
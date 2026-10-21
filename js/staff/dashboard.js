/* js/staff/dashboard.js
   Staff dashboard (demo mode).
   Reads the appointment requests that owners made (saved in this browser's localStorage by
   js/owner/appts-store.js, one list per owner: "pawpaw_appointments:<owner name>").
   Set USE_BACKEND = true and edit API when the backend is ready. */
(() => {
  const USE_BACKEND = false;
  const API = {
    appointments: "/api/staff/appointments",   // GET   -> [{ id, owner, petName, vet, date, time, services:[{name}], status, walkIn }]
    update: "/api/staff/appointments/"         // PATCH /:id  { status, vet }
  };
  const VETS = ["Dr. Maria Santos", "Dr. Jose Reyes"];
  const SHOW_DEMO = false; // true = fill the page with sample rows to preview the layout

  const KEY = "pawpaw_appointments:";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = (n) => String(n).padStart(2, "0");
  const todayIso = () => { const d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };

  /* ---------- Data ---------- */
  const DEMO = () => [
    { id: "d1", owner: "Ana", petName: "Bruno", vet: "Dr. Maria Santos", date: todayIso(), time: "09:00", services: [{ name: "Checkup" }], status: "confirmed" },
    { id: "d2", owner: "Ana", petName: "Luna", vet: "To be assigned", date: todayIso(), time: "10:30", services: [{ name: "Vaccination" }], status: "checked_in" },
    { id: "d3", owner: "Ben", petName: "Milo", vet: "Dr. Jose Reyes", date: todayIso(), time: "11:00", services: [{ name: "Grooming" }], status: "with_vet" },
    { id: "d4", owner: "Cara", petName: "Coco", vet: "To be assigned", date: todayIso(), time: "13:30", services: [{ name: "Deworming" }], status: "pending" },
    { id: "d5", owner: "Ben", petName: "Rex", vet: "To be assigned", date: todayIso(), time: "15:00", services: [{ name: "Dental" }], status: "pending" }
  ];
  let memory = [];

  function readAll() {
    if (SHOW_DEMO) return memory.length ? memory : (memory = DEMO());
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

  async function load() {
    if (!USE_BACKEND) return readAll();
    try {
      const res = await fetch(API.appointments, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error("Request failed");
      return await res.json();
    } catch (err) {
      console.warn("[staff dashboard] backend failed:", err.message);
      return [];
    }
  }

  /* save a change (status / vet) back to the owner's list */
  async function change(appt, patch) {
    if (USE_BACKEND) {
      try { await fetch(API.update + encodeURIComponent(appt.id), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }); }
      catch (err) { console.warn(err); }
    } else if (SHOW_DEMO) {
      Object.assign(memory.find((a) => a.id === appt.id) || {}, patch);
    } else {
      try {
        const list = JSON.parse(localStorage.getItem(appt._key) || "[]");
        const i = list.findIndex((a) => a.id === appt.id);
        if (i >= 0) { list[i] = { ...list[i], ...patch, updatedAt: new Date().toISOString() }; localStorage.setItem(appt._key, JSON.stringify(list)); }
      } catch (_) { /* ignore */ }
    }
    Object.assign(appt, patch);
  }

  /* ---------- Formatting ---------- */
  function fmtTime(hhmm) {
    const [h, m] = String(hhmm || "00:00").split(":").map(Number);
    return new Date(2000, 0, 1, h, m).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }).replace(" ", "");
  }
  function fmtDate(iso) {
    return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }
  const serviceText = (a) => (a.services || []).map((s) => s.name).join(", ") || a.service || "-";
  const STATUS = { confirmed: "Confirmed", checked_in: "Checked in", with_vet: "With vet" };

  /* ---------- Render ---------- */
  let all = [];

  function actionCell(a) {
    if (a.status === "confirmed") return `<button type="button" class="btn btn-primary" data-act="checkin" data-id="${esc(a.id)}">Check In</button>`;
    if (a.status === "checked_in") return `<button type="button" class="btn btn-outline" data-act="assign" data-id="${esc(a.id)}">Assign Vet</button>`;
    return `<span>With Vet</span>`;
  }

  function todayRow(a) {
    return `
      <div class="row" role="row">
        <span role="cell" class="c-time">${esc(fmtTime(a.time))}</span>
        <span role="cell"><span class="cell-main">${esc(a.petName || a.pet)}</span><span class="cell-sub">${esc(a.vet || "To be assigned")}</span></span>
        <span role="cell" class="c-service">${esc(serviceText(a))}</span>
        <span role="cell"><span class="pill pill-${esc(a.status)}">${esc(STATUS[a.status] || a.status)}</span></span>
        <span role="cell" class="c-action">${actionCell(a)}</span>
      </div>`;
  }

  function pendingItem(a) {
    return `
      <div class="req">
        <p class="req-title"><strong>${esc(a.petName || a.pet)}</strong> - ${esc(a.owner || "Owner")}</p>
        <p class="req-sub">${esc(fmtDate(a.date))} (${esc(fmtTime(a.time))}) - ${esc(serviceText(a))}</p>
        <div class="req-actions">
          <button type="button" class="btn btn-primary" data-act="approve" data-id="${esc(a.id)}">Approve</button>
          <button type="button" class="btn btn-outline" data-act="review" data-id="${esc(a.id)}">Review</button>
        </div>
      </div>`;
  }

  function render() {
    const today = todayIso();
    const byTime = (a, b) => String(a.time).localeCompare(String(b.time));
    const todays = all.filter((a) => a.date === today && STATUS[a.status]).sort(byTime);
    const pending = all.filter((a) => a.status === "pending").sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

    $("stat-today").textContent = todays.length;
    $("stat-pending").textContent = pending.length;
    $("stat-walkins").textContent = all.filter((a) => a.date === today && a.walkIn && a.status !== "cancelled").length;
    $("stat-checkedin").textContent = all.filter((a) => a.date === today && a.status === "checked_in").length;

    $("today-rows").innerHTML = todays.length
      ? todays.map(todayRow).join("")
      : `<p class="empty">No appointments today.</p>`;
    $("pending-list").innerHTML = pending.length
      ? pending.slice(0, 3).map(pendingItem).join("")
      : `<p class="empty">No pending requests.</p>`;
  }

  /* ---------- Actions ---------- */
  const toast = $("toast");
  let toastTimer;
  function say(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
  }
  const find = (id) => all.find((a) => String(a.id) === String(id));

  const reviewDlg = $("review-dialog"), vetDlg = $("vet-dialog");
  let current = null;

  function openReview(a) {
    current = a;
    const rows = [
      ["Pet", a.petName || a.pet], ["Owner", a.owner || "-"], ["Date", fmtDate(a.date)], ["Time", fmtTime(a.time)],
      ["Vet", a.vet || "To be assigned"], ["Services", serviceText(a)], ["Reason", a.reason || "-"],
      ["Estimated", a.total != null ? "₱" + Number(a.total).toLocaleString("en-US") : "-"]
    ];
    $("review-facts").innerHTML = rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
    reviewDlg.showModal();
  }

  function openVet(a) {
    current = a;
    $("vet-sub").textContent = (a.petName || a.pet) + " - " + (a.owner || "");
    const sel = $("vet-select");
    sel.innerHTML = VETS.map((v) => `<option>${esc(v)}</option>`).join("");
    if (VETS.includes(a.vet)) sel.value = a.vet;
    vetDlg.showModal();
  }

  async function approve(a) { await change(a, { status: "confirmed" }); render(); say("Request approved."); }

  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const a = find(b.dataset.id);
    if (!a) return;
    if (b.dataset.act === "approve") approve(a);
    else if (b.dataset.act === "review") openReview(a);
    else if (b.dataset.act === "assign") openVet(a);
    else if (b.dataset.act === "checkin") { await change(a, { status: "checked_in" }); render(); say(a.petName + " checked in."); }
  });

  $("review-close").addEventListener("click", () => reviewDlg.close());
  $("review-approve").addEventListener("click", async () => { reviewDlg.close(); await approve(current); });
  $("review-decline").addEventListener("click", async () => {
    reviewDlg.close();
    await change(current, { status: "cancelled" });
    render(); say("Request declined.");
  });
  $("vet-cancel").addEventListener("click", () => vetDlg.close());
  $("vet-save").addEventListener("click", async () => {
    const vet = $("vet-select").value;
    vetDlg.close();
    await change(current, { vet, status: "with_vet" });
    render(); say("Assigned to " + vet + ".");
  });

  /* ---------- Page chrome ---------- */
  $("today").textContent = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  for (const store of ["sessionStorage", "localStorage"]) {
    try {
      const u = JSON.parse(window[store].getItem("pawpaw_user") || "null");
      if (u && u.name) { $("sidebar-name").textContent = u.name; break; }
    } catch (_) { /* ignore */ }
  }

  const sidebar = $("sidebar"), overlay = $("overlay"), menuBtn = $("menu-btn");
  const setMenu = (open) => {
    sidebar.classList.toggle("open", open);
    overlay.classList.toggle("show", open);
    menuBtn.setAttribute("aria-expanded", String(open));
  };
  menuBtn.addEventListener("click", () => setMenu(!sidebar.classList.contains("open")));
  overlay.addEventListener("click", () => setMenu(false));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });

  $("logout").addEventListener("click", () => {
    try { localStorage.removeItem("token"); localStorage.removeItem("pawpaw_user"); sessionStorage.clear(); } catch (_) { /* ignore */ }
  });

  load().then((list) => { all = list; render(); });
})();
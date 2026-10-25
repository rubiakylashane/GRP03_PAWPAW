/* js/staff/dashboard.js - appointment dashboard backed by the clinic API. */
(() => {
  const A = window.PawStaffAppts;
  const VETS = A.VETS;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = (n) => String(n).padStart(2, "0");
  const todayIso = () => { const d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };

  /* ---------- Data ---------- */
  async function load() { return A.load(); }

  async function change(appt, patch) {
    return A.change(appt, patch);
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
  const vetOf = (a) => a.vet || "To be assigned";
  const hint = (el, c) => { el.textContent = c ? "Warning: " + vetOf(c) + " already has " + (c.petName || c.pet) + " at this time." : ""; el.className = "dlg-hint" + (c ? " bad" : ""); };

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
        <p class="req-title"><strong>${esc(a.petName || a.pet)}</strong> - ${esc(a.owner || "Owner")}${a.rescheduledFrom ? ` <span class="resch-tag" title="Was ${esc(a.rescheduledFrom.date)} ${esc(a.rescheduledFrom.time)}">Rescheduled</span>` : ""}</p>
        <p class="req-sub">${esc(fmtDate(a.date))} (${esc(fmtTime(a.time))}) - ${esc(serviceText(a))}</p>
        <div class="req-actions">
          <button type="button" class="btn btn-primary" data-act="approve" data-id="${esc(a.id)}">Approve</button>
          <button type="button" class="btn btn-outline" data-act="review" data-id="${esc(a.id)}">Review</button>
        </div>
      </div>`;
  }

  /* "Today: 4 appointments • Vaccination ×2 • Laboratory Test ×1": how many, and which services (cancelled ones are left out) */
  function todaySummary(list, noun) {
    const rows = list.filter((a) => a.status !== "cancelled"), n = {};
    rows.forEach((a) => { [...new Set((a.services || []).map((l) => String(l.name || "").split(" (")[0]).filter(Boolean))].forEach((s) => { n[s] = (n[s] || 0) + 1; }); });
    const parts = Object.keys(n).sort((x, y) => n[y] - n[x]).slice(0, 3).map((s) => s + " \u00D7" + n[s]);
    return rows.length ? "Today: " + rows.length + " " + (rows.length === 1 ? noun[0] : noun[1]) + (parts.length ? " \u2022 " + parts.join(" \u2022 ") : "") : "No " + noun[1] + " today.";
  }

  function render() {
    const today = todayIso();
    const byTime = (a, b) => String(a.time).localeCompare(String(b.time));
    const todays = all.filter((a) => a.date === today && STATUS[a.status]).sort(byTime);
    const pending = all.filter((a) => a.status === "pending").sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

    $("stat-today").textContent = todays.length;
    $("today-sum").textContent = todaySummary(todays, ["appointment", "appointments"]);
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
  function reportActionError(error) {
    console.error("Staff action failed:", error);
    say(error.message || "The change could not be saved. Please try again.");
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
    const sel = $("review-vet");
    sel.innerHTML = VETS.map((v) => `<option>${esc(v)}</option>`).join("");
    if (VETS.includes(a.vet)) sel.value = a.vet;
    $("review-reason").value = "";
    checkReview();
    reviewDlg.showModal();
  }

  const checkReview = () => A && hint($("review-hint"), A.conflict(all, $("review-vet").value, current.date, current.time, current.id));
  const checkVet = () => A && hint($("vet-hint"), A.conflict(all, $("vet-select").value, current.date, current.time, current.id));
  $("review-vet").addEventListener("change", checkReview);
  $("vet-select").addEventListener("change", checkVet);

  function openVet(a) {
    current = a;
    $("vet-sub").textContent = (a.petName || a.pet) + " - " + (a.owner || "");
    const sel = $("vet-select");
    sel.innerHTML = VETS.map((v) => `<option>${esc(v)}</option>`).join("");
    if (VETS.includes(a.vet)) sel.value = a.vet;
    checkVet();
    vetDlg.showModal();
  }

  async function approve(a, vet) {
    const patch = { status: "confirmed" };
    if (vet) patch.vet = vet;
    await change(a, patch); render(); say("Request approved.");
  }

  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const a = find(b.dataset.id);
    if (!a) return;
    if (b.dataset.act === "approve") openReview(a);
    else if (b.dataset.act === "review") openReview(a);
    else if (b.dataset.act === "assign") openVet(a);
    else if (b.dataset.act === "checkin") {
      try { await change(a, { status: "checked_in" }); render(); say(a.petName + " checked in."); }
      catch (error) { reportActionError(error); }
    }
  });

  $("review-close").addEventListener("click", () => reviewDlg.close());
  $("review-approve").addEventListener("click", async () => {
    reviewDlg.close();
    try { await approve(current, $("review-vet").value); } catch (error) { reportActionError(error); }
  });
  $("review-decline").addEventListener("click", async () => {
    const reason = $("review-reason").value.trim();
    reviewDlg.close();
    try {
      await change(current, { status: "cancelled", declineReason: reason });
      render(); say("Request declined.");
    } catch (error) { reportActionError(error); }
  });
  $("vet-cancel").addEventListener("click", () => vetDlg.close());
  $("vet-save").addEventListener("click", async () => {
    const vet = $("vet-select").value;
    vetDlg.close();
    try {
      await change(current, { vet, status: "with_vet" });
      render(); say("Assigned to " + vet + ".");
    } catch (error) { reportActionError(error); }
  });

  /* ---------- Page chrome ---------- */
  /* greeting with the signed-in name: "Good morning, Maria" */
  (() => {
    let name = "";
    for (const store of ["sessionStorage", "localStorage"]) {
      try { const u = JSON.parse(window[store].getItem("pawpaw_user") || "null"); if (u && u.name) { name = String(u.name).trim(); break; } } catch (_) { /* ignore */ }
    }
    if (name && name === name.toLowerCase()) name = name.charAt(0).toUpperCase() + name.slice(1);
    const h = new Date().getHours();
    $("greeting").textContent = (h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening") + (name ? ", " + name : "");
  })();
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

  load().then((list) => { all = list; render(); }).catch((error) => {
    console.error("Could not load staff appointments:", error);
    $("today-rows").innerHTML = '<p class="empty">Appointments could not be loaded. Please refresh and try again.</p>';
    $("pending-list").innerHTML = '<p class="empty">Appointments could not be loaded.</p>';
  });
})();
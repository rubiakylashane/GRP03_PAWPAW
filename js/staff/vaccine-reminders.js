/* js/staff/vaccine-reminders.js - staff Vaccination Reminder list backed by clinic records. */
(() => {
  const O = window.PawOwners, S = window.PawStaff, $ = (id) => document.getElementById(id), esc = O.esc;
  const SOON = 30;                                  // days: orange when due within this many days

  let all = [];

  const midnight = (iso) => new Date(iso + "T00:00:00");
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const daysTo = (iso) => Math.round((midnight(iso) - now) / 86400000);
  const ownerOf = (r) => ({ short: r.owner, name: r.owner, phone: r.phone || "" });
  const fmtDate = (iso) => midnight(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const plural = (n) => n + (n === 1 ? " day" : " days");

  function status(r) {
    const d = daysTo(r.nextDue);
    if (d < 0) return { cls: "red", text: "Overdue for " + plural(-d) };
    if (d === 0) return { cls: "orange", text: "Due today" };
    return { cls: d <= SOON ? "orange" : "green", text: "Upcoming in " + plural(d) };
  }

  const sorters = {
    due: (a, b) => a.nextDue.localeCompare(b.nextDue),
    overdue: (a, b) => (daysTo(a.nextDue) < 0 ? 0 : 1) - (daysTo(b.nextDue) < 0 ? 0 : 1) || a.nextDue.localeCompare(b.nextDue),
    pet: (a, b) => String(a.pet).localeCompare(String(b.pet)),
    vaccine: (a, b) => String(a.vaccine).localeCompare(String(b.vaccine))
  };

  function row(r) {
    const o = ownerOf(r), st = status(r);
    const phone = o.phone || "";
    const q = "owner=" + encodeURIComponent(r.ownerId) + "&petid=" + encodeURIComponent(r.petId || "") + "&pet=" + encodeURIComponent(r.pet || "") + "&vaccine=" + encodeURIComponent(r.vaccine || "");
    return `
      <div class="orow vrow" role="row">
        <span role="cell">${esc(r.vaccine || "-")}</span>
        <span role="cell"><span class="o-name">${esc(r.pet || "-")}</span><span class="o-email">${esc(o.short || o.name || r.owner)}</span></span>
        <span role="cell">${phone ? esc(phone) : '<span class="a-muted">No number</span>'}</span>
        <span role="cell">${esc(fmtDate(r.nextDue))}</span>
        <span role="cell"><span class="vpill vpill-${st.cls}">${esc(st.text)}</span>${r.lastRemindedAt ? `<span class="v-sent">Reminded ${esc(fmtDate(r.lastRemindedAt.slice(0, 10)))}</span>` : ""}</span>
        <span role="cell" class="v-actions">
          <button type="button" class="obtn obtn-green obtn-sm" data-remind="${esc(r.id)}">${r.lastRemindedAt ? "Send Again" : "Send Reminder"}</button>
          <a class="obtn obtn-outline obtn-sm" href="vaccine-book.html?${q}">Book a visit</a>
        </span>
      </div>`;
  }

  function render() {
    const q = $("search").value.trim().toLowerCase();
    const list = all
      .filter((r) => !q || [r.vaccine, r.pet, ownerOf(r).short, ownerOf(r).phone, status(r).text].join(" ").toLowerCase().includes(q))
      .sort(sorters[$("sort").value] || sorters.due);
    $("vx-rows").innerHTML = list.length ? list.map(row).join("")
      : `<p class="o-empty">${all.length ? "No reminders match your search." : "No vaccination reminders yet. They appear once a vaccination record has a next due date."}</p>`;
  }

  async function remind(r, btn) {
    btn.disabled = true;
    let sentAt = new Date().toISOString();
    try {
      const response = await fetch("/api/vaccinations/reminders/" + encodeURIComponent(r.id) + "/notify", {
        method: "POST", headers: { Accept: "application/json" }
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not send the reminder.");
      sentAt = result.lastRemindedAt || sentAt;
      r.lastRemindedAt = sentAt; render();
      S.toast("Reminder sent to " + (ownerOf(r).short || r.owner) + ".");
    } catch (err) {
      console.error("Could not send vaccination reminder:", err);
      btn.disabled = false; S.toast(err.message || "Could not send the reminder. Try again.");
    }
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-remind]");
    if (b) { const r = all.find((x) => x.id === b.dataset.remind); if (r) remind(r, b); }
  });
  $("search").addEventListener("input", render);
  $("sort").addEventListener("change", render);
  fetch("/api/vaccinations/reminders", { headers: { Accept: "application/json" } })
    .then(async (response) => {
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not load vaccination reminders.");
      all = result; render();
    })
    .catch((error) => {
      console.error("Could not load vaccination reminders:", error);
      $("vx-rows").innerHTML = '<p class="o-empty">Vaccination reminders could not be loaded. Please refresh and try again.</p>';
    });
})();

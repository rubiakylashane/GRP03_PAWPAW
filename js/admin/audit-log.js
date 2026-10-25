/* js/admin/audit-log.js - admin Audit Log (read-only)
   Reads "pawpaw_audit" (newest last): [ { at, user, role, action: create|update|delete, record, details, text } ]
   Written by admin-store.js (admin actions) and by audit() in owners-store.js, staff-appts-store.js and
   the owner's appts-store.js (staff, vet and owner actions).
   Backend: GET /api/audit-log?user=&action=&record=&from=&to=&page=   (the server writes the entries; there is no edit or delete endpoint)
            GET /api/audit-log/export.csv  with the same filters */
(() => {
  const $ = (id) => document.getElementById(id);
  const S = window.PawStaff, PAGE = 10;
  const ROLE = { admin: "Admin", staff: "Staff", vet: "Veterinarian", owner: "Owner" };
  const RECORDS = ["owner", "pet", "appointment", "medical_record", "prescription", "vaccination", "veterinarian", "user", "service"];
  const ACTIONS = { create: "CREATE", update: "UPDATE", delete: "DELETE" };

  const plain = (h) => String(h || "").replace(/<[^>]*>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").trim();
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* entries saved before this page existed only have { at, text }: work the other fields out of the sentence */
  function normal(e) {
    let user = e.user, details = e.details;
    if (!user || !details) {
      const m = String(e.text || "").match(/^<strong>(.*?)<\/strong>\s*([\s\S]*)$/);
      user = user || (m ? plain(m[1]) : "Unknown");
      const d = plain(m ? m[2] : e.text);
      details = details || (d.charAt(0).toUpperCase() + d.slice(1) + (/[.!?]$/.test(d) ? "" : "."));
    }
    const low = details.toLowerCase();
    const action = ACTIONS[e.action] ? e.action : /^(regist|add|creat|book|request)/.test(low) ? "create" : /^(delet|remov)/.test(low) ? "delete" : "update";
    const record = e.record || (/veterinarian/.test(low) ? "veterinarian" : /appointment/.test(low) ? "appointment" : /\bpet\b/.test(low) ? "pet" : /owner/.test(low) ? "owner" : /service/.test(low) ? "service" : "user");
    const role = String(e.role || (String(user).toLowerCase() === "admin" ? "admin" : "")).toLowerCase();
    return { at: e.at, t: Date.parse(e.at) || 0, user, role, action, record, details };
  }
  let all = [];
  let page = 1;
  const pad = (n) => String(n).padStart(2, "0");
  const dayOf = (t) => { const d = new Date(t); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };   // local date, to match the date pickers
  const fmtDate = (t) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const fmtTime = (t) => new Date(t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const recLabel = (r) => String(r || "").replace(/\s+/g, "_");

  /* filters
     "All users" lists every account (owners, staff, vets, admins from PawAdmin.list()) even if they have no entry yet,
     plus any name that is only found in the log (in the demo the log uses the username typed at login, e.g. "staff" or "vet"). */
  const A = window.PawAdmin;
  const people = [];
  const personOf = (name) => { const n = String(name).toLowerCase(); const i = people.findIndex((p) => p.keys.indexOf(n) >= 0); return i; };
  function populateFilters(users) {
    users.forEach((user) => people.push({
      label: user.name,
      role: user.role,
      keys: [String(user.name).toLowerCase(), String(user.username || "").toLowerCase()].filter(Boolean)
    }));
    all.forEach((entry) => {
      if (personOf(entry.user) < 0) people.push({ label: entry.user, role: entry.role, keys: [String(entry.user).toLowerCase()] });
    });
    const options = people.map((person, index) => ({
      index,
      label: person.label + (person.role && String(person.label).toLowerCase() !== String(ROLE[person.role] || person.role).toLowerCase()
        ? " (" + (ROLE[person.role] || person.role) + ")" : "")
    })).sort((a, b) => a.label.localeCompare(b.label));
    $("f-user").innerHTML = '<option value="">All users</option>' + options.map((option) => `<option value="${option.index}">${esc(option.label)}</option>`).join("");
    $("f-action").innerHTML = '<option value="">All actions</option>' + Object.keys(ACTIONS).map((action) => `<option value="${action}">${action.charAt(0).toUpperCase() + action.slice(1)}</option>`).join("");
    const records = [...new Set([...RECORDS, ...all.map((entry) => entry.record)])];
    $("f-record").innerHTML = '<option value="">All records</option>' + records.map((record) => `<option value="${esc(record)}">${esc(recLabel(record))}</option>`).join("");
  }

  function filtered() {
    const u = $("f-user").value, a = $("f-action").value, r = $("f-record").value, from = $("f-from").value, to = $("f-to").value;
    const keys = u === "" ? null : people[+u].keys;
    return all.filter((e) => (!keys || keys.indexOf(String(e.user).toLowerCase()) >= 0) && (!a || e.action === a) && (!r || e.record === r)
      && (!from || dayOf(e.t) >= from) && (!to || dayOf(e.t) <= to));
  }

  function render() {
    const rows = filtered(), pages = Math.max(1, Math.ceil(rows.length / PAGE));
    if (page > pages) page = pages;
    const start = (page - 1) * PAGE, shown = rows.slice(start, start + PAGE);
    $("au-rows").innerHTML = shown.length ? shown.map((e) => `
      <div class="au-row" role="row">
        <span class="au-when"><b>${esc(fmtDate(e.t))}</b><i>${esc(fmtTime(e.t))}</i></span>
        <span class="au-who"><b>${esc(e.user)}</b>${e.role ? `<i>${esc(ROLE[e.role] || e.role)}</i>` : ""}</span>
        <span><span class="au-pill au-${e.action}">${ACTIONS[e.action]}</span></span>
        <span class="au-rec">${esc(recLabel(e.record))}</span>
        <span class="au-det">${esc(e.details)}</span>
      </div>`).join("")
      : `<p class="au-empty">${all.length ? "No entries match these filters." : "No activity has been recorded yet. Changes made in the clinic will show up here."}</p>`;
    $("au-count").textContent = rows.length ? `Showing ${start + 1} to ${start + shown.length} of ${rows.length} entries` : "Showing 0 of 0 entries";
    $("au-prev").disabled = page <= 1;
    $("au-next").disabled = page >= pages;
  }

  ["f-user", "f-action", "f-record", "f-from", "f-to"].forEach((id) => $(id).addEventListener("change", () => { page = 1; render(); }));
  $("au-prev").addEventListener("click", () => { if (page > 1) { page--; render(); } });
  $("au-next").addEventListener("click", () => { page++; render(); });

  /* export: the filtered rows (all pages) as a .csv that opens in Excel */
  const cell = (v) => {
    let t = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;                       // stops Excel from running a cell as a formula
    return '"' + t.replace(/"/g, '""') + '"';
  };
  $("export-btn").addEventListener("click", () => {
    const rows = filtered();
    if (!rows.length) return S.toast("Nothing to export with these filters.");
    const lines = [["Timestamp", "User", "Role", "Action", "Record type", "Details"].map(cell).join(",")];
    rows.forEach((e) => lines.push([fmtDate(e.t) + " " + fmtTime(e.t), e.user, ROLE[e.role] || e.role, ACTIONS[e.action], recLabel(e.record), e.details].map(cell).join(",")));
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "audit-log-" + dayOf(Date.now()) + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    S.toast("Exported " + rows.length + (rows.length === 1 ? " entry." : " entries."));
  });

  Promise.all([
    fetch("/api/admin/audit", { headers: { Accept: "application/json" } }).then(async (response) => {
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not load the audit log.");
      return result;
    }),
    fetch("/api/admin/users", { headers: { Accept: "application/json" } }).then(async (response) => {
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not load user accounts.");
      return result;
    })
  ]).then(([entries, users]) => {
    all = entries.map((entry, index) => ({ ...normal(entry), i: index }))
      .sort((a, b) => b.t - a.t || b.i - a.i);
    populateFilters(users);
    render();
  }).catch((error) => {
    console.error("Could not load the audit log:", error);
    $("au-rows").innerHTML = `<p class="au-empty">${esc(error.message || "Could not load the audit log.")}</p>`;
  });
})();
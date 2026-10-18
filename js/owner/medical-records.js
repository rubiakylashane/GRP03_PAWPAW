/* js/owner/medical-records.js
   Medical Records (read only for the owner): visit records and prescriptions of the signed-in user's pets.
   The vet / staff add the records. Set USE_BACKEND = true and edit API when the backend is ready. */
(() => {
  const USE_BACKEND = false;
  const API = {
    visits: "/api/medical-records",      // [{ id, pet, date, diagnosis, treatment, notes }]
    prescriptions: "/api/prescriptions"  // [{ id, pet, date, medication, dose, instructions, quantity }]
  };

  /* Demo storage: this browser's localStorage, one list per signed-in user.
     Shape: { visits: [...], prescriptions: [...] }  (empty until records are added) */
  const BASE = "pawpaw_records";
  function userKey() {
    let name = "guest";
    for (const store of ["sessionStorage", "localStorage"]) {
      try {
        const u = JSON.parse(window[store].getItem("pawpaw_user") || "null");
        if (u && u.name) { name = String(u.name).trim().toLowerCase(); break; }
      } catch (_) { /* ignore */ }
    }
    return BASE + ":" + name;
  }

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtDate = (iso) => {
    const d = new Date(iso + "T00:00:00");
    return isNaN(d) ? "" : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  };

  async function get(url) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("Request failed: " + url);
    return res.json();
  }
  async function loadData() {
    if (USE_BACKEND) {
      try {
        const [visits, prescriptions] = await Promise.all([get(API.visits), get(API.prescriptions)]);
        return { visits, prescriptions };
      } catch (err) { console.warn("[medical records] backend failed:", err.message); }
    }
    try {
      const v = JSON.parse(localStorage.getItem(userKey()) || "null");
      return { visits: (v && v.visits) || [], prescriptions: (v && v.prescriptions) || [] };
    } catch (_) { return { visits: [], prescriptions: [] }; }
  }

  let data = { visits: [], prescriptions: [] };
  const sortEl = $("sort");

  function sorted(list) {
    const by = {
      new: (a, b) => (b.date || "").localeCompare(a.date || ""),
      old: (a, b) => (a.date || "").localeCompare(b.date || ""),
      pet: (a, b) => String(a.pet).localeCompare(String(b.pet)) || (b.date || "").localeCompare(a.date || "")
    };
    return [...list].sort(by[sortEl.value] || by.new);
  }

  const cell = (label, html, cls = "") => `<span role="cell" class="${cls}" data-label="${label}">${html}</span>`;
  const dash = (s) => (s ? esc(s) : "-");

  function render() {
    $("visit-rows").innerHTML = data.visits.length
      ? sorted(data.visits).map((r) => `
          <div class="mr-row" role="row">
            ${cell("Pet", esc(r.pet), "mr-strong")}
            ${cell("Date", esc(fmtDate(r.date)), "mr-strong")}
            ${cell("Diagnosis", dash(r.diagnosis))}
            ${cell("Treatment", dash(r.treatment))}
            ${cell("Notes", dash(r.notes))}
          </div>`).join("")
      : `<p class="mr-empty">No visit records yet. They appear here after your pet's visit.</p>`;

    $("rx-rows").innerHTML = data.prescriptions.length
      ? sorted(data.prescriptions).map((r) => `
          <div class="mr-row" role="row">
            ${cell("Pet", esc(r.pet), "mr-strong")}
            ${cell("Date", esc(fmtDate(r.date)), "mr-strong")}
            ${cell("Medication", dash(r.medication))}
            ${cell("Dose", dash(r.dose))}
            ${cell("Instructions", dash(r.instructions))}
            ${cell("Quantity", dash(r.quantity))}
          </div>`).join("")
      : `<p class="mr-empty">No prescriptions yet.</p>`;
  }

  sortEl.addEventListener("change", render);
  loadData().then((d) => { data = d; render(); });
})();
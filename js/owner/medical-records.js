/* js/owner/medical-records.js
   Medical Records (read only for the owner): visit records and prescriptions of the signed-in user's pets. */
(() => {
  const API = {
    visits: "/api/medical-records",
    prescriptions: "/api/prescriptions"
  };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtDate = (iso) => {
    const d = new Date(iso + "T00:00:00");
    return isNaN(d) ? "" : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  };

  async function get(url) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Request failed (${res.status}): ${url}`);
    }
    return res.json();
  }
  async function loadData() {
    const [visits, prescriptions] = await Promise.all([get(API.visits), get(API.prescriptions)]);
    return { visits, prescriptions };
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
  loadData().then((d) => { data = d; render(); }).catch((error) => {
    console.error("Could not load medical records:", error);
    $("visit-rows").innerHTML = '<p class="mr-empty">Medical records could not be loaded. Please refresh and try again.</p>';
    $("rx-rows").innerHTML = '<p class="mr-empty">Prescriptions could not be loaded.</p>';
  });
})();
/* js/staff/medical-records.js - Staff view of persisted visit records and prescriptions.
   Open with ?q=<pet name> to start with the search filled in (used by Appointments > View Record). */
(() => {
  const O = window.PawOwners, $ = (id) => document.getElementById(id), esc = O.esc;
  const fmt = (iso) => { const d = new Date(iso + "T00:00:00"); return !iso || isNaN(d) ? "-" : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }); };

  let visits = [], rxs = [];
  const ownerNames = new Map();
  const ownerName = (key) => ownerNames.get(String(key)) || String(key || "-");
  async function load() {
    const response = await fetch("/api/medical-records/all", { headers: { Accept: "application/json" } });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Could not load medical records.");
    ownerNames.clear();
    visits = result.map((record) => {
      ownerNames.set(String(record.ownerId), record.owner);
      return {
        ...record, id: String(record.id), owner: record.ownerId,
        ownerDisplay: record.owner, date: record.date
      };
    });
    rxs = result.flatMap((record) => (record.prescriptions || []).map((prescription) => ({
      ...prescription, id: String(prescription.id), owner: record.ownerId,
      ownerDisplay: record.owner, petId: record.petId, pet: record.pet, date: record.date
    })));
  }

  /* opened from "View Record": only this owner's pet (matched by pet id; older records without an id by name) */
  const params = new URLSearchParams(location.search);
  let scope = params.get("owner") ? { owner: params.get("owner"), petId: params.get("petid") || "", name: params.get("q") || "" } : null;
  const inScope = (r) => !scope || (String(r.owner) === String(scope.owner) && (scope.petId && r.petId ? String(r.petId) === String(scope.petId) : !scope.name || r.pet === scope.name));
  function drawScope() {
    const el = $("scope"); if (!el) return;
    el.hidden = !scope;
    if (scope) el.innerHTML = `Showing records of <strong>${esc(scope.name || "this pet")}</strong> (${esc(ownerName(scope.owner))}) <button type="button" id="scope-clear">Show all</button>`;
  }
  const by = {
    new: (a, b) => (b.date || "").localeCompare(a.date || ""),
    old: (a, b) => (a.date || "").localeCompare(b.date || ""),
    pet: (a, b) => String(a.pet).localeCompare(String(b.pet)) || (b.date || "").localeCompare(a.date || "")
  };
  const cell = (t) => `<span role="cell" class="r-clip" title="${esc(t || "")}">${t ? esc(t) : '<span class="a-muted">-</span>'}</span>`;
  const who = (r) => `<span role="cell"><span class="o-name">${esc(r.pet)}</span><span class="o-email">${esc(ownerName(r.owner))}</span></span>`;

  function render() {
    drawScope();
    const q = $("search").value.trim().toLowerCase(), sort = by[$("sort").value] || by.new;
    const hit = (r) => inScope(r) && (!q || Object.values({ ...r, ownerName: ownerName(r.owner) }).join(" ").toLowerCase().includes(q));
    const v = visits.filter(hit).sort(sort), r = rxs.filter(hit).sort(sort);
    $("visit-rows").innerHTML = v.length ? v.map((x) => `
      <div class="orow rrow rrow-visit" role="row" tabindex="0" data-kind="v" data-id="${esc(x.id)}">
        ${who(x)}<span role="cell" class="o-name">${esc(fmt(x.date))}</span>${cell(x.diagnosis)}${cell(x.treatment)}${cell(x.notes)}
      </div>`).join("") : `<p class="o-empty">${visits.length ? "No visit records match your search." : "No visit records yet."}</p>`;
    $("rx-rows").innerHTML = r.length ? r.map((x) => `
      <div class="orow rrow rrow-rx" role="row" tabindex="0" data-kind="r" data-id="${esc(x.id)}">
        ${who(x)}<span role="cell" class="o-name">${esc(fmt(x.date))}</span>${cell(x.medication)}${cell(x.dose)}${cell(x.instructions)}${cell(x.quantity)}
      </div>`).join("") : `<p class="o-empty">${rxs.length ? "No prescriptions match your search." : "No prescriptions yet."}</p>`;
  }

  /* ----- details ----- */
  function details(kind, id) {
    const x = (kind === "v" ? visits : rxs).find((r) => r.id === id); if (!x) return;
    const rows = kind === "v"
      ? [["Pet", x.pet], ["Owner", ownerName(x.owner)], ["Date", fmt(x.date)], ["Diagnosis", x.diagnosis], ["Treatment", x.treatment], ["Notes", x.notes]]
      : [["Pet", x.pet], ["Owner", ownerName(x.owner)], ["Date", fmt(x.date)], ["Medication", x.medication], ["Dose", x.dose], ["Instructions", x.instructions], ["Quantity", x.quantity]];
    $("detail-title").textContent = kind === "v" ? "Visit record" : "Prescription";
    $("detail-facts").innerHTML = rows.map(([k, val]) => `<div><dt>${esc(k)}</dt><dd>${esc(val || "-")}</dd></div>`).join("");
    $("detail-dialog").showModal();
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) { e.target.closest("dialog").close(); return; }
    const r = e.target.closest("[data-kind]"); if (r) details(r.dataset.kind, r.dataset.id);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Enter") { const r = e.target.closest("[data-kind]"); if (r) details(r.dataset.kind, r.dataset.id); } });

  document.addEventListener("click", (e) => { if (e.target.id === "scope-clear") { scope = null; $("search").value = ""; render(); } });
  $("search").addEventListener("input", render);
  $("sort").addEventListener("change", render);
  if (!scope) { try { const q = params.get("q"); if (q) $("search").value = q; } catch (_) {} }
  load().then(render).catch((error) => {
    console.error("Could not load medical records:", error);
    $("visit-rows").innerHTML = `<p class="o-empty">${esc(error.message || "Could not load medical records.")}</p>`;
    $("rx-rows").innerHTML = `<p class="o-empty">${esc(error.message || "Could not load medical records.")}</p>`;
  });
})();

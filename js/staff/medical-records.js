/* js/staff/medical-records.js - staff Records page: visit records + prescriptions of every pet
   Demo storage (same lists the owner's Medical Records page reads):
     "pawpaw_records:<owner>" = { visits: [{ id, pet, date, diagnosis, treatment, notes }],
                                  prescriptions: [{ id, pet, date, medication, dose, instructions, quantity }] }
   Backend: set USE_BACKEND = true.
     GET  /api/staff/records            -> { visits: [{ ..., owner }], prescriptions: [{ ..., owner }] }
     POST /api/staff/records/visits           body: { owner, pet, date, diagnosis, treatment, notes }
     POST /api/staff/records/prescriptions    body: { owner, pet, date, medication, dose, instructions, quantity }
   Open with ?q=<pet name> to start with the search filled in (used by Appointments > View Record). */
(() => {
  const USE_BACKEND = false;
  const O = window.PawOwners, S = window.PawStaff, $ = (id) => document.getElementById(id), esc = O.esc;
  const KEY = "pawpaw_records:";

  const read = (key) => { try { const v = JSON.parse(localStorage.getItem(KEY + key) || "null"); return { visits: (v && v.visits) || [], prescriptions: (v && v.prescriptions) || [] }; } catch (_) { return { visits: [], prescriptions: [] }; } };
  const write = (key, v) => { try { localStorage.setItem(KEY + key, JSON.stringify(v)); } catch (_) {} };
  const uid = () => "r-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const pad = (n) => String(n).padStart(2, "0");
  const today = () => { const d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
  const fmt = (iso) => { const d = new Date(iso + "T00:00:00"); return !iso || isNaN(d) ? "-" : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }); };
  const ownerName = (key) => { try { return O.owner(key).short; } catch (_) { return key; } };

  let visits = [], rxs = [];
  function load() {
    visits = []; rxs = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || k.indexOf(KEY) !== 0) continue;
        const owner = k.slice(KEY.length), d = read(owner);
        d.visits.forEach((v) => visits.push({ ...v, owner }));
        d.prescriptions.forEach((r) => rxs.push({ ...r, owner }));
      }
    } catch (_) { /* storage blocked */ }
  }

  const by = {
    new: (a, b) => (b.date || "").localeCompare(a.date || ""),
    old: (a, b) => (a.date || "").localeCompare(b.date || ""),
    pet: (a, b) => String(a.pet).localeCompare(String(b.pet)) || (b.date || "").localeCompare(a.date || "")
  };
  const cell = (t) => `<span role="cell" class="r-clip" title="${esc(t || "")}">${t ? esc(t) : '<span class="a-muted">-</span>'}</span>`;
  const who = (r) => `<span role="cell"><span class="o-name">${esc(r.pet)}</span><span class="o-email">${esc(ownerName(r.owner))}</span></span>`;

  function render() {
    const q = $("search").value.trim().toLowerCase(), sort = by[$("sort").value] || by.new;
    const hit = (r) => !q || Object.values({ ...r, ownerName: ownerName(r.owner) }).join(" ").toLowerCase().includes(q);
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

  /* ----- add dialogs ----- */
  const owners = () => O.list().filter((o) => o.id);
  function fillOwner(prefix) {
    const list = owners();
    $(prefix + "-owner").innerHTML = list.map((o) => `<option value="${esc(o.id)}">${esc(o.short || o.name)}</option>`).join("");
    fillPets(prefix);
  }
  function fillPets(prefix) {
    const pets = O.petsOf($(prefix + "-owner").value);
    $(prefix + "-pet").innerHTML = pets.length ? pets.map((p) => `<option>${esc(p.name)}</option>`).join("") : `<option value="">No pets yet</option>`;
  }
  const err = (id, m) => { $(id).textContent = m || ""; $(id).hidden = !m; return !m; };
  function openAdd(dialog, prefix) {
    if (!owners().length) { S.toast("Register an owner first."); return; }
    fillOwner(prefix); $(prefix + "-date").value = today(); $(prefix + "-date").max = today(); err(prefix + "-err", "");
    $(dialog).showModal();
  }
  async function save(owner, kind, rec) {
    if (USE_BACKEND) {
      const res = await fetch("/api/staff/records/" + (kind === "v" ? "visits" : "prescriptions"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ owner, ...rec }) });
      if (!res.ok) throw new Error("Request failed");
      rec = { ...rec, ...(await res.json()) };
    } else {
      const d = read(owner); d[kind === "v" ? "visits" : "prescriptions"].push(rec); write(owner, d);
    }
    load(); render();
  }
  $("add-visit").addEventListener("click", () => openAdd("visit-dialog", "v"));
  $("add-rx").addEventListener("click", () => openAdd("rx-dialog", "r"));
  $("v-owner").addEventListener("change", () => fillPets("v"));
  $("r-owner").addEventListener("change", () => fillPets("r"));

  $("v-save").addEventListener("click", async () => {
    const owner = $("v-owner").value, pet = $("v-pet").value, date = $("v-date").value, diagnosis = $("v-diag").value.trim();
    if (!pet) return err("v-err", "This owner has no pet yet.");
    if (!date) return err("v-err", "Pick the visit date.");
    if (!diagnosis) return err("v-err", "Enter the diagnosis.");
    try { await save(owner, "v", { id: uid(), pet, date, diagnosis, treatment: $("v-treat").value.trim(), notes: $("v-notes").value.trim() }); }
    catch (_) { return err("v-err", "Could not save. Try again."); }
    ["v-diag", "v-treat", "v-notes"].forEach((id) => { $(id).value = ""; });
    $("visit-dialog").close(); S.toast("Visit record saved.");
  });
  $("r-save").addEventListener("click", async () => {
    const owner = $("r-owner").value, pet = $("r-pet").value, date = $("r-date").value, medication = $("r-med").value.trim();
    if (!pet) return err("r-err", "This owner has no pet yet.");
    if (!date) return err("r-err", "Pick the date.");
    if (!medication) return err("r-err", "Enter the medication.");
    try { await save(owner, "r", { id: uid(), pet, date, medication, dose: $("r-dose").value.trim(), instructions: $("r-inst").value.trim(), quantity: $("r-qty").value.trim() }); }
    catch (_) { return err("r-err", "Could not save. Try again."); }
    ["r-med", "r-dose", "r-qty", "r-inst"].forEach((id) => { $(id).value = ""; });
    $("rx-dialog").close(); S.toast("Prescription saved.");
  });

  $("search").addEventListener("input", render);
  $("sort").addEventListener("change", render);
  try { const q = new URLSearchParams(location.search).get("q"); if (q) $("search").value = q; } catch (_) {}
  load(); render();
})();
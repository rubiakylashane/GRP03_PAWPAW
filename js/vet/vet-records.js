/* js/vet/vet-records.js - Vet: Medical Record
   List: completed appointments with no record yet / with a record. "Add Record" or "Edit Details" opens the editor
   (also opened from other vet pages as medical-records.html?appt=<owner>|<id>).
   Save writes, for that appointment (replacing what it saved before):
     "pawpaw_records:<owner>".visits          { id, apptId, petId, pet, date, diagnosis, treatment, notes, vet, services:[{type,name,notes}] }
     "pawpaw_records:<owner>".prescriptions   { id, apptId, petId, pet, date, medication, dose, instructions, quantity }
     "pawpaw_vaccinations:<owner>"            { id, apptId, petId, vaccine, pet, dateAdministered, nextDue, administeredBy, notes }
   Backend: GET /api/vet/appointments?record=none|done      GET /api/appointments/:id/record
            PUT /api/appointments/:id/record { visit, services, prescriptions, vaccinations } */
(() => {
  const V = window.PawVet, A = V.A, O = V.O, S = window.PawStaff, $ = (id) => document.getElementById(id), esc = O.esc;
  const PREVIEW = 5;
  let all = [], records = [], showAllNo = false, showAllDone = false, cur = null, blocks = [], rx = [], rxEdit = -1;

  const key = (a) => a.owner + "|" + a.id;
  const hasRecord = (a) => records.some((record) => String(record.appointmentId) === String(a.id));
  const done = () => all.filter((a) => V.visible(a) && a.status === "completed").sort((a, b) => V.stamp(b).localeCompare(V.stamp(a)));
  const recOf = (a) => {
    const record = records.find((item) => String(item.appointmentId) === String(a.id));
    if (!record) return { visits: [], prescriptions: [] };
    return {
      visits: [{ ...record, apptId: String(record.appointmentId), vet: record.veterinarian }],
      prescriptions: (record.prescriptions || []).map((item) => ({
        ...item, apptId: String(record.appointmentId), medication: item.medication, dose: item.dose || ""
      }))
    };
  };
  const visitOf = (a) => recOf(a).visits[0] || null;

  /* ----- list ----- */
  const row = (a, btn) => `
    <div class="orow vrow-rec" role="row">
      <span role="cell"><span class="o-name">${esc(V.fmtDate(a.date))}</span><span class="o-email">${esc(V.fmtTime(a.time))}</span></span>
      <span role="cell"><span class="o-name">${esc(V.petName(a))}</span><span class="o-email">${esc(V.ownerName(a))}</span></span>
      <span role="cell">${esc(V.services(a))}</span>
      <span role="cell"><span class="spill spill-${esc(a.status)}">${esc(V.label(a))}</span></span>
      <span role="cell">${btn}</span>
    </div>`;
  function renderList() {
    const d = done(), none = d.filter((a) => !hasRecord(a)), has = d.filter(hasRecord);
    const fill = (rows, el, allBtn, showAll, mk, empty) => {
      const list = showAll ? rows : rows.slice(0, PREVIEW);
      $(el).innerHTML = list.length ? list.map(mk).join("") : `<p class="o-empty">${empty}</p>`;
      $(allBtn).hidden = rows.length <= PREVIEW; $(allBtn).textContent = showAll ? "Show less" : "View All";
    };
    fill(none, "nr-rows", "nr-all", showAllNo, (a) => row(a, `<button type="button" class="vr-btn vr-add" data-open="${esc(key(a))}">Add Record</button>`), "Every completed appointment has a record.");
    fill(has, "cp-rows", "cp-all", showAllDone, (a) => row(a, `<button type="button" class="vr-btn vr-edit" data-open="${esc(key(a))}">Edit Details</button>`), "No completed appointments with a record yet.");
  }

  /* ----- editor ----- */
  const err = (m) => { $("ve-err").textContent = m || ""; $("ve-err").hidden = !m; return !m; };
  const isVacc = (n) => /vaccin/i.test(n || "");
  const plusYear = (d) => { const x = new Date(d + "T00:00:00"); x.setFullYear(x.getFullYear() + 1); return V.iso(x); };

  async function loadState(a) {
    const rec = recOf(a), visit = visitOf(a);
    const date = visit ? visit.date : (a.date <= V.today() ? a.date : V.today());
    $("ve-date").value = date; $("ve-date").max = V.today();
    $("ve-diag").value = visit ? visit.diagnosis : ""; $("ve-treat").value = visit ? visit.treatment || "" : ""; $("ve-notes").value = visit ? visit.notes || "" : "";
    rx = (rec.prescriptions || []).filter((r) => r.apptId === a.id).map((r) => ({ medication: r.medication, dose: r.dose || "", quantity: r.quantity || "", instructions: r.instructions || "" }));
    if (visit) {
      const vx = await request(`/api/vaccinations/pet/${encodeURIComponent(a.petId)}`);
      blocks = vx.filter((record) => String(record.appointmentId) === String(a.id))
        .map((r) => ({ type: "Vaccination", vaccine: r.vaccine, given: r.dateAdministered, due: r.nextDue || "" }))
        .concat((visit.services || []).map((s) => ({ type: s.type, name: s.name || "", notes: s.notes || "" })));
    } else {
      blocks = (a.services || []).map((s) => isVacc(s.name)
        ? { type: "Vaccination", vaccine: ((s.name.match(/\(([^)]+)\)/) || [])[1] || "").trim(), given: date, due: plusYear(date) }
        : { type: s.name, name: "", notes: "" });
    }
    rxEdit = -1; clearRx(); err("");
  }
  async function openEditor(a) {
    cur = a;
    try { await loadState(a); }
    catch (error) { console.error("Could not load visit details:", error); S.toast(error.message || "Could not load visit details."); return; }
    $("ve-bar").innerHTML = `<span>Pet: <strong>${esc(V.petName(a))}${petInfo(a)}</strong></span><span>Owner: <strong>${esc(V.ownerName(a))}</strong></span><span>Visit: <strong>${esc(V.fmtShort(a.date))} &middot; ${esc(V.services(a))}</strong></span><span>Status: <strong>${esc(V.label(a))}</strong></span>`;
    $("ve-svc").innerHTML = ["Vaccination"].concat(A.SERVICES.filter((s) => !isVacc(s))).map((s) => `<option>${esc(s)}</option>`).join("");
    drawBlocks(); drawRx();
    $("rec-list").hidden = true; $("rec-edit").hidden = false; window.scrollTo(0, 0);
  }
  const petInfo = (a) => { const p = (a.petId && O.getPet(a.owner, a.petId)) || null; return p ? " (" + [p.species, p.breed].filter(Boolean).join(", ") + ")" : ""; };
  function closeEditor() { cur = null; $("rec-edit").hidden = true; $("rec-list").hidden = false; renderList(); window.scrollTo(0, 0); }

  function drawBlocks() {
    $("ve-blocks").innerHTML = blocks.map((b, i) => b.type === "Vaccination" ? `
      <div class="ve-block">
        <div class="ve-bhead"><span class="ve-chip ve-chip-v">Vaccination</span><button type="button" class="ve-remove" data-rm="${i}">Remove</button></div>
        <div class="ve-three">
          <div><label class="ve-label">Vaccine name</label><input type="text" class="ve-input" data-i="${i}" data-f="vaccine" value="${esc(b.vaccine)}" maxlength="80" /></div>
          <div><label class="ve-label">Date administered</label><input type="date" class="ve-input" data-i="${i}" data-f="given" value="${esc(b.given)}" max="${V.today()}" /></div>
          <div><label class="ve-label">Next due</label><input type="date" class="ve-input" data-i="${i}" data-f="due" value="${esc(b.due)}" /></div>
        </div>
      </div>` : `
      <div class="ve-block">
        <div class="ve-bhead"><span class="ve-chip">${esc(b.type)}</span><button type="button" class="ve-remove" data-rm="${i}">Remove</button></div>
        <div class="ve-two">
          <div><label class="ve-label">Service name</label><input type="text" class="ve-input" data-i="${i}" data-f="name" value="${esc(b.name)}" maxlength="120" placeholder="e.g. Nail trim and bath" /></div>
          <div><label class="ve-label">Notes</label><input type="text" class="ve-input" data-i="${i}" data-f="notes" value="${esc(b.notes)}" maxlength="200" placeholder="Optional" /></div>
        </div>
      </div>`).join("");
  }

  function drawRx() {
    $("ve-rx-list").innerHTML = rx.map((r, i) => `
      <div class="ve-rxitem">
        <div><strong>${esc(r.medication)}</strong><p>${esc([r.dose, r.instructions].filter(Boolean).join(" · "))}${r.quantity ? " · Qty " + esc(r.quantity) : ""}</p></div>
        <div class="ve-rxbtns"><button type="button" class="ve-edit" data-rxe="${i}">Edit</button><button type="button" class="ve-remove" data-rxr="${i}">Remove</button></div>
      </div>`).join("");
    $("ve-rx-add").textContent = rxEdit >= 0 ? "Update prescription" : "Add prescription";
    $("ve-rx-h").textContent = rxEdit >= 0 ? "Edit prescription" : "Add prescription";
  }
  function clearRx() { ["ve-med", "ve-dose", "ve-inst"].forEach((id) => { $(id).value = ""; }); $("ve-qty").value = "1"; }
  function saveRx() {
    const medication = $("ve-med").value.trim();
    if (!medication) return err("Enter the medication name.");
    const item = { medication, dose: $("ve-dose").value.trim(), quantity: $("ve-qty").value.trim(), instructions: $("ve-inst").value.trim() };
    if (rxEdit >= 0) rx[rxEdit] = item; else rx.push(item);
    rxEdit = -1; clearRx(); err(""); drawRx();
  }

  async function save() {
    const a = cur, diag = $("ve-diag").value.trim(), date = $("ve-date").value;
    if (!diag) return err("Enter the diagnosis.");
    if (!date) return err("Pick the record date.");
    if (date > V.today()) return err("The record date cannot be in the future.");
    if ($("ve-med").value.trim()) saveRx();                       // a prescription typed but not added yet
    for (const b of blocks) if (b.type === "Vaccination") {
      if (!b.vaccine.trim()) return err("Enter the vaccine name for each vaccination.");
      if (!b.given || b.given > V.today()) return err("Check the date administered of " + b.vaccine + ".");
      if (!b.due || b.due <= b.given) return err("The next due date of " + b.vaccine + " must be after the date administered.");
    }
    const old = visitOf(a);
    try {
      await request(`/api/medical-records/appointments/${encodeURIComponent(a.id)}/complete`, {
        method: "POST",
        body: JSON.stringify({
          diagnosis: diag,
          recordDate: date,
          treatment: $("ve-treat").value.trim(),
          notes: $("ve-notes").value.trim(),
          services: blocks.filter((block) => block.type !== "Vaccination").map((block) => ({
            type: block.type, name: block.name.trim(), notes: block.notes.trim()
          })),
          prescriptions: rx.map((item) => ({
            medication: item.medication, dose: item.dose, instructions: item.instructions, quantity: item.quantity || 1
          })),
          vaccinations: blocks.filter((block) => block.type === "Vaccination").map((block) => ({
            name: block.vaccine.trim(), dateAdministered: block.given, nextDue: block.due
          }))
        })
      });
      records = await request("/api/medical-records/all");
      const refreshed = await A.load();
      all = refreshed;
      closeEditor(); S.toast((old ? "Record updated for " : "Record saved for ") + V.petName(a) + ".");
    } catch (error) {
      console.error("Could not save the medical record:", error);
      err(error.message || "Could not save the medical record.");
    }
  }

  /* ----- events ----- */
  document.addEventListener("click", (e) => {
    const o = e.target.closest("[data-open]"); if (o) { const a = all.find((x) => key(x) === o.dataset.open); if (a) openEditor(a); return; }
    const rm = e.target.closest("[data-rm]"); if (rm) { blocks.splice(+rm.dataset.rm, 1); drawBlocks(); return; }
    const re = e.target.closest("[data-rxe]"); if (re) { rxEdit = +re.dataset.rxe; const r = rx[rxEdit]; $("ve-med").value = r.medication; $("ve-dose").value = r.dose; $("ve-qty").value = r.quantity; $("ve-inst").value = r.instructions; drawRx(); $("ve-med").focus(); return; }
    const rr = e.target.closest("[data-rxr]"); if (rr) { rx.splice(+rr.dataset.rxr, 1); rxEdit = -1; clearRx(); drawRx(); }
  });
  document.addEventListener("input", (e) => { const f = e.target.dataset && e.target.dataset.f; if (f && blocks[+e.target.dataset.i]) blocks[+e.target.dataset.i][f] = e.target.value; });
  $("nr-all").addEventListener("click", () => { showAllNo = !showAllNo; renderList(); });
  $("cp-all").addEventListener("click", () => { showAllDone = !showAllDone; renderList(); });
  $("ve-svc-add").addEventListener("click", () => {
    const t = $("ve-svc").value, d = $("ve-date").value || V.today();
    blocks.push(t === "Vaccination" ? { type: t, vaccine: "", given: d, due: plusYear(d) } : { type: t, name: "", notes: "" }); drawBlocks();
  });
  $("ve-rx-add").addEventListener("click", saveRx);
  $("ve-save").addEventListener("click", save);
  $("ve-cancel").addEventListener("click", closeEditor);

  async function request(url, options) {
    const response = await fetch(url, {
      headers: { Accept: "application/json", ...(options && options.body ? { "Content-Type": "application/json" } : {}) },
      ...options
    });
    const body = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body && body.error || `Clinic request failed (${response.status}).`);
    return body;
  }
  Promise.all([A.load(), request("/api/medical-records/all")]).then(([appointments, clinicalRecords]) => {
    all = appointments; records = clinicalRecords; renderList();
    const want = new URLSearchParams(location.search).get("appt");
    if (want) { const appointment = all.find((item) => key(item) === want && V.visible(item)); if (appointment) openEditor(appointment); }
  }).catch((error) => {
    console.error("Could not load veterinarian records:", error);
    $("nr-rows").innerHTML = '<p class="o-empty">Medical records could not be loaded. Please refresh and try again.</p>';
  });
})();
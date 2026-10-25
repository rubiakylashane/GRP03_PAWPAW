/* js/staff/vet-patients.js - Vet: Patient Profile
   Grid of the pets assigned to this vet. "View Details" opens one pet: pet card, owner details,
   visit records and prescriptions. Also opened from "View Patient" as patients.html?owner=&petid=&pet=
   Backend: GET /api/vet/patients                -> [{ owner, petId, name, species, breed, sex, dob, allergies, ownerName }]
            GET /api/pets/:id (with owner + history) -> { pet, owner, otherPets, visits, prescriptions } */
(() => {
  const V = window.PawVet, O = V.O, $ = (id) => document.getElementById(id), esc = O.esc;
  const qs = new URLSearchParams(location.search);
  let patients = [], sel = null, visits = [], prescriptions = [], otherPets = [];

  const keyOf = (p) => String(p.ownerId) + "|" + String(p.petId);
  const petOf = (p) => p || null;
  const ownerOf = (pet) => ({ short: pet.ownerName, name: pet.ownerName, phone: pet.ownerPhone, email: pet.ownerEmail });
  const photo = (pet) => pet && pet.photo ? ` style="background-image:url('${esc(pet.photo)}')"` : "";
  const sub = (pet) => { const age = pet && pet.dob ? O.ageText(pet.dob) : ""; return ((pet && pet.species) || "-") + (age ? " - " + age : ""); };

  /* ----- grid ----- */
  function renderGrid() {
    const q = $("search").value.trim().toLowerCase();
    const list = patients.filter((p) => { const pet = petOf(p) || {}; return !q || [p.name, ownerOf(p).short, pet.breed, pet.species].join(" ").toLowerCase().includes(q); });
    $("pt-grid").innerHTML = list.length ? list.map((p) => { const pet = petOf(p), o = ownerOf(p); return `
      <article class="vp-card">
        <div class="vp-top"><span class="vp-photo"${photo(pet)} aria-hidden="true"></span><div><h3>${esc(p.name)}</h3><p>${esc(sub(pet))}</p></div></div>
        <dl class="vp-rows">
          <div><dt>Owner</dt><dd>${esc(o.short)}</dd></div>
          <div><dt>Breed</dt><dd>${esc((pet && pet.breed) || "-")}</dd></div>
          <div><dt>Gender</dt><dd>${esc((pet && pet.sex) || "-")}</dd></div>
          <div><dt>Date of Birth</dt><dd>${pet && pet.dob ? esc(O.fmtShort(pet.dob)) : "N/A"}</dd></div>
        </dl>
        <button type="button" class="vp-view" data-k="${esc(keyOf(p))}">View Details</button>
      </article>`; }).join("") : `<p class="vp-empty">${patients.length ? "No patients match." : "No patients yet. They appear once an appointment is assigned to you."}</p>`;
  }

  /* ----- one patient ----- */
  const table = (head, cols, rows, empty) => rows.length
    ? `<div class="vp-table"><div class="vp-tr vp-th" style="--cols:${cols}">${head.map((h) => `<span>${esc(h)}</span>`).join("")}</div>` +
      rows.map((r) => `<div class="vp-tr" style="--cols:${cols}">${r.map((c) => `<span>${esc(c)}</span>`).join("")}</div>`).join("") + `</div>`
    : `<p class="vp-none">${esc(empty)}</p>`;

  function renderDetail() {
    const pet = petOf(sel), o = ownerOf(sel);
    const petVisits = visits.slice().sort((a, b) => String(b.record_date).localeCompare(String(a.record_date)));
    const petPrescriptions = prescriptions.slice().sort((a, b) => String(b.record_date).localeCompare(String(a.record_date)));
    /* 2 x 2 grid: pet card | visit records, owner details | prescription, so each row has the same height */
    $("pt-detail").innerHTML = `
      <section class="vd-card vd-pet">
        <div class="vp-top"><span class="vp-photo vp-photo-lg"${photo(pet)} aria-hidden="true"></span><div><h2>${esc(sel.name)}</h2><p>${esc(sub(pet))}</p></div></div>
        <dl class="vp-rows">
          <div><dt>Breed</dt><dd>${esc((pet && pet.breed) || "-")}</dd></div>
          <div><dt>Gender</dt><dd>${esc((pet && pet.sex) || "-")}</dd></div>
          <div><dt>Date of Birth</dt><dd>${pet && pet.dob ? esc(O.fmtShort(pet.dob)) : "N/A"}</dd></div>
          <div><dt>Allergies</dt><dd>${esc((pet && pet.allergies) || "None")}</dd></div>
        </dl>
      </section>
      <section class="vd-card vd-visits"><h2>Visit Records</h2>${table(["Date", "Diagnosis", "Treatment", "Notes"], 4, petVisits.map((r) => [O.fmtShort(r.record_date), r.diagnosis, r.treatment || "-", r.notes || "-"]), "No visit records yet.")}</section>
      <section class="vd-card vd-owner">
        <h2>Owner Details</h2>
        <dl class="vp-rows">
          <div><dt>Name</dt><dd>${esc(o.name || o.short)}</dd></div>
          <div><dt>Contact No.</dt><dd>${esc(o.phone || "-")}</dd></div>
          <div><dt>Email</dt><dd>${esc(o.email || "-")}</dd></div>
          <div><dt>Other Pets</dt><dd>${otherPets.length ? otherPets.map((x) => `<a href="#" class="vp-link" data-owner="${esc(sel.ownerId)}" data-id="${esc(x.id)}" data-name="${esc(x.name)}">${esc(x.name)}</a>`).join(", ") : "None"}</dd></div>
        </dl>
      </section>
      <section class="vd-card vd-rx"><h2>Prescription</h2>${table(["Date", "Medication", "Dose", "Instructions", "Quantity"], 5, petPrescriptions.map((r) => [O.fmtShort(r.record_date), r.medication_name, r.dosage || "-", r.instructions || "-", r.quantity || "-"]), "No prescriptions yet.")}</section>`;
  }

  async function show() {
    const detail = !!sel;
    $("pt-grid").hidden = detail; $("pt-detail").hidden = !detail; $("go-back").hidden = !detail;
    $("pt-sub").textContent = "Pet details and full history.";
    if (!detail) { renderGrid(); return; }
    try {
      const [recordResponse, petsResponse] = await Promise.all([
        fetch(`/api/medical-records/pet/${encodeURIComponent(sel.petId)}`, { headers: { Accept: "application/json" } }),
        fetch(`/api/pets/owner/${encodeURIComponent(sel.ownerId)}`, { headers: { Accept: "application/json" } })
      ]);
      const [recordRows, petRows] = await Promise.all([
        recordResponse.json().catch(() => []), petsResponse.json().catch(() => [])
      ]);
      if (!recordResponse.ok) throw new Error(recordRows.error || "Could not load medical records.");
      if (!petsResponse.ok) throw new Error(petRows.error || "Could not load other pets.");
      visits = recordRows;
      prescriptions = recordRows.flatMap((record) => (record.prescriptions || []).map((prescription) => ({
        ...prescription, record_date: record.record_date
      })));
      otherPets = petRows.filter((pet) => String(pet.id) !== String(sel.petId));
      renderDetail();
    } catch (error) {
      console.error("Could not load patient history:", error);
      $("pt-detail").innerHTML = `<p class="vp-empty">${esc(error.message || "Could not load patient details.")}</p>`;
    }
  }

  document.addEventListener("click", (e) => {
    const v = e.target.closest(".vp-view");
    if (v) { sel = patients.find((p) => keyOf(p) === v.dataset.k); show(); window.scrollTo(0, 0); return; }
    const l = e.target.closest(".vp-link");
    if (l) { e.preventDefault(); sel = patients.find((p) => String(p.ownerId) === l.dataset.owner && String(p.petId) === l.dataset.id); show(); window.scrollTo(0, 0); }
  });
  $("go-back").addEventListener("click", () => { sel = null; show(); });
  $("search").addEventListener("input", () => { if (sel) { sel = null; show(); } renderGrid(); });
  fetch("/api/veterinarians/patients", { headers: { Accept: "application/json" } })
    .then(async (response) => {
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not load assigned patients.");
      patients = result;
      const ownerId = qs.get("owner"), petId = qs.get("petid");
      if (ownerId && petId) sel = patients.find((patient) => String(patient.ownerId) === ownerId && String(patient.petId) === petId) || null;
      await show();
    })
    .catch((error) => {
      console.error("Could not load assigned patients:", error);
      $("pt-grid").innerHTML = `<p class="vp-empty">${esc(error.message || "Could not load assigned patients.")}</p>`;
    });
})();
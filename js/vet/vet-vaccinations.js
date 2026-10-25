/* js/vet/vet-vaccinations.js - Vet: Vaccinations
   "Record Vaccination" saves a vaccine given (also saved automatically when a visit is completed).
   Demo data: "pawpaw_vaccinations:<owner>" (feeds the staff Vaccine Reminders and the owner Vaccination History).
   Backend: GET /api/vet/vaccinations           -> [{ id, owner, pet, vaccine, dateAdministered, nextDue }]
            POST /api/vaccinations              { owner, petId, vaccine, dateAdministered, nextDue, notes } */
(() => {
  const V = window.PawVet, O = V.O, S = window.PawStaff, $ = (id) => document.getElementById(id), esc = O.esc;
  const SOON = 30;
  const VACCINES = ["Anti Rabies", "5-in-1 (DHPP)", "6-in-1", "4-in-1 (Cat)", "Kennel Cough", "Other"];
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const daysTo = (iso) => Math.round((new Date(iso + "T00:00:00") - now) / 86400000);
  let rows = [], patients = [];
  async function request(url, options) {
    const response = await fetch(url, options);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Could not load vaccination data.");
    return result;
  }

  const cls = (r) => { if (!r.nextDue) return "ok"; const d = daysTo(r.nextDue); return d < 0 ? "late" : d <= SOON ? "soon" : "ok"; };
  const SORTS = {
    recent: (a, b) => (b.dateAdministered || "").localeCompare(a.dateAdministered || ""),
    due: (a, b) => (a.nextDue || "9999").localeCompare(b.nextDue || "9999"),
    pet: (a, b) => (a.pet || "").localeCompare(b.pet || "")
  };

  function render() {
    const q = $("search").value.trim().toLowerCase();
    const list = rows.filter((r) => !q || [r.pet, r.vaccine, r.owner].join(" ").toLowerCase().includes(q)).sort(SORTS[$("sort").value] || SORTS.recent);
    $("vx-rows").innerHTML = list.length ? list.map((r) => `
      <div class="orow vrow-vx" role="row">
        <span role="cell" class="o-name">${esc(r.pet || "-")}</span>
        <span role="cell" class="vx-muted">${esc(r.vaccine || "-")}</span>
        <span role="cell" class="vx-bold">${esc(O.fmtShort(r.dateAdministered))}</span>
        <span role="cell" class="vx-due vx-${cls(r)}">${r.nextDue ? esc(O.fmtShort(r.nextDue)) : "-"}</span>
      </div>`).join("") : `<p class="o-empty">${rows.length ? "Nothing matches your search." : "No vaccinations recorded yet."}</p>`;
  }

  /* ----- Record Vaccination ----- */
  const dlg = $("rv-dialog");
  const err = (m) => { $("rv-err").textContent = m || ""; $("rv-err").hidden = !m; return !m; };
  const suggest = (from) => { const d = new Date(from + "T00:00:00"); d.setFullYear(d.getFullYear() + 1); return V.iso(d); };
  function fillPets() {
    const pets = patients.filter((patient) => String(patient.ownerId) === String($("rv-owner").value));
    $("rv-pet").innerHTML = pets.length
      ? pets.map((pet) => `<option value="${esc(pet.petId)}">${esc(pet.name)}</option>`).join("")
      : `<option value="">No assigned patients</option>`;
  }
  function openRecord() {
    const owners = [...new Map(patients.map((patient) => [String(patient.ownerId), {
      id: patient.ownerId, name: patient.ownerName
    }])).values()];
    $("rv-owner").innerHTML = owners.map((owner) => `<option value="${esc(owner.id)}">${esc(owner.name)}</option>`).join("");
    $("rv-vaccine").innerHTML = VACCINES.map((v) => `<option>${esc(v)}</option>`).join("");
    $("rv-other").value = ""; $("rv-other-box").hidden = true;
    $("rv-date").value = V.today(); $("rv-due").value = suggest(V.today()); $("rv-notes").value = "";
    fillPets(); err(""); dlg.showModal();
  }
  async function save() {
    const petId = $("rv-pet").value;
    let vaccine = $("rv-vaccine").value; if (vaccine === "Other") vaccine = $("rv-other").value.trim();
    const given = $("rv-date").value, due = $("rv-due").value;
    if (!patients.length) return err("No patients are assigned to your account.");
    if (!petId) return err("Choose one of your assigned patients.");
    if (!vaccine) return err("Enter the vaccine name.");
    if (!given) return err("Pick the date given.");
    if (given > V.today()) return err("The date given cannot be in the future.");
    if (!due) return err("Pick the next due date.");
    if (due <= given) return err("The next due date must be after the date given.");
    const pet = patients.find((patient) => String(patient.petId) === String(petId));
    const saveButton = $("rv-ok");
    saveButton.disabled = true;
    try {
      const result = await request("/api/vaccinations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          pet_id: petId, vaccine, date_administered: given,
          next_due_date: due, notes: $("rv-notes").value.trim()
        })
      });
      rows.unshift({ ...result.vaccination, pet: pet.name, owner: pet.ownerName });
      dlg.close(); render(); S.toast("Vaccination recorded.");
    } catch (error) {
      console.error("Could not record vaccination:", error);
      err(error.message || "Could not record vaccination.");
    } finally {
      saveButton.disabled = false;
    }
  }
  $("record-btn").addEventListener("click", openRecord);
  $("rv-owner").addEventListener("change", fillPets);
  $("rv-vaccine").addEventListener("change", () => { $("rv-other-box").hidden = $("rv-vaccine").value !== "Other"; });
  $("rv-date").addEventListener("change", () => { if ($("rv-date").value) $("rv-due").value = suggest($("rv-date").value); });
  $("rv-ok").addEventListener("click", save);
  $("rv-cancel").addEventListener("click", () => dlg.close());
  $("search").addEventListener("input", render);
  $("sort").addEventListener("change", render);
  Promise.all([
    request("/api/veterinarians/patients", { headers: { Accept: "application/json" } }),
    request("/api/vaccinations/clinical", { headers: { Accept: "application/json" } })
  ]).then(([assignedPatients, vaccinations]) => {
    patients = assignedPatients;
    rows = vaccinations;
    render();
  }).catch((error) => {
    console.error("Could not load vaccination page:", error);
    $("vx-rows").innerHTML = `<p class="o-empty">${esc(error.message || "Could not load vaccination records.")}</p>`;
  });
})();
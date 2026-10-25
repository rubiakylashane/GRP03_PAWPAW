/* js/staff/owner-details.js - owner profile + pet cards (owner-details.html?id=<owner>) */
(() => {
  const O = window.PawOwners, S = window.PawStaff, $ = (id) => document.getElementById(id);
  const put = (id, text) => { const el = $(id); if (el) el.textContent = text; };   /* a missing element never stops the rest of the page */
  const id = S.ownerId();

  async function load() {
    $("detail").hidden = true;
    if (!id) { $("missing").hidden = false; return; }
    try {
      const [ownerResponse, petsResponse] = await Promise.all([
        fetch("/api/owners/" + encodeURIComponent(id), { headers: { Accept: "application/json" } }),
        fetch("/api/pets/owner/" + encodeURIComponent(id), { headers: { Accept: "application/json" } })
      ]);
      const [ownerResult, pets] = await Promise.all([
        ownerResponse.json().catch(() => ({})),
        petsResponse.json().catch(() => ({}))
      ]);
      if (!ownerResponse.ok) throw new Error(ownerResult.error || "Could not load this owner.");
      if (!petsResponse.ok) throw new Error(pets.error || "Could not load this owner's pets.");
      const o = ownerResult.owner;
      put("o-name", o.name);
      put("o-since", o.createdAt ? O.fmtLong(o.createdAt) : "-");
      put("o-email", o.email || "-");
      put("o-address", o.address || "-");
      put("o-phone", o.phone || "-");
      if (o.photo) $("o-photo").style.backgroundImage = `url('${o.photo}')`;
      const q = "?id=" + encodeURIComponent(id);
      $("o-edit").href = "owner-edit.html" + q;
      $("add-pet").href = "owner-pet-form.html?owner=" + encodeURIComponent(id);
      document.title = o.name + " | Pawpaw Clinic Staff";
      $("pets-grid").innerHTML = pets.length ? pets.map((p) => {
        const age = O.ageText(p.dob);
        const photo = p.photo ? ` style="background-image:url('${O.esc(p.photo)}')"` : "";
        return `
          <a class="spet" href="owner-pet-form.html?owner=${encodeURIComponent(id)}&id=${encodeURIComponent(p.id)}" aria-label="View and edit ${O.esc(p.name)}">
            <div class="spet-top">
              <span class="spet-photo"${photo} aria-hidden="true"></span>
              <div><h3>${O.esc(p.name)}</h3><p>${O.esc(p.species || "-")}${age ? " - " + O.esc(age) : ""}</p></div>
            </div>
            <dl class="spet-facts">
              <div><dt>Breed</dt><dd>${O.esc(p.breed || "-")}</dd></div>
              <div><dt>Gender</dt><dd>${O.esc(p.sex || "-")}</dd></div>
              <div><dt>Date of Birth</dt><dd>${O.esc(p.dob ? O.fmtShort(p.dob) : "N/A")}</dd></div>
            </dl>
          </a>`;
      }).join("") : `<p class="spets-empty">No pets yet. Click "Add Pet" to register one.</p>`;
      $("detail").hidden = false;
      $("missing").hidden = true;
    } catch (error) {
      console.error("Could not load owner details:", error);
      $("missing").textContent = error.message || "Could not load this owner.";
      $("missing").hidden = false;
    }
  }
  load();
})();
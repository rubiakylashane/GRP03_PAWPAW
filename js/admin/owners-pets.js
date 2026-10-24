/* js/admin/owners-pets.js - admin Owners and Pets: every owner (search, edit, delete) and the pets of the selected owner.
   Data comes from PawOwners (owners-store.js); changes are written to the audit log (admin-store.js).
   Delete is blocked when the owner / pet already has pets, appointments, records or vaccinations. */
(() => {
  const O = window.PawOwners, A = window.PawAdmin, S = window.PawStaff, $ = (id) => document.getElementById(id);
  const esc = O.esc;
  let owners = [], selected = new URLSearchParams(location.search).get("owner") || "", q = "", pending = null;

  const phoneShow = (p) => { const d = String(p || "").replace(/\D/g, ""); return /^09\d{9}$/.test(d) ? d.slice(0, 4) + " " + d.slice(4, 7) + " " + d.slice(7) : (p || "-"); };
  const q2 = (s) => String(s || "").toLowerCase();

  function renderOwners() {
    owners = O.list().sort((a, b) => String(a.registered || "").localeCompare(String(b.registered || "")));
    if (!owners.some((o) => o.id === selected)) selected = owners.length ? owners[0].id : "";
    const rows = owners.filter((o) => !q || [o.name, o.phone, o.email].some((x) => q2(x).includes(q)));
    $("o-rows").innerHTML = rows.length ? rows.map((o) => `
      <div class="o-row o-orow${o.id === selected ? " sel" : ""}" role="row" data-owner="${esc(o.id)}">
        <span role="cell"><span class="o-main">${esc(o.name)}</span><span class="o-sub">${esc(o.email || "-")}</span></span>
        <span role="cell" data-label="Phone">${esc(phoneShow(o.phone))}</span>
        <span role="cell" data-label="Pets">${o.petCount}</span>
        <span role="cell" data-label="Registered">${esc(O.fmtShort(o.registered))}</span>
        <span role="cell" class="o-acts"><a class="u-act" href="owner-edit.html?id=${encodeURIComponent(o.id)}">Edit</a><button type="button" class="u-act u-act-red" data-del-owner="${esc(o.id)}">Delete</button></span>
      </div>`).join("") : `<p class="u-empty">${owners.length ? "No owners match your search." : "No owners yet."}</p>`;
  }

  function renderPets() {
    const o = owners.find((x) => x.id === selected);
    $("pets-title").textContent = o ? "Pets of " + o.name : "Pets";
    const add = $("add-pet"); add.hidden = !o; if (o) add.href = "owner-pet-form.html?owner=" + encodeURIComponent(o.id);
    const pets = o ? O.petsOf(o.id) : [];
    $("p-rows").innerHTML = !o ? `<p class="u-empty">Select an owner to see their pets.</p>` : pets.length ? pets.map((p) => `
      <div class="o-row o-prow" role="row">
        <span role="cell" class="o-main" data-label="Name">${esc(p.name)}</span>
        <span role="cell" data-label="Species">${esc(p.species || "-")}</span>
        <span role="cell" data-label="Breed">${esc(p.breed || "-")}</span>
        <span role="cell" data-label="Gender">${esc(p.sex || "-")}</span>
        <span role="cell" data-label="Born">${esc(O.fmtShort(p.dob))}</span>
        <span role="cell" class="o-acts"><a class="u-act" href="owner-pet-form.html?owner=${encodeURIComponent(o.id)}&id=${encodeURIComponent(p.id)}">Edit</a><button type="button" class="u-act u-act-red" data-del-pet="${esc(p.id)}">Delete</button></span>
      </div>`).join("") : `<p class="u-empty">${esc(o.name)} has no pets yet.</p>`;
  }
  const render = () => { renderOwners(); renderPets(); };

  $("o-search").addEventListener("input", (e) => { q = e.target.value.trim().toLowerCase(); renderOwners(); });

  const dlg = $("del-dialog");
  function ask(title, text, blocked, run) {
    $("del-title").textContent = title; $("del-sub").textContent = text;
    $("del-ok").hidden = blocked; $("del-cancel").textContent = blocked ? "Close" : "Cancel";
    pending = run; dlg.showModal();
  }
  document.addEventListener("click", (e) => {
    const dOwner = e.target.closest("[data-del-owner]"), dPet = e.target.closest("[data-del-pet]");
    if (dOwner) {
      const o = owners.find((x) => x.id === dOwner.dataset.delOwner), h = A.ownerHistory(o.id);
      if (h.total) ask("Cannot delete", o.name + " already has " + A.describe(h) + ". Deactivate their login in Users and Staff instead.", true);
      else ask("Delete owner", "Delete " + o.name + "? This cannot be undone.", false, () => { A.deleteOwner(o.id, o.name); render(); S.toast(o.name + " deleted."); });
      return;
    }
    if (dPet) {
      const o = owners.find((x) => x.id === selected), p = O.petsOf(o.id).find((x) => x.id === dPet.dataset.delPet), h = A.ownerHistory(o.id, p.id);
      if (h.total) ask("Cannot delete", p.name + " already has " + A.describe(h) + ", so the history stays. ", true);
      else ask("Delete pet", "Delete " + p.name + " of " + o.name + "? This cannot be undone.", false, () => { A.deletePet(o.id, p.id, p.name, o.name); render(); S.toast(p.name + " deleted."); });
      return;
    }
    const row = e.target.closest("[data-owner]");   // click a row (not its buttons) to see that owner's pets
    if (row && !e.target.closest("a, button")) { selected = row.dataset.owner; render(); }
  });
  $("del-cancel").addEventListener("click", () => dlg.close());
  $("del-ok").addEventListener("click", () => { dlg.close(); if (pending) pending(); });

  render();
})();
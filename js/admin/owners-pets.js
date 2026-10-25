/* js/admin/owners-pets.js - admin Owners and Pets: every owner (search, edit, delete) and the pets of the selected owner.
   Data comes from PawOwners (owners-store.js); changes are written to the audit log (admin-store.js).
   Delete is blocked when the owner / pet already has pets, appointments, records or vaccinations. */
(() => {
  const O = window.PawOwners, S = window.PawStaff, $ = (id) => document.getElementById(id);
  const esc = O.esc;
  let owners = [], selected = new URLSearchParams(location.search).get("owner") || "", q = "", pending = null;
  const petsByOwner = new Map();
  async function request(url, options) {
    const response = await fetch(url, options);
    const result = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) throw new Error((result && result.error) || "The request could not be completed.");
    return result;
  }
  async function loadPets(ownerId) {
    const pets = await request("/api/pets/owner/" + encodeURIComponent(ownerId), { headers: { Accept: "application/json" } });
    petsByOwner.set(String(ownerId), pets);
    return pets;
  }

  const phoneShow = (p) => { const d = String(p || "").replace(/\D/g, ""); return /^09\d{9}$/.test(d) ? d.slice(0, 4) + " " + d.slice(4, 7) + " " + d.slice(7) : (p || "-"); };
  const q2 = (s) => String(s || "").toLowerCase();

  function renderOwners() {
    owners.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
    if (!owners.some((o) => String(o.id) === String(selected))) selected = owners.length ? String(owners[0].id) : "";
    const rows = owners.filter((o) => !q || [o.name, o.phone, o.email].some((x) => q2(x).includes(q)));
    $("o-rows").innerHTML = rows.length ? rows.map((o) => `
      <div class="o-row o-orow${String(o.id) === String(selected) ? " sel" : ""}" role="row" data-owner="${esc(o.id)}">
        <span role="cell"><span class="o-main">${esc(o.name)}</span><span class="o-sub">${esc(o.email || "-")}</span><span class="o-sub">${esc(phoneShow(o.phone))}</span></span>
        <span role="cell" data-label="Pets">${o.petCount}</span>
        <span role="cell" data-label="Registered">${esc(O.fmtShort(o.createdAt))}</span>
        <span role="cell" class="o-acts"><a class="u-act" href="owner-edit.html?id=${encodeURIComponent(o.id)}">Edit</a><button type="button" class="u-act u-act-red" data-del-owner="${esc(o.id)}">Delete</button></span>
      </div>`).join("") : `<p class="u-empty">${owners.length ? "No owners match your search." : "No owners yet."}</p>`;
  }

  function renderPets() {
    const o = owners.find((x) => String(x.id) === String(selected));
    $("pets-title").textContent = o ? "Pets of " + o.name : "Pets";
    const add = $("add-pet"); add.hidden = !o; if (o) add.href = "owner-pet-form.html?owner=" + encodeURIComponent(o.id);
    const pets = o ? (petsByOwner.get(String(o.id)) || []) : [];
    $("p-rows").innerHTML = !o ? `<p class="u-empty">Select an owner to see their pets.</p>` : pets.length ? pets.map((p) => `
      <div class="o-row o-prow" role="row">
        <span role="cell" class="o-main" data-label="Name">${esc(p.name)}</span>
        <span role="cell" data-label="Species">${esc(p.species || "-")}</span>
        <span role="cell" data-label="Breed">${esc(p.breed || "-")}</span>
        <span role="cell" data-label="Gender">${esc(p.sex || "-")}</span>
        <span role="cell" data-label="Born">${esc(p.dob ? O.fmtShort(p.dob) : "N/A")}</span>
        <span role="cell" class="o-acts"><a class="u-act" href="owner-pet-form.html?owner=${encodeURIComponent(o.id)}&id=${encodeURIComponent(p.id)}">Edit</a><button type="button" class="u-act u-act-red" data-del-pet="${esc(p.id)}">Delete</button></span>
      </div>`).join("") : `<p class="u-empty">${esc(o.name)} has no pets yet.</p>`;
  }
  const render = () => { renderOwners(); renderPets(); };
  async function refresh() {
    try {
      owners = await request("/api/owners", { headers: { Accept: "application/json" } });
      if (selected && owners.some((owner) => String(owner.id) === String(selected))) await loadPets(selected);
      else if (owners.length) {
        selected = String(owners[0].id);
        await loadPets(selected);
      }
      render();
    } catch (error) {
      console.error("Could not load owners and pets:", error);
      $("o-rows").innerHTML = `<p class="u-empty">${esc(error.message || "Could not load owners.")}</p>`;
    }
  }

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
      const o = owners.find((x) => String(x.id) === dOwner.dataset.delOwner);
      if (o.petCount) ask("Cannot delete", o.name + " still has pets. Remove or transfer their pets first.", true);
      else ask("Delete owner", "Delete " + o.name + "? Their login will be deactivated.", false, async () => {
        await request("/api/owners/" + encodeURIComponent(o.id), { method: "DELETE" });
        selected = "";
        petsByOwner.delete(String(o.id));
        await refresh();
        S.toast(o.name + " removed.");
      });
      return;
    }
    if (dPet) {
      const o = owners.find((x) => String(x.id) === String(selected));
      const p = (petsByOwner.get(String(o.id)) || []).find((x) => String(x.id) === dPet.dataset.delPet);
      ask("Delete pet", "Delete " + p.name + " of " + o.name + "? Pets with appointment or vaccination history cannot be deleted.", false, async () => {
        await request("/api/pets/" + encodeURIComponent(p.id), { method: "DELETE" });
        await loadPets(o.id);
        render();
        S.toast(p.name + " deleted.");
      });
      return;
    }
    const row = e.target.closest("[data-owner]");   // click a row (not its buttons) to see that owner's pets
    if (row && !e.target.closest("a, button")) {
      selected = row.dataset.owner;
      loadPets(selected).then(render).catch((error) => {
        console.error("Could not load owner pets:", error);
        S.toast(error.message || "Could not load pets.");
      });
      render();
    }
  });
  $("del-cancel").addEventListener("click", () => dlg.close());
  $("del-ok").addEventListener("click", async () => {
    dlg.close();
    if (!pending) return;
    try { await pending(); }
    catch (error) { console.error("Could not delete owner or pet:", error); S.toast(error.message || "Could not complete deletion."); }
  });

  refresh();
})();
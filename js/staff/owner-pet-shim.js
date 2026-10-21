/* js/staff/owner-pet-shim.js
   Lets the shared pet form (js/owner/pet-form.js) work for staff:
   it saves to the pets of the owner in the URL (owner-pet-form.html?owner=<owner>[&id=<pet>])
   and returns to that owner's page afterwards. Must be loaded BEFORE pet-form.js. */
(() => {
  const q = new URLSearchParams(location.search);
  const owner = q.get("owner") || "", petId = q.get("id") || "";
  const O = window.PawOwners;
  const back = "owner-details.html?id=" + encodeURIComponent(owner);

  document.body.dataset.mode = petId ? "edit" : "add";
  document.body.dataset.return = back;
  document.getElementById("go-back").href = back;
  document.getElementById("cancel").href = back;

  if (!owner || !O.exists(owner)) { location.replace("owners-pets.html"); return; }

  window.PawPets = {
    get: (id) => O.getPet(owner, id),
    add: (pet) => O.addPet(owner, pet),
    update: (id, patch) => O.updatePet(owner, id, patch),
    setFlash: (m) => O.setFlash(m)
  };
})();

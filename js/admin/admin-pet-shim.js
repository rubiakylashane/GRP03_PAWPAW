/* js/admin/admin-pet-shim.js
   Lets the shared pet form (js/owner/pet-form.js) work for admin:
   it saves to the pets of the owner in the URL (owner-pet-form.html?owner=<owner>[&id=<pet>])
   and returns to that owner's page afterwards. Must be loaded BEFORE pet-form.js. */
(() => {
  const q = new URLSearchParams(location.search);
  const owner = q.get("owner") || "", petId = q.get("id") || "";
  const O = window.PawOwners;
  const back = "owners-pets.html?owner=" + encodeURIComponent(owner);

  document.body.dataset.mode = petId ? "edit" : "add";
  document.body.dataset.return = back;
  document.getElementById("go-back").href = back;
  document.getElementById("cancel").href = back;

  async function request(url, options) {
    const response = await fetch(url, options);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Could not save the pet.");
    return result;
  }

  window.PawPets = {
    get: async (id) => {
      const pets = await request("/api/pets/owner/" + encodeURIComponent(owner), { headers: { Accept: "application/json" } });
      return pets.find((pet) => String(pet.id) === String(id)) || null;
    },
    add: async (pet) => (await request("/api/pets", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        owner_id: owner, name: pet.name, species: pet.species, breed: pet.breed,
        gender: pet.sex, date_of_birth: pet.dob, allergies: pet.allergies,
        notes: pet.notes, photo: pet.photo
      })
    })).pet,
    update: async (id, pet) => (await request("/api/pets/" + encodeURIComponent(id), {
      method: "PUT",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        name: pet.name, species: pet.species, breed: pet.breed,
        gender: pet.sex, date_of_birth: pet.dob, allergies: pet.allergies,
        notes: pet.notes, photo: pet.photo
      })
    })).pet,
    setFlash: (m) => O.setFlash(m)
  };

  if (!owner) location.replace("owners-pets.html");
})();
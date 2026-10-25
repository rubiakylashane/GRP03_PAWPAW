/* js/owner/pets-store.js
   Shared backend helpers for the pet pages (my-pets, add-pet, edit-pet). */
window.PawPets = (() => {
  let pets = [];
  let loaded = false;

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function ownerId() {
    const user = JSON.parse(sessionStorage.getItem("pawpaw_user") || "null");
    if (!user || !user.ownerId) throw new Error("The signed-in account has no owner profile.");
    return user.ownerId;
  }

  async function request(url, options) {
    const response = await fetch(url, {
      headers: { Accept: "application/json", ...(options && options.body ? { "Content-Type": "application/json" } : {}) },
      ...options
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Pet request failed (${response.status}).`);
    }
    return response.status === 204 ? null : response.json();
  }

  async function load() {
    pets = await request(`/api/pets/owner/${encodeURIComponent(ownerId())}`);
    loaded = true;
    return pets.slice();
  }

  async function get(id) {
    if (!loaded) await load();
    return pets.find((pet) => String(pet.id) === String(id)) || null;
  }

  async function add(pet) {
    const result = await request("/api/pets", {
      method: "POST",
      body: JSON.stringify({
        owner_id: ownerId(),
        name: pet.name,
        species: pet.species,
        breed: pet.breed,
        date_of_birth: pet.dob || null,
        gender: pet.sex,
        allergies: pet.allergies,
        notes: pet.notes,
        photo: pet.photo
      })
    });
    const created = result.pet;
    pets.push(created);
    loaded = true;
    return created;
  }

  async function update(id, patch) {
    const result = await request(`/api/pets/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify({
        name: patch.name,
        species: patch.species,
        breed: patch.breed,
        date_of_birth: patch.dob || null,
        gender: patch.sex,
        allergies: patch.allergies,
        notes: patch.notes,
        photo: patch.photo
      })
    });
    const updated = result.pet;
    pets = pets.map((pet) => String(pet.id) === String(id) ? updated : pet);
    loaded = true;
    return updated;
  }

  /* dob is "YYYY-MM-DD" */
  function ageText(dob) {
    if (!dob) return "";
    const b = new Date(dob + "T00:00:00");
    if (isNaN(b)) return "";
    const now = new Date();
    let months = (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth());
    if (now.getDate() < b.getDate()) months -= 1;
    if (months < 0) return "";
    if (months >= 12) {
      const y = Math.floor(months / 12);
      return y + (y === 1 ? " yr" : " yrs");
    }
    return months >= 1 ? months + " mo" : "Under 1 mo";
  }
  function fmtDate(dob) {
    if (!dob) return "N/A";
    const d = new Date(dob + "T00:00:00");
    return isNaN(d) ? "N/A" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  /* one-time message shown on the next page (e.g. "Pet added.") */
  function setFlash(msg) { try { sessionStorage.setItem("pawpaw_flash", msg); } catch (_) { /* ignore */ } }
  function takeFlash() {
    try {
      const m = sessionStorage.getItem("pawpaw_flash");
      sessionStorage.removeItem("pawpaw_flash");
      return m;
    } catch (_) { return null; }
  }

  return { esc, load, get, add, update, ageText, fmtDate, setFlash, takeFlash };
})();
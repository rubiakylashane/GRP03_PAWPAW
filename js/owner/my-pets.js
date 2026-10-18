/* js/owner/my-pets.js
   Renders the pet cards and the "pet added / saved" message. */
(() => {
  const { esc, load, get, ageText, fmtDate, takeFlash } = window.PawPets;
  const $ = (id) => document.getElementById(id);

  const grid = $("pets-grid");
  const toast = $("toast");

  const photoStyle = (p) => (p.photo ? ` style="background-image:url('${esc(p.photo)}')"` : "");

  function card(p) {
    const age = ageText(p.dob);
    return `
      <article class="pet-card">
        <div class="pet-card-top">
          <span class="pet-photo"${photoStyle(p)} aria-hidden="true"></span>
          <div class="pet-id">
            <h2>${esc(p.name)}</h2>
            <p>${esc(p.species)}${age ? " - " + esc(age) : ""}</p>
          </div>
        </div>
        <dl class="pet-facts">
          <div><dt>Breed</dt><dd>${esc(p.breed)}</dd></div>
          <div><dt>Gender</dt><dd>${esc(p.sex)}</dd></div>
          <div><dt>Date of Birth</dt><dd>${esc(fmtDate(p.dob))}</dd></div>
        </dl>
        <div class="pet-actions">
          <a class="pbtn pbtn-outline" href="pet-details.html?id=${encodeURIComponent(p.id)}">View Details</a>
          <a class="pbtn pbtn-primary" href="edit-pet.html?id=${encodeURIComponent(p.id)}">Edit</a>
        </div>
      </article>`;
  }

  function render() {
    const pets = load();
    grid.innerHTML = pets.length
      ? pets.map(card).join("")
      : `<div class="pets-empty">
           <h2>No pets yet</h2>
           <p>Add your first pet so we can prepare for your visit.</p>
           <a class="pbtn pbtn-primary" href="add-pet.html">Add Pet</a>
         </div>`;
  }

  /* ----- Message from add / edit ----- */
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2800);
  }

  render();
  const flash = takeFlash();
  if (flash) showToast(flash);
})();
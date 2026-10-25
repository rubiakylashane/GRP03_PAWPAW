/* js/owner/profile.js
   My Profile: the owner's details and up to six of their pets. Needs pets-store.js and profile-store.js. */
(async () => {
  const { esc, load: loadPets, ageText, fmtDate, takeFlash } = window.PawPets;
  const $ = (id) => document.getElementById(id);

  let p;
  try {
    p = await window.PawProfile.load();
  } catch (error) {
    console.error("Could not load owner profile:", error);
    $("pr-name").textContent = "Profile unavailable";
    $("pr-pets").innerHTML = '<p class="empty">Your profile could not be loaded. Please refresh and try again.</p>';
    $("pr-viewall").hidden = true;
    return;
  }
  $("pr-name").textContent = p.name;
  $("pr-email").textContent = p.email || "-";
  $("pr-phone").textContent = p.phone || "-";
  const memberSince = String(p.memberSince || "").slice(0, 10);
  const memberSinceDate = /^\d{4}-\d{2}-\d{2}$/.test(memberSince)
    ? new Date(memberSince + "T00:00:00")
    : null;
  $("pr-since").textContent = memberSinceDate && !Number.isNaN(memberSinceDate.getTime())
    ? memberSinceDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "-";
  if (p.address) { $("pr-address").textContent = p.address; $("pr-address-row").hidden = false; }
  if (p.photo) $("pr-avatar").style.backgroundImage = `url('${p.photo}')`;

  /* ----- pets (same card as My Pets) ----- */
  const SHOW = 6;
  let pets;
  try {
    pets = await loadPets();
  } catch (error) {
    console.error("Could not load profile pets:", error);
    $("pr-pets").innerHTML = '<p class="empty">Pet information could not be loaded. Please refresh and try again.</p>';
    $("pr-viewall").hidden = true;
    return;
  }
  const card = (x) => {
    const age = ageText(x.dob);
    return `
      <a class="pet-card pr-pet" href="my-pets.html#view=${encodeURIComponent(x.id)}">
        <div class="pet-card-top">
          <span class="pet-photo"${x.photo ? ` style="background-image:url('${esc(x.photo)}')"` : ""} aria-hidden="true"></span>
          <div class="pet-id">
            <h3>${esc(x.name)}</h3>
            <p>${esc(x.species)}${age ? " - " + esc(age) : ""}</p>
          </div>
        </div>
        <dl class="pet-facts">
          <div><dt>Breed</dt><dd>${esc(x.breed)}</dd></div>
          <div><dt>Gender</dt><dd>${esc(x.sex)}</dd></div>
          <div><dt>Date of Birth</dt><dd>${esc(fmtDate(x.dob))}</dd></div>
        </dl>
      </a>`;
  };
  $("pr-pets").innerHTML = pets.length
    ? pets.slice(0, SHOW).map(card).join("")
    : `<div class="pets-empty"><h2>No pets yet</h2><p>Add your first pet so we can prepare for your visit.</p><a class="pbtn pbtn-primary" href="add-pet.html">Add Pet</a></div>`;
  $("pr-viewall").hidden = pets.length <= SHOW;

  /* ----- message from Edit Profile ----- */
  const flash = takeFlash();
  if (flash) {
    const t = $("toast");
    t.textContent = flash;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2800);
  }
})();
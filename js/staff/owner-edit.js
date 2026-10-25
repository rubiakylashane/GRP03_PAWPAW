/* js/staff/owner-edit.js - Edit an owner's profile + change password (owner-edit.html?id=<owner>) */
(() => {
  const O = window.PawOwners, S = window.PawStaff, $ = (id) => document.getElementById(id);
  const id = S.ownerId();
  const back = "owner-details.html?id=" + encodeURIComponent(id);

  if (!id) { $("owner-form").hidden = true; $("missing").hidden = false; return; }
  $("go-back").href = back; $("cancel").href = back;

  let o;
  fetch("/api/owners/" + encodeURIComponent(id), { headers: { Accept: "application/json" } })
    .then(async (response) => {
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not load the owner.");
      o = result.owner;
      if (!o) throw new Error("Owner not found.");
      initialize();
    })
    .catch((error) => {
      console.error("Could not load owner for editing:", error);
      $("owner-form").hidden = true;
      $("missing").textContent = error.message || "Could not load this owner.";
      $("missing").hidden = false;
    });

  function initialize() {
  const f = { name: $("name"), email: $("email"), address: $("address"), phone: $("phone") };
  f.name.value = o.name; f.email.value = o.email; f.address.value = o.address; f.phone.value = o.phone;

  /* picture */
  let photo = o.photo || "";
  const preview = $("photo-preview"), hint = $("photo-hint"), removeBtn = $("photo-remove");
  function setPhoto(url) {
    photo = url || "";
    preview.hidden = !photo; hint.hidden = !!photo; removeBtn.hidden = !photo;
    if (photo) preview.src = photo; else preview.removeAttribute("src");
  }
  setPhoto(photo);
  $("photo").addEventListener("change", async () => {
    const file = $("photo").files[0];
    S.setError("photo", "");
    if (!file) return;
    if (!file.type.startsWith("image/")) { $("photo").value = ""; return S.setError("photo", "Please choose an image file."); }
    if (file.size > 5 * 1024 * 1024) { $("photo").value = ""; return S.setError("photo", "Image must be 5 MB or smaller."); }
    try { setPhoto(await S.resize(file)); } catch (e) { S.setError("photo", e.message); }
  });
  removeBtn.addEventListener("click", () => { $("photo").value = ""; setPhoto(""); });

  /* show / hide password */
  document.querySelectorAll("[data-eye]").forEach((b) => b.addEventListener("click", () => {
    const input = $(b.dataset.eye);
    input.type = input.type === "password" ? "text" : "password";
  }));

  ["name", "email", "phone", "cur", "new", "conf"].forEach((k) => $(k).addEventListener("input", () => S.setError(k, "")));

  $("owner-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = { name: f.name.value.trim().replace(/\s+/g, " "), email: f.email.value.trim(), address: f.address.value.trim(), phone: f.phone.value.replace(/[\s-]/g, "") };
    const cur = $("cur").value, nw = $("new").value, conf = $("conf").value;
    const errors = {};

    if (!v.name) errors.name = "Enter the owner's name.";
    if (v.email && !O.validEmail(v.email)) errors.email = "Enter a valid email address.";
    if (v.phone && !O.validPhone(v.phone)) errors.phone = "Use a mobile number like 09XXXXXXXXX.";
    if (cur || nw || conf) {            // only checked when staff is changing the password
      if (!cur) errors.cur = "Enter the current password.";
      if (nw.length < 8) errors.new = "Use at least 8 characters.";
      if (conf !== nw) errors.conf = "The passwords do not match.";
    }
    ["name", "email", "phone", "cur", "new", "conf"].forEach((k) => S.setError(k, errors[k]));
    const bad = ["name", "email", "phone", "cur", "new", "conf"].find((k) => errors[k]);
    if (bad) { $(bad).focus(); return; }

    const submit = $("owner-form").querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      const response = await fetch("/api/owners/" + encodeURIComponent(id), {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          name: v.name, email: v.email, phone: v.phone, address: v.address, photo,
          currentPassword: cur || undefined, newPassword: nw || undefined
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not save the owner.");
      O.setFlash(cur || nw ? "Changes saved. Password updated." : "Changes saved.");
      location.href = back;
    } catch (error) {
      console.error("Could not save owner:", error);
      S.setError("name", error.message || "Could not save the owner.");
      if (submit) submit.disabled = false;
    }
  });
  }
})();

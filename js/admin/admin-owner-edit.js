/* js/admin/admin-owner-edit.js - Edit an owner's profile + change password (owner-edit.html?id=<owner>) */
(() => {
  const O = window.PawOwners, S = window.PawStaff, $ = (id) => document.getElementById(id);
  const id = S.ownerId();
  const back = "owners-pets.html?owner=" + encodeURIComponent(id);

  if (!id || !O.exists(id)) { $("owner-form").hidden = true; $("missing").hidden = false; return; }
  $("go-back").href = back; $("cancel").href = back;

  const o = O.owner(id);
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

  $("owner-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = { name: f.name.value.trim().replace(/\s+/g, " "), email: f.email.value.trim(), address: f.address.value.trim(), phone: f.phone.value.replace(/[\s-]/g, "") };
    const cur = $("cur").value, nw = $("new").value, conf = $("conf").value;
    const errors = {};

    if (!v.name) errors.name = "Enter the owner's name.";
    if (v.email && !O.validEmail(v.email)) errors.email = "Enter a valid email address.";
    if (v.phone && !O.validPhone(v.phone)) errors.phone = "Use a mobile number like 09XXXXXXXXX.";
    if (cur || nw || conf) {            // only checked when the admin is changing the password
      if (!cur) errors.cur = "Enter the current password.";
      if (nw.length < 8) errors.new = "Use at least 8 characters.";
      if (conf !== nw) errors.conf = "The passwords do not match.";
    }
    ["name", "email", "phone", "cur", "new", "conf"].forEach((k) => S.setError(k, errors[k]));
    const bad = ["name", "email", "phone", "cur", "new", "conf"].find((k) => errors[k]);
    if (bad) { $(bad).focus(); return; }

    const patch = { email: v.email, phone: v.phone, address: v.address, photo };
    if (v.name !== o.name) Object.assign(patch, { name: v.name, firstName: "", middleName: "", lastName: "" });
    else if (!O.owner(id).first) patch.name = v.name;
    O.saveProfile(id, patch, true);
    window.PawAdmin.log("updated owner " + window.PawAdmin.esc(v.name) + (cur || nw ? " (password changed)" : ""), "update", "owner");
    // when the backend is ready: PUT /api/owners/:id with patch, and (if cur/nw given) POST /api/owners/:id/password
    O.setFlash(cur || nw ? "Changes saved. Password updated." : "Changes saved.");
    location.href = back;
  });
})();
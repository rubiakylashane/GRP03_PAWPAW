/* js/owner/edit-profile.js
   Edit Profile: name, email, address, phone, picture, and (optional) change password.
   Needs pets-store.js (for the flash message) and profile-store.js. */
(() => {
  const $ = (id) => document.getElementById(id);
  const profile = window.PawProfile;
  const { setFlash } = window.PawPets;

  const MIN_PASSWORD = 8;

  const f = { name: $("name"), email: $("email"), address: $("address"), phone: $("phone"), photo: $("photo"),
              current: $("current"), new: $("new"), confirm: $("confirm") };
  let photoData = "";
  const submitButton = $("pr-form").querySelector('[type="submit"]');
  if (submitButton) submitButton.disabled = true;

  /* ----- fill the form ----- */
  profile.load().then((p) => {
    f.name.value = p.name;
    f.email.value = p.email;
    f.address.value = p.address;
    f.phone.value = p.phone;
    setPhoto(p.photo);
    if (submitButton) submitButton.disabled = false;
  }).catch((error) => {
    console.error("Could not load owner profile:", error);
    setError("name", "Your profile could not be loaded. Please refresh and try again.");
  });

  function setError(key, msg) {
    const el = $("err-" + key);
    if (el) { el.textContent = msg || ""; el.hidden = !msg; }
    if (f[key]) f[key].setAttribute("aria-invalid", msg ? "true" : "false");
  }

  /* ----- picture ----- */
  function setPhoto(dataUrl) {
    photoData = dataUrl || "";
    $("photo-preview").hidden = !photoData;
    $("photo-hint").hidden = !!photoData;
    $("photo-remove").hidden = !photoData;
    if (photoData) $("photo-preview").src = photoData; else $("photo-preview").removeAttribute("src");
  }
  function resize(file, max = 480) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const r = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * r);
        c.height = Math.round(img.height * r);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read that image.")); };
      img.src = url;
    });
  }
  f.photo.addEventListener("change", async () => {
    const file = f.photo.files[0];
    setError("photo", "");
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("photo", "Please choose an image file.");
    if (file.size > 5 * 1024 * 1024) return setError("photo", "Image must be 5 MB or smaller.");
    try { setPhoto(await resize(file)); } catch (err) { setError("photo", err.message); }
  });
  $("photo-remove").addEventListener("click", () => { f.photo.value = ""; setPhoto(""); });

  /* ----- show / hide password ----- */
  document.querySelectorAll(".pr-eye").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = $(btn.dataset.for);
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.setAttribute("aria-pressed", String(show));
      btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
    });
  });

  /* ----- save ----- */
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const PHONE_RE = /^(\+?63|0)9\d{9}$/;      // 09XXXXXXXXX or +639XXXXXXXXX

  $("pr-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const errs = {};
    const name = f.name.value.trim();
    const email = f.email.value.trim();
    const phone = f.phone.value.replace(/[\s-]/g, "");

    if (!name) errs.name = "Enter your name.";
    if (email && !EMAIL_RE.test(email)) errs.email = "Enter a valid email, like juan@email.com.";
    if (phone && !PHONE_RE.test(phone)) errs.phone = "Use a mobile number like 09123456789.";

    const changing = f.current.value || f.new.value || f.confirm.value;
    if (changing) {
      if (!f.current.value) errs.current = "Enter your current password.";
      if (f.new.value.length < MIN_PASSWORD) errs.new = "Use at least " + MIN_PASSWORD + " characters.";
      else if (f.new.value === f.current.value) errs.new = "Choose a password different from the current one.";
      if (f.confirm.value !== f.new.value) errs.confirm = "The passwords do not match.";
    }

    ["name", "email", "phone", "current", "new", "confirm"].forEach((k) => setError(k, errs[k]));
    const first = ["name", "email", "phone", "current", "new", "confirm"].find((k) => errs[k]);
    if (first) { f[first].focus(); return; }

    if (submitButton) submitButton.disabled = true;
    try {
      const saved = await profile.save({
        name, email, phone: f.phone.value.trim(), address: f.address.value.trim(), photo: photoData,
        ...(changing ? { currentPassword: f.current.value, newPassword: f.new.value } : {})
      });
      const user = JSON.parse(sessionStorage.getItem("pawpaw_user") || "null");
      if (user) {
        user.name = saved.name;
        sessionStorage.setItem("pawpaw_user", JSON.stringify(user));
      }
      setFlash(changing ? "Profile and password updated." : "Profile updated.");
      location.href = "profile.html";
    } catch (error) {
      console.error("Profile save failed:", error);
      if (/current password/i.test(error.message)) setError("current", error.message);
      else setError("email", error.message || "Your profile could not be saved. Please try again.");
      if (submitButton) submitButton.disabled = false;
    }
  });
})();
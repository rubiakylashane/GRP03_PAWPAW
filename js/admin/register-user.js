/* js/admin/register-user.js - Register User form (admin creates a staff / veterinarian / admin account). */
(() => {
  const A = window.PawAdmin, S = window.PawStaff, $ = (id) => document.getElementById(id);
  const F = { name: $("name"), phone: $("phone"), email: $("email"), password: $("password"), role: $("role") };
  const err = (k, m) => { const e = $("err-" + k); e.textContent = m || ""; e.hidden = !m; F[k].setAttribute("aria-invalid", m ? "true" : "false"); };

  function check() {
    const v = { name: F.name.value.trim().replace(/\s+/g, " "), phone: F.phone.value.replace(/[\s-]/g, ""), email: F.email.value.trim(), password: F.password.value, role: F.role.value };
    const e = {};
    if (!v.name) e.name = "Enter the full name.";
    else if (!/^[A-Za-zÀ-ÿ.'\- ]{2,60}$/.test(v.name)) e.name = "Use letters only.";
    if (!v.phone) e.phone = "Enter the phone number.";
    else if (!A.validPhone(v.phone)) e.phone = "Use a mobile number like 09XXXXXXXXX.";
    if (!v.email) e.email = "Enter the email address.";
    else if (!A.validEmail(v.email)) e.email = "Enter a valid email address.";
    else if (A.emailTaken(v.email)) e.email = "This email is already used by another account.";
    if (!v.password) e.password = "Enter a temporary password.";
    else if (v.password.length < 8) e.password = "Use at least 8 characters.";
    if (!v.role) e.role = "Choose a role.";
    return { v, e };
  }

  $("user-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const { v, e } = check();
    Object.keys(F).forEach((k) => err(k, e[k]));
    const first = Object.keys(F).find((k) => e[k]);
    if (first) { F[first].focus(); return; }
    const u = A.add(v);                      // the temporary password goes to the backend (hashed there); it is not saved in the browser
    A.setFlash("Account created for " + u.name + " (username: " + u.username + ").");
    location.href = "users-staff.html";
  });
  Object.keys(F).forEach((k) => F[k].addEventListener("input", () => err(k, "")));
})();
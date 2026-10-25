/* js/admin/register-user.js - Register User form (admin creates a staff or admin account). */
(() => {
  const A = window.PawAdmin, S = window.PawStaff, $ = (id) => document.getElementById(id);
  const F = { name: $("name"), username: $("username"), phone: $("phone"), email: $("email"), password: $("password"), role: $("role") };
  const err = (k, m) => { const e = $("err-" + k); e.textContent = m || ""; e.hidden = !m; F[k].setAttribute("aria-invalid", m ? "true" : "false"); };

  function check() {
    const v = { name: F.name.value.trim().replace(/\s+/g, " "), username: F.username.value.trim(), phone: F.phone.value.replace(/[\s-]/g, ""), email: F.email.value.trim(), password: F.password.value, role: F.role.value };
    const e = {};
    if (!v.name) e.name = "Enter the full name.";
    else if (!/^[A-Za-zÀ-ÿ.'\- ]{2,60}$/.test(v.name)) e.name = "Use letters only.";
    if (!/^[A-Za-z0-9_]{4,20}$/.test(v.username)) e.username = "Use 4–20 letters, numbers, or underscores.";
    if (!v.phone) e.phone = "Enter the phone number.";
    else if (!A.validPhone(v.phone)) e.phone = "Use a mobile number like 09XXXXXXXXX.";
    if (!v.email) e.email = "Enter the email address.";
    else if (!A.validEmail(v.email)) e.email = "Enter a valid email address.";
    if (!v.password) e.password = "Enter a temporary password.";
    else if (v.password.length < 8) e.password = "Use at least 8 characters.";
    if (!v.role) e.role = "Choose a role.";
    return { v, e };
  }

  $("user-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const { v, e } = check();
    Object.keys(F).forEach((k) => err(k, e[k]));
    const first = Object.keys(F).find((k) => e[k]);
    if (first) { F[first].focus(); return; }
    const submit = $("user-form").querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(v)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not create the account.");
      $("created-username").value = result.user.username;
      $("created-password").value = v.password;
      $("created-credentials").hidden = false;
      $("user-form").hidden = true;
      $("credentials-title").textContent = `${result.user.role === "admin" ? "Admin" : "Staff"} account created`;
      F.password.value = "";
      $("copy-credentials").focus();
    } catch (error) {
      console.error("Could not create user account:", error);
      err(/username/i.test(error.message) ? "username" : /email/i.test(error.message) ? "email" : "name",
        error.message || "Could not create the account.");
      if (submit) submit.disabled = false;
    }
  });
  Object.keys(F).forEach((k) => F[k].addEventListener("input", () => err(k, "")));
  $("copy-credentials").addEventListener("click", async () => {
    const value = `Username: ${$("created-username").value}\nTemporary password: ${$("created-password").value}`;
    try {
      await navigator.clipboard.writeText(value);
      $("credentials-error").hidden = true;
      $("credentials-status").textContent = "Sign-in details copied. Share them securely.";
      $("credentials-status").hidden = false;
    } catch (error) {
      console.error("Could not copy sign-in details:", error);
      $("credentials-status").hidden = true;
      $("credentials-error").textContent = "Copy is unavailable in this browser. Select and copy the username and password above.";
      $("credentials-error").hidden = false;
    }
  });
})();
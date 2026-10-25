/* js/admin/register-vet.js - full "Register veterinarian" form (profile + login account with a temporary password). */
(() => {
  const A = window.PawAdmin, $ = (id) => document.getElementById(id);
  const K = ["name", "username", "phone", "email", "license", "spec", "password"];
  $("spec").innerHTML = `<option value="" selected disabled></option>` + A.SPECS.map((s) => `<option>${A.esc(s)}</option>`).join("");
  const err = (k, m) => { const e = $("err-" + k); e.textContent = m || ""; e.hidden = !m; $(k).setAttribute("aria-invalid", m ? "true" : "false"); };

  $("vet-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const v = { name: $("name").value.trim().replace(/\s+/g, " "), username: $("username").value.trim(), phone: $("phone").value.replace(/[\s-]/g, ""), email: $("email").value.trim(), license: A.normLicense($("license").value), specialization: $("spec").value, password: $("password").value }, e = {};
    if (!v.name) e.name = "Enter the veterinarian's name."; else if (!A.validName(v.name)) e.name = "Use letters only.";
    if (!/^[A-Za-z0-9_]{4,20}$/.test(v.username)) e.username = "Use 4–20 letters, numbers, or underscores.";
    if (!v.phone) e.phone = "Enter the phone number."; else if (!A.validPhone(v.phone)) e.phone = "Use a mobile number like 09XXXXXXXXX.";
    if (!v.email) e.email = "Enter the email address."; else if (!A.validEmail(v.email)) e.email = "Enter a valid email address.";
    if (!$("license").value.trim()) e.license = "Enter the license number."; else if (!v.license) e.license = "Use the format PRC 0012345.";
    if (!v.specialization) e.spec = "Choose a specialization.";
    if (!v.password) e.password = "Enter a temporary password."; else if (v.password.length < 8) e.password = "Use at least 8 characters.";
    K.forEach((k) => err(k, e[k]));
    const first = K.find((k) => e[k]); if (first) { $(first).focus(); return; }
    const submit = $("vet-form").querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      const response = await fetch("/api/admin/veterinarians", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(v)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not register the veterinarian.");
      $("created-username").value = result.veterinarian.username;
      $("created-password").value = v.password;
      $("created-credentials").hidden = false;
      $("vet-form").hidden = true;
      $("password").value = "";
      $("copy-credentials").focus();
    } catch (error) {
      console.error("Could not register veterinarian:", error);
      const field = /username/i.test(error.message) ? "username" : /license/i.test(error.message) ? "license" : /email/i.test(error.message) ? "email" : "name";
      err(field, error.message || "Could not register the veterinarian.");
      if (submit) submit.disabled = false;
    }
  });
  K.forEach((k) => $(k).addEventListener("input", () => err(k, "")));
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
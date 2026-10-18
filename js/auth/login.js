/* js/auth/login.js
   Handles show/hide password, validation and redirect after login.
   Set USE_BACKEND = true and edit API when the backend is ready.
   While false, any username + password works (demo). */
(() => {
  const USE_BACKEND = false;
  const API = { login: "/api/auth/login" }; // POST { username, password } -> { token, role, name, mustChangePassword }

  // Where each role lands after login (paths are relative to pages/auth/)
   const HOME = {
    owner: "../owner/dashboard.html",   // dati: "../owner/dashboard.html"
    staff: "../staff/dashboard.html",
    vet: "../vet/dashboard.html",
    admin: "../admin/dashboard.html"
  };
  const CHANGE_TEMP_PASSWORD = "change-temp-password.html";

  const $ = (id) => document.getElementById(id);
  const form = $("login-form");
  const username = $("username");
  const password = $("password");
  const submit = form.querySelector(".submit");

  /* ----- Show / hide password ----- */
  const toggle = $("toggle-password");
  if (toggle) {
    toggle.addEventListener("click", () => {
      const show = password.type === "password";
      password.type = show ? "text" : "password";
      toggle.setAttribute("aria-pressed", String(show));
      toggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
    });
  }

  /* ----- Error message (created here, no HTML change needed) ----- */
  const error = document.createElement("p");
  error.setAttribute("role", "alert");
  error.hidden = true;
  error.style.cssText = "color:#c62828;font-size:12px;margin:0 0 12px;";
  form.insertBefore(error, submit);

  function showError(msg) {
    error.textContent = msg;
    error.hidden = !msg;
  }

  /* ----- Login request ----- */
  async function login(user, pass) {
    if (USE_BACKEND) {
      const res = await fetch(API.login, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user, password: pass })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Incorrect username or password.");
      return data;
    }

    // DEMO: type "admin", "vet" or "staff" as username to test other roles
    await new Promise((r) => setTimeout(r, 500));
    const role = ["admin", "vet", "staff"].includes(user.toLowerCase()) ? user.toLowerCase() : "owner";
    return { token: "demo-token", role, name: user, mustChangePassword: false };
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const user = username.value.trim();
    const pass = password.value;

    username.classList.remove("invalid");
    password.classList.remove("invalid");

    if (!user || !pass) {
      if (!user) username.classList.add("invalid");
      if (!pass) password.classList.add("invalid");
      return showError("Enter your username and password.");
    }
    showError("");

    const original = submit.textContent;
    submit.disabled = true;
    submit.textContent = "Signing in...";

    try {
      const data = await login(user, pass);

      try {
        sessionStorage.setItem("pawpaw_user", JSON.stringify({ name: data.name || user, role: data.role }));
        if (data.token) sessionStorage.setItem("token", data.token);
      } catch (_) { /* storage blocked, ignore */ }

      if (data.mustChangePassword) {
        window.location.href = CHANGE_TEMP_PASSWORD;
        return;
      }
      window.location.href = HOME[data.role] || HOME.owner;
    } catch (err) {
      showError(err.message);
      submit.disabled = false;
      submit.textContent = original;
    }
  });
})();
/* js/auth/login.js
   Handles show/hide password, validation and redirect after login.
   Set USE_BACKEND = true and edit API when the backend is ready.
   While false, any password works (demo). Sign in with a USERNAME or an EMAIL. */
(() => {
  const USE_BACKEND = false;
  const API = { login: "/api/auth/login" }; // POST { username, password } -> { token, role, name, mustChangePassword }
  // "username" may be the username OR the email: the server looks up the account by either one.

  // Where each role lands after login (paths are relative to pages/auth/)
   const HOME = {
    owner: "../owner/dashboard.html",   
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

  if (username && !username.placeholder) username.placeholder = "Username or email";

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

  /* ----- DEMO ONLY: find the account by username OR email -----
     The accounts live in this browser (admin-store.js: staff / vet / admin accounts + the owners who registered).
     admin-store.js is loaded on demand so this also works on a fresh browser. The backend does this lookup itself. */
  function loadAdminStore() {
    if (window.PawAdmin) return Promise.resolve(window.PawAdmin);
    return new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = "../../js/admin/admin-store.js";
      s.charset = "utf-8";
      s.onload = () => resolve(window.PawAdmin || null);
      s.onerror = () => resolve(null);
      document.head.appendChild(s);
    });
  }
  async function findAccount(id) {
    const A = await loadAdminStore();
    if (!A || typeof A.list !== "function") return null;
    const key = id.toLowerCase();
    try {
      return A.list().find((u) =>
        String(u.username || "").toLowerCase() === key ||
        (u.email && String(u.email).toLowerCase() === key)
      ) || null;
    } catch (_) { return null; }
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
      if (!res.ok) throw new Error(data.message || "Incorrect username/email or password.");
      return data;
    }

    // DEMO: a username or email of a saved account signs in as that account.
    //       Typing "admin", "vet" or "staff" still opens that role; anything else is an owner.
    await new Promise((r) => setTimeout(r, 500));
    const acc = await findAccount(user);
    if (acc) {
      const role = acc.role === "owner" ? "owner" : acc.role;
      // an owner is known by the username (their data is saved under it); staff / vet / admin by their full name
      return { token: "demo-token", role, name: acc.owner ? acc.username : (acc.name || acc.username), mustChangePassword: false };
    }
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
      return showError("Enter your username or email and password.");
    }
    showError("");

    const original = submit.textContent;
    submit.disabled = true;
    submit.textContent = "Logging in...";

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
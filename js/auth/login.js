/* Handles show/hide password, validation and redirect after login. */
(() => {
  const API = { login: "/api/auth/login" };

  // Where each role lands after login (paths are relative to pages/auth/)
  const HOME = {
    owner: "../owner/dashboard.html",
    staff: "../staff/dashboard.html",
    vet: "../vet/dashboard.html",
    admin: "../admin/dashboard.html"
  };

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
  error.className = "error";
  form.insertBefore(error, submit);

  function showError(msg) {
    error.textContent = msg;
    error.hidden = !msg;
  }

  if (new URLSearchParams(window.location.search).get("session") === "expired") {
    showError("Your session expired. Please sign in again.");
  }

  /* ----- Login request ----- */
  async function login(user, pass) {
    const res = await fetch(API.login, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: user, password: pass })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || data.error || "Unable to sign in. Please try again.");
    }

    const account = data.user || data;
    const role = normalizeRole(account.role);
    if (!role) {
      throw new Error("This account has an unsupported role. Please contact the clinic.");
    }

    return {
      id: account.userId || account.user_id || account.id,
      ownerId: account.ownerId || account.owner_id,
      username: account.username || user,
      name: account.name || account.fullName || account.full_name || account.username || user,
      role
    };
  }

  function normalizeRole(value) {
    const role = String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ");
    if (["owner", "pet owner"].includes(role)) return "owner";
    if (["staff", "clinic staff"].includes(role)) return "staff";
    if (["vet", "veterinarian"].includes(role)) return "vet";
    if (["admin", "administrator"].includes(role)) return "admin";
    return "";
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
        sessionStorage.setItem("pawpaw_user", JSON.stringify(data));
      } catch (storageError) {
        throw new Error("Your browser could not save the sign-in session. Enable site storage and try again.");
      }

      window.location.href = HOME[data.role];
    } catch (err) {
      showError(err.message || "Unable to sign in. Please try again.");
      submit.disabled = false;
      submit.textContent = original;
    }
  });
})();
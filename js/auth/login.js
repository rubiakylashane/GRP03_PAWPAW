const form = document.getElementById("login-form");
const pw = document.getElementById("password");
const toggle = document.getElementById("toggle-password");

/* ---------- Show / hide password ---------- */
toggle.addEventListener("click", () => {
  const show = pw.type === "password";
  pw.type = show ? "text" : "password";
  toggle.setAttribute("aria-pressed", String(show));
  toggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
});

/* ---------- Prototype accounts (remove when the backend is ready) ---------- */
const DEMO_USERS = {
  njyabila:  "admin",     // <--- Idinagdag ko ang account mo rito (admin role)
  msantos:   "owner",
  adelacruz: "staff",
  preyes:    "vet",
  admin:     "admin",
};

/* ---------- Errors ---------- */
function setError(input, message) {
  const holder = input.closest(".field");
  let el = holder.querySelector(".error");
  if (!message) {
    if (el) el.remove();
    input.removeAttribute("aria-invalid");
    return;
  }
  if (!el) {
    el = document.createElement("p");
    el.className = "error";
    el.setAttribute("role", "alert");
    holder.appendChild(el);
  }
  el.textContent = message;
  input.setAttribute("aria-invalid", "true");
}

form.addEventListener("input", (e) => setError(e.target, ""));

/* ---------- Submit ---------- */
form.addEventListener("submit", (e) => {
  e.preventDefault();

  const usernameInput = form.elements.username;
  const passwordInput = form.elements.password;
  const username = usernameInput.value.trim().toLowerCase();
  const password = passwordInput.value;

  setError(usernameInput, "");
  setError(passwordInput, "");

  if (!username) {
    setError(usernameInput, "Enter your username.");
    usernameInput.focus();
    return;
  }
  if (!password) {
    setError(passwordInput, "Enter your password.");
    passwordInput.focus();
    return;
  }

  // TODO: replace this block with a request to your backend login endpoint
  const role = DEMO_USERS[username];
  if (!role) {
    setError(passwordInput, "Incorrect username or password.");
    return;
  }

  sessionStorage.setItem("pawpaw_role", role);
  sessionStorage.setItem("pawpaw_user", username);
  window.location.href = `../${role}/dashboard.html`;
});
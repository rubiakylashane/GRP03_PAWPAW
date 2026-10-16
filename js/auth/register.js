const form = document.getElementById("register-form");
const steps = [...form.querySelectorAll(".step")];
let current = 0;

/* ---------- Step navigation ---------- */
function showStep(i) {
  current = i;
  steps.forEach((s, idx) => (s.hidden = idx !== i));
  const first = steps[i].querySelector("input:not([type=file]), textarea");
  if (first) first.focus();
}

form.querySelectorAll("[data-next]").forEach((btn) =>
  btn.addEventListener("click", () => {
    if (validateStep(steps[current])) showStep(current + 1);
  })
);

form.querySelectorAll("[data-back]").forEach((btn) =>
  btn.addEventListener("click", () => showStep(current - 1))
);

/* ---------- Validation ---------- */
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

function validateStep(step) {
  let ok = true;
  let firstBad = null;

  step.querySelectorAll("input:not([type=file]), textarea").forEach((input) => {
    const value = input.value.trim();
    let message = "";

    if (input.required && !value) {
      message = "This field is required.";
    } else if (input.type === "email" && value && !input.checkValidity()) {
      message = "Enter a valid email address.";
    } else if (input.name === "contact_number" && value &&
               !/^(09|\+639)\d{9}$/.test(value.replace(/\s+/g, ""))) {
      message = "Enter a valid mobile number, e.g. 09XX XXX XXXX.";
    } else if (input.name === "username" && value &&
               !/^[a-zA-Z0-9_]{4,20}$/.test(value)) {
      message = "Use 4 to 20 letters, numbers, or underscores.";
    } else if (input.name === "password" && value && value.length < 8) {
      message = "Use at least 8 characters.";
    } else if (input.name === "confirm_password" && value &&
               value !== form.elements.password.value) {
      message = "Passwords do not match.";
    }

    setError(input, message);
    if (message) {
      ok = false;
      if (!firstBad) firstBad = input;
    }
  });

  if (firstBad) firstBad.focus();
  return ok;
}

form.addEventListener("input", (e) => {
  if (e.target.matches("input, textarea")) setError(e.target, "");
});

/* ---------- Show / hide password ---------- */
document.querySelectorAll("[data-toggle]").forEach((btn) =>
  btn.addEventListener("click", () => {
    const input = document.getElementById(btn.dataset.toggle);
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.setAttribute("aria-pressed", String(show));
    btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
  })
);

/* ---------- Photo preview ---------- */
const photo = document.getElementById("photo");
const preview = document.getElementById("photo-preview");
const hint = document.getElementById("photo-hint");

photo.addEventListener("change", () => {
  const file = photo.files[0];
  if (!file) {
    preview.hidden = true;
    hint.hidden = false;
    return;
  }
  preview.src = URL.createObjectURL(file);
  preview.hidden = false;
  hint.hidden = true;
});

/* ---------- Submit ---------- */
form.addEventListener("submit", (e) => {
  e.preventDefault();

  // Re-check steps 1 and 2 in case something was skipped
  for (let i = 0; i < 2; i++) {
    if (!validateStep(steps[i])) {
      showStep(i);
      return;
    }
  }

  const data = new FormData(form);
  data.delete("confirm_password");
  console.log("register:", Object.fromEntries(data));
  // TODO: send `data` to your backend register endpoint

  // Feedback while there is no backend yet
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = "Account created!";
  setTimeout(() => (window.location.href = "login.html"), 1200);
});
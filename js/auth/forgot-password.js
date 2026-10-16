/* js/auth/forgot-password.js
   Set USE_BACKEND = true and edit API once the backend is ready.
   While false, everything is simulated (demo OTP: 123456). */
(() => {
  const USE_BACKEND = false;
  const API = {
    sendOtp: "/api/forgot-password/send-otp",     // POST { contact }
    verifyOtp: "/api/forgot-password/verify-otp", // POST { contact, otp }
    reset: "/api/forgot-password/reset"           // POST { contact, otp, password }
  };
  const DEMO_OTP = "123456";
  const RESEND_SECONDS = 60;

  const $ = (id) => document.getElementById(id);
  const stepIds = ["step-1", "step-2", "step-3", "step-done"];
  const state = { contact: "", otp: "" };
  let resendTimer = null;

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  function showStep(id) {
    stepIds.forEach((s) => { $(s).hidden = s !== id; });
  }

  function setError(el, message) {
    el.textContent = message || "";
    el.hidden = !message;
  }

  async function post(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "Something went wrong. Please try again.");
    return data;
  }

  // Accepts 09XXXXXXXXX, +639XXXXXXXXX, 639XXXXXXXXX -> 09XXXXXXXXX
  function normalizePH(value) {
    const n = value.replace(/[\s-]/g, "");
    if (/^09\d{9}$/.test(n)) return n;
    if (/^\+?639\d{9}$/.test(n)) return "0" + n.replace(/^\+?63/, "");
    return null;
  }

  const mask = (n) => n.slice(0, 4) + "•••••" + n.slice(-2);

  function startCooldown() {
    const btn = $("resend-btn");
    let left = RESEND_SECONDS;
    btn.disabled = true;
    btn.textContent = `Resend in ${left}s`;
    clearInterval(resendTimer);
    resendTimer = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        clearInterval(resendTimer);
        btn.disabled = false;
        btn.textContent = "Resend code";
      } else {
        btn.textContent = `Resend in ${left}s`;
      }
    }, 1000);
  }

  async function sendOtp(contact) {
    if (USE_BACKEND) return post(API.sendOtp, { contact });
    await wait(500);
    console.log("[DEMO] OTP for", contact, "is", DEMO_OTP);
  }

  function withLoading(btn, loadingText, fn) {
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = loadingText;
    return fn().finally(() => {
      btn.disabled = false;
      btn.textContent = original;
    });
  }

  /* Step 1: contact number */
  $("contact-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $("contact");
    const contact = normalizePH(input.value);
    if (!contact) {
      input.classList.add("invalid");
      return setError($("contact-error"), "Enter a valid PH mobile number (e.g. 09123456789).");
    }
    input.classList.remove("invalid");
    setError($("contact-error"), "");

    await withLoading($("contact-submit"), "Sending...", async () => {
      try {
        await sendOtp(contact);
        state.contact = contact;
        $("masked-contact").textContent = mask(contact);
        showStep("step-2");
        $("otp").focus();
        startCooldown();
      } catch (err) {
        input.classList.add("invalid");
        setError($("contact-error"), err.message);
      }
    });
  });

  /* Step 2: OTP */
  $("otp").addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/\D/g, "");
  });

  $("otp-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $("otp");
    const otp = input.value.trim();
    if (otp.length !== 6) {
      input.classList.add("invalid");
      return setError($("otp-error"), "Enter the 6-digit code.");
    }
    input.classList.remove("invalid");
    setError($("otp-error"), "");

    await withLoading($("otp-submit"), "Verifying...", async () => {
      try {
        if (USE_BACKEND) {
          await post(API.verifyOtp, { contact: state.contact, otp });
        } else {
          await wait(400);
          if (otp !== DEMO_OTP) throw new Error("Incorrect or expired OTP.");
        }
        state.otp = otp;
        showStep("step-3");
        $("new-password").focus();
      } catch (err) {
        input.classList.add("invalid");
        setError($("otp-error"), err.message);
      }
    });
  });

  $("resend-btn").addEventListener("click", async () => {
    try {
      await sendOtp(state.contact);
      setError($("otp-error"), "");
      startCooldown();
    } catch (err) {
      setError($("otp-error"), err.message);
    }
  });

  /* Step 3: new password */
  document.querySelectorAll("[data-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = $(btn.dataset.toggle);
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.setAttribute("aria-pressed", String(show));
      btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
    });
  });

  $("reset-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const p1 = $("new-password");
    const p2 = $("confirm-password");
    [p1, p2].forEach((i) => i.classList.remove("invalid"));

    let msg = "";
    if (p1.value.length < 8) {
      msg = "Password must be at least 8 characters.";
      p1.classList.add("invalid");
    } else if (!/[A-Za-z]/.test(p1.value) || !/\d/.test(p1.value)) {
      msg = "Use at least one letter and one number.";
      p1.classList.add("invalid");
    } else if (p1.value !== p2.value) {
      msg = "Passwords do not match.";
      p2.classList.add("invalid");
    }
    setError($("reset-error"), msg);
    if (msg) return;

    await withLoading($("reset-submit"), "Saving...", async () => {
      try {
        if (USE_BACKEND) {
          await post(API.reset, { contact: state.contact, otp: state.otp, password: p1.value });
        } else {
          await wait(500);
        }
        showStep("step-done");
      } catch (err) {
        setError($("reset-error"), err.message);
      }
    });
  });
})();
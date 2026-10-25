/* js/auth-guard.js - keeps a page for its own role (demo mode: reads the user saved by login.js).
   Put it in <head> of every page that is not public, BEFORE the other scripts:
     <script src="../../js/auth-guard.js" data-role="staff"></script>
   data-role takes one role or a list: "owner" | "staff" | "vet" | "admin" | "staff,admin".
   - not signed in            -> pages/auth/login.html
   - signed in with a wrong role -> that role's own home page
   Backend: this only hides pages in the browser. The server must still check the role on every request. */
(() => {
  const me = document.currentScript;
  const allowed = String((me && me.dataset.role) || "").split(",").map((s) => s.trim()).filter(Boolean);
  const base = location.pathname.replace(/\/pages\/[^/]*\/[^/]*$/, "/pages/");   // .../pages/
  const HOME = { owner: "owner/dashboard.html", staff: "staff/dashboard.html", vet: "vet/dashboard.html", admin: "admin/dashboard.html" };

  let user = null;
  for (const store of ["sessionStorage", "localStorage"]) {
    try { const u = JSON.parse(window[store].getItem("pawpaw_user") || "null"); if (u && u.name) { user = u; break; } } catch (_) { /* ignore */ }
  }
  if (!allowed.length) return;
  document.documentElement.style.visibility = "hidden";                          // no flash of the page while redirecting
  if (!user) { location.replace(base + "auth/login.html"); return; }
  // a saved user without a role (older login) is let in
  if (user.role && allowed.indexOf(user.role) < 0) { location.replace(base + (HOME[user.role] || "auth/login.html")); return; }
  document.documentElement.style.visibility = "";
})();

/* ---- Confirm before logging out (every role) ----
   Any link/button that is #logout, .logout, [data-logout], or whose text is "Log out" asks first.
   "Log out" carries on with the link's normal action (clears the saved user and goes to login);
   "Cancel", Esc or a click outside closes the box and stays on the page. */
(() => {
  const SEL = "#logout, .logout, [data-logout]";
  const TEXT = /^\s*log\s*-?\s*out\s*$/i;
  let box = null, lastFocus = null, confirmed = false;

  function findTrigger(target) {
    if (!target || !target.closest || target.closest(".pp-lo")) return null;   // not the box's own buttons
    const hit = target.closest(SEL);
    if (hit) return hit;
    const el = target.closest("a, button");
    return el && TEXT.test(el.textContent || "") ? el : null;
  }

  function close() {
    if (!box) return;
    box.remove(); box = null;
    document.removeEventListener("keydown", onKey, true);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key === "Tab" && box) {                       // keep focus inside the box
      const btns = box.querySelectorAll("button");
      const first = btns[0], last = btns[btns.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  function ask(trigger) {
    if (box) return;
    lastFocus = trigger;
    if (!document.getElementById("pp-lo-style")) {
      const st = document.createElement("style");
      st.id = "pp-lo-style";
      st.textContent =
        ".pp-lo{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(10,24,20,.55);font-family:Inter,system-ui,sans-serif}" +
        ".pp-lo-card{width:100%;max-width:380px;background:#fff;color:#1a1a1a;border-radius:14px;padding:24px 24px 20px;box-shadow:0 18px 50px rgba(0,0,0,.35)}" +
        ".pp-lo-card h2{margin:0 0 6px;font-size:18px;font-weight:700}" +
        ".pp-lo-card p{margin:0 0 20px;font-size:14px;line-height:1.45;color:#555}" +
        ".pp-lo-row{display:flex;gap:10px;justify-content:flex-end}" +
        ".pp-lo-row button{font:inherit;font-size:14px;font-weight:600;padding:9px 18px;border-radius:8px;cursor:pointer;border:1px solid #cfd8d5;background:#fff;color:#1a1a1a}" +
        ".pp-lo-row .pp-lo-ok{background:#0f6b5c;border-color:#0f6b5c;color:#fff}" +
        ".pp-lo-row .pp-lo-ok:hover{background:#0b5649}.pp-lo-row button:focus-visible{outline:2px solid #e29d1a;outline-offset:2px}";
      document.head.appendChild(st);
    }
    box = document.createElement("div");
    box.className = "pp-lo";
    box.innerHTML =
      '<div class="pp-lo-card" role="alertdialog" aria-modal="true" aria-labelledby="pp-lo-t" aria-describedby="pp-lo-d">' +
      '<h2 id="pp-lo-t">Log out?</h2><p id="pp-lo-d">Are you sure you want to log out of your account?</p>' +
      '<div class="pp-lo-row"><button type="button" class="pp-lo-cancel">Cancel</button><button type="button" class="pp-lo-ok">Log out</button></div></div>';
    box.addEventListener("click", (e) => { if (e.target === box) close(); });
    box.querySelector(".pp-lo-cancel").addEventListener("click", close);
    box.querySelector(".pp-lo-ok").addEventListener("click", () => {
      const t = trigger;
      close();
      confirmed = true;
      t.click();                                        // run the link's normal log-out action
    });
    document.body.appendChild(box);
    document.addEventListener("keydown", onKey, true);
    box.querySelector(".pp-lo-cancel").focus();
  }

  document.addEventListener("click", (e) => {
    if (confirmed) { confirmed = false; return; }       // the click we re-sent after "Log out"
    const t = findTrigger(e.target);
    if (!t) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    ask(t);
  }, true);
})();
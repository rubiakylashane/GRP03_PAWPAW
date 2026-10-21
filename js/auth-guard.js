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
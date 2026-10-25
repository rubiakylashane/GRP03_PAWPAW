/* js/admin/users-staff.js - Users and Staff list (filter by role, edit role, reset password, activate / deactivate).
   Data and rules live in admin-store.js. */
(() => {
  const A = window.PawAdmin, S = window.PawStaff, $ = (id) => document.getElementById(id);
  const toast = (m) => { try { if (S && S.toast) S.toast(m); } catch (_) { /* ignore */ } };
  const fail = (msg) => { const box = $("u-rows"); if (box) box.innerHTML = `<p class="u-empty">Could not load the users: ${String(msg).replace(/[<>&]/g, "")}. Open the browser console (F12) for details.</p>`; };
  if (!A) { fail("js/admin/admin-store.js did not load"); return; }
  let all = [], filter = "all", current = null, loadFailed = "";
  const request = async (url, options) => {
    const response = await fetch(url, {
      headers: { Accept: "application/json", ...(options && options.body ? { "Content-Type": "application/json" } : {}) },
      ...options
    });
    const result = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result && result.error || `Clinic request failed (${response.status}).`);
    return result;
  };
  function signedInUsername() {
    for (const store of ["sessionStorage", "localStorage"]) {
      try {
        const user = JSON.parse(window[store].getItem("pawpaw_user") || "null");
        if (user && user.username) return String(user.username).toLowerCase();
      } catch (_) { /* ignore */ }
    }
    return "";
  }

  const btn = (act, cls, label, id) => `<button type="button" class="u-act ${cls}" data-act="${act}" data-id="${A.esc(id)}">${label}</button>`;
  function actions(u) {
    const self = u.username.toLowerCase() === signedInUsername();
    const reset = btn("reset", "", "Reset password", u.id);
    const toggle = u.status === "active" ? btn("deactivate", "u-act-red", "Deactivate", u.id) : btn("activate", "u-act-green", "Activate", u.id);
    if (u.role === "admin") return reset;                                   // admins: only reset password
    if (u.role === "owner") return u.status === "active" ? reset + toggle : toggle;
    return u.status === "active" ? btn("role", "", "Edit role", u.id) + reset + toggle : btn("role", "", "Edit role", u.id) + toggle;
  }
  const row = (u) => `
    <div class="u-row" role="row">
      <span role="cell" class="u-name" data-label="Username">${A.esc(u.username)}</span>
      <span role="cell" class="u-email" data-label="Email">${A.esc(u.email || "-")}</span>
      <span role="cell" data-label="Role">${A.esc(A.ROLES[u.role])}</span>
      <span role="cell" data-label="Status"><span class="u-pill ${u.status === "active" ? "u-on" : "u-off"}">${u.status === "active" ? "Active" : "Inactive"}</span></span>
      <span role="cell" data-label="Created">${A.esc(A.fmtDate(u.createdAt))}</span>
      <span role="cell" class="u-actions-cell">${actions(u)}</span>
    </div>`;

  function render() {
    const rows = all.filter((u) => filter === "all" || u.role === filter);
    if (loadFailed) { fail(loadFailed); return; }
    try { $("u-rows").innerHTML = rows.length ? rows.map(row).join("") : `<p class="u-empty">No users here yet.</p>`; } catch (e) { console.error(e); fail(e.message); }
    document.querySelectorAll(".u-tab").forEach((t) => { const on = t.dataset.role === filter; t.classList.toggle("on", on); t.setAttribute("aria-selected", String(on)); });
  }

  document.querySelector(".u-tabs").addEventListener("click", (e) => { const t = e.target.closest("[data-role]"); if (t) { filter = t.dataset.role; render(); } });

  const roleDlg = $("role-dialog"), pwDlg = $("pw-dialog"), stDlg = $("st-dialog");
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    current = all.find((u) => u.id === b.dataset.id); if (!current) return;
    if (b.dataset.act === "role") { $("role-sub").textContent = current.username + " (" + A.ROLES[current.role] + ")"; $("role-select").value = current.role; roleDlg.showModal(); }
    else if (b.dataset.act === "reset") { $("pw-sub").textContent = current.username + " · " + (current.email || ""); $("pw-new").value = ""; $("pw-err").hidden = true; pwDlg.showModal(); $("pw-new").focus(); }
    else { const on = b.dataset.act === "deactivate"; $("st-title").textContent = on ? "Deactivate account" : "Activate account"; $("st-sub").textContent = on ? current.username + " will not be able to sign in until you activate the account again." : current.username + " will be able to sign in again."; $("st-ok").textContent = on ? "Deactivate" : "Activate"; $("st-ok").className = "btn " + (on ? "btn-danger" : "btn-primary"); $("st-ok").dataset.to = on ? "inactive" : "active"; stDlg.showModal(); }
  });

  $("role-cancel").addEventListener("click", () => roleDlg.close());
  $("role-save").addEventListener("click", async () => {
    const role = $("role-select").value;
    if (role === current.role) { roleDlg.close(); return; }
    try {
      await request(`/api/admin/users/${encodeURIComponent(current.id)}`, { method: "PATCH", body: JSON.stringify({ role }) });
      current.role = role; roleDlg.close(); render(); toast("Role changed to " + A.ROLES[role] + ".");
    } catch (error) { console.error("Could not change account role:", error); $("role-sub").textContent = error.message; }
  });
  $("pw-cancel").addEventListener("click", () => pwDlg.close());
  $("pw-save").addEventListener("click", async () => {
    const temporaryPassword = $("pw-new").value;
    if (temporaryPassword.length < 8) { $("pw-err").textContent = "Use at least 8 characters."; $("pw-err").hidden = false; return; }
    try {
      await request(`/api/admin/users/${encodeURIComponent(current.id)}/reset-password`, {
        method: "POST", body: JSON.stringify({ temporaryPassword })
      });
      pwDlg.close(); toast("Password reset for " + current.username + ".");
    } catch (error) { console.error("Could not reset account password:", error); $("pw-err").textContent = error.message; $("pw-err").hidden = false; }
  });
  $("st-cancel").addEventListener("click", () => stDlg.close());
  $("st-ok").addEventListener("click", async () => {
    const status = $("st-ok").dataset.to;
    try {
      await request(`/api/admin/users/${encodeURIComponent(current.id)}`, { method: "PATCH", body: JSON.stringify({ status }) });
      current.status = status; stDlg.close(); render(); toast(current.username + (status === "active" ? " activated." : " deactivated."));
    } catch (error) { console.error("Could not update account status:", error); $("st-sub").textContent = error.message; }
  });

  request("/api/admin/users").then((users) => {
    all = users.filter((user) => user && typeof user.username === "string");
    render();
    toast(A.takeFlash());
  }).catch((error) => {
    console.error("Could not load user accounts:", error);
    loadFailed = error.message;
    render();
  });
})();
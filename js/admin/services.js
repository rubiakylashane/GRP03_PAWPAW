/* js/admin/services.js - admin Services list (Edit, Delete)
   Data: PawAdmin.services() ("pawpaw_services", seeded from services-data.js). Owners and staff read the same list.
   Delete is blocked when the service is already used in an appointment.
   Backend: GET /api/services, DELETE /api/services/:id (409 when it is used in an appointment). */
(() => {
  const A = window.PawAdmin, S = window.PawStaff, $ = (id) => document.getElementById(id);
  const esc = A.esc;
  let pending = null;

  function render() {
    const list = A.services();
    $("sv-rows").innerHTML = list.length ? list.map((s) => `
      <div class="sv-row" role="row">
        <span role="cell" class="sv-name">${esc(s.name)}</span>
        <span role="cell" class="sv-desc">${esc(s.desc || "-")}</span>
        <span role="cell" class="sv-price">${esc(A.peso(s.price))}</span>
        <span role="cell" class="sv-acts"><a class="u-act" href="service-form.html?id=${encodeURIComponent(s.id)}">Edit</a><button type="button" class="u-act u-act-red" data-del="${esc(s.id)}">Delete</button></span>
      </div>`).join("") : `<p class="sv-empty">No services yet. Use Add Service to create one.</p>`;
  }

  const dlg = $("del-dialog");
  function ask(title, text, blocked, run) {
    $("del-title").textContent = title; $("del-sub").textContent = text;
    $("del-ok").hidden = blocked; $("del-cancel").textContent = blocked ? "Close" : "Cancel";
    pending = run; dlg.showModal();
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-del]"); if (!b) return;
    const s = A.services().find((x) => x.id === b.dataset.del); if (!s) return;
    const n = A.serviceUses(s);
    if (n) ask("Cannot delete", s.name + " is already used in " + n + (n === 1 ? " appointment" : " appointments") + ", so it stays on record. Edit it instead.", true);
    else ask("Delete service", "Delete " + s.name + "? Owners and staff will no longer see it. This cannot be undone.", false, () => { A.deleteService(s.id); render(); S.toast(s.name + " deleted."); });
  });
  $("del-cancel").addEventListener("click", () => dlg.close());
  $("del-ok").addEventListener("click", () => { dlg.close(); if (pending) pending(); });

  S.toast(A.takeFlash());
  render();
})();
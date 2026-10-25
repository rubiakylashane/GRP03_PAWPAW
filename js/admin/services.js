/* js/admin/services.js - admin Services list (Edit, Deactivate / Activate)
   Data: PawAdmin.services() ("pawpaw_services", seeded from services-data.js). Owners and staff read the same list.
   Nothing is deleted: a service gets status "inactive" (owners and staff stop seeing it when booking); past appointments and revenue keep it.
   Backend: GET /api/services, PATCH /api/services/:id { status: "active" | "inactive" }. */
(() => {
  const A = window.PawAdmin, S = window.PawStaff, $ = (id) => document.getElementById(id);
  const esc = A.esc;
  let pending = null;

  function render() {
    const list = A.services();
    $("sv-rows").innerHTML = list.length ? list.map((s) => `
      <div class="sv-row${s.status === "inactive" ? " sv-off" : ""}" role="row">
        <span role="cell" class="sv-name">${esc(s.name)}${s.status === "inactive" ? ' <span class="sv-tag">Inactive</span>' : ""}</span>
        <span role="cell" class="sv-desc">${esc(s.desc || "-")}</span>
        <span role="cell" class="sv-price">${esc(A.peso(s.price))}</span>
        <span role="cell" class="sv-acts"><a class="u-act" href="service-form.html?id=${encodeURIComponent(s.id)}">Edit</a>${s.status === "inactive" ? `<button type="button" class="u-act u-act-green" data-toggle="${esc(s.id)}">Activate</button>` : `<button type="button" class="u-act u-act-red" data-toggle="${esc(s.id)}">Deactivate</button>`}</span>
      </div>`).join("") : `<p class="sv-empty">No services yet. Use Add Service to create one.</p>`;
  }

  const dlg = $("del-dialog");
  function ask(title, text, okLabel, danger, run) {
    $("del-title").textContent = title; $("del-sub").textContent = text;
    $("del-ok").textContent = okLabel; $("del-ok").className = "btn " + (danger ? "btn-danger" : "btn-primary");
    pending = run; dlg.showModal();
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-toggle]"); if (!b) return;
    const s = A.services().find((x) => x.id === b.dataset.toggle); if (!s) return;
    const off = s.status !== "inactive";
    ask(off ? "Deactivate service" : "Activate service",
      off ? s.name + " will be hidden when owners and staff book. Past appointments and revenue keep it, and you can activate it again anytime." : s.name + " will show again when owners and staff book.",
      off ? "Deactivate" : "Activate", off,
      () => { A.setServiceStatus(s.id, off ? "inactive" : "active"); render(); S.toast(s.name + (off ? " deactivated." : " activated.")); });
  });
  $("del-cancel").addEventListener("click", () => dlg.close());
  $("del-ok").addEventListener("click", () => { dlg.close(); if (pending) pending(); });

  S.toast(A.takeFlash());
  render();
})();
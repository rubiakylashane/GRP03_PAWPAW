/* js/admin/services.js - admin Services list (Edit, Delete)
   Data: PawAdmin.services() ("pawpaw_services", seeded from services-data.js). Owners and staff read the same list.
   Delete is blocked when the service is already used in an appointment.
   Backend: GET /api/services, DELETE /api/services/:id (409 when it is used in an appointment). */
(() => {
  const A = window.PawAdmin, S = window.PawStaff, $ = (id) => document.getElementById(id);
  const esc = A.esc;
  let pending = null;

  let services = [];
  function render() {
    const list = services;
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
    const s = services.find((x) => String(x.id) === b.dataset.del); if (!s) return;
    ask("Delete service", "Delete " + s.name + "? Owners and staff will no longer see it. This cannot be undone.", false, async () => {
      try {
        const response = await fetch(`/api/services/${encodeURIComponent(s.id)}`, { method: "DELETE", headers: { Accept: "application/json" } });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Could not delete the service.");
        services = services.filter((service) => String(service.id) !== String(s.id));
        render(); S.toast(s.name + " deleted.");
      } catch (error) {
        console.error("Could not delete clinic service:", error);
        S.toast(error.message || "Could not delete the service.");
      }
    });
  });
  $("del-cancel").addEventListener("click", () => dlg.close());
  $("del-ok").addEventListener("click", () => { dlg.close(); if (pending) pending(); });

  S.toast(A.takeFlash());
  fetch("/api/services", { headers: { Accept: "application/json" } })
    .then(async (response) => {
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not load clinic services.");
      services = result;
      render();
    })
    .catch((error) => {
      console.error("Could not load clinic services:", error);
      $("sv-rows").innerHTML = '<p class="sv-empty">Services could not be loaded. Please refresh and try again.</p>';
    });
})();
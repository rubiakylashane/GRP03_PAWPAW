/* js/vet/vet-appointments.js - Vet: My Appointments
   The vet starts the visit ("Mark In Progress") and finishes it ("Mark Completed").
   The diagnosis, services and prescriptions are written afterwards in Medical Records
   (medical-record-form.html), which also saves the vaccines given.
   Backend: GET   /api/vet/appointments
            PATCH /api/appointments/:id   { status: "with_vet" | "completed" }  (the server also notifies the owner) */
(() => {
  const V = window.PawVet, A = V.A, O = V.O, S = window.PawStaff, $ = (id) => document.getElementById(id), esc = O.esc;
  const { fmtDate, fmtTime, ownerName, petName, services } = V;
  let all = [], cur = null;

  const ORDER = { with_vet: 0, checked_in: 1, confirmed: 2, completed: 3 };
  const SORTS = {
    soon: (a, b) => V.stamp(a).localeCompare(V.stamp(b)),
    new: (a, b) => V.stamp(b).localeCompare(V.stamp(a)),
    pet: (a, b) => petName(a).localeCompare(petName(b)),
    status: (a, b) => (ORDER[a.status] - ORDER[b.status]) || V.stamp(a).localeCompare(V.stamp(b))
  };
  function action(a) {
    const u = `data-id="${esc(a.owner + "|" + a.id)}"`;
    if (a.status === "confirmed") return `<a class="obtn obtn-outline obtn-sm" href="patients.html?${V.patientQuery(a)}">View Patient</a>`;
    if (a.status === "checked_in") return `<button type="button" class="obtn obtn-outline obtn-sm" data-act="start" ${u}>Mark In Progress</button><button type="button" class="obtn obtn-green obtn-sm" data-act="done" ${u}>Mark Completed</button>`;
    if (a.status === "with_vet") return `<button type="button" class="obtn obtn-green obtn-sm" data-act="done" ${u}>Mark Completed</button>`;
    if (a.status === "completed") return `<a class="obtn obtn-outline obtn-sm" href="${V.recordHref(a)}">${V.hasRecord(a) ? "View Record" : "Add Record"}</a>`;
    return "";
  }
  function render() {
    const q = $("search").value.trim().toLowerCase();
    const list = all.filter(V.visible).filter((a) => !q || [petName(a), ownerName(a), services(a), a.reason || ""].join(" ").toLowerCase().includes(q)).sort(SORTS[$("sort").value] || SORTS.soon);
    $("pt-rows").innerHTML = list.length ? list.map((a) => `
      <div class="orow vrow-ap" role="row">
        <span role="cell"><span class="o-name">${esc(fmtDate(a.date))}</span><span class="o-email">${esc(fmtTime(a.time))}</span></span>
        <span role="cell"><span class="o-name">${esc(petName(a))}</span><span class="o-email">${esc(ownerName(a))}</span></span>
        <span role="cell" class="r-clip">${esc(a.reason || "-")}</span>
        <span role="cell">${esc(services(a))}</span>
        <span role="cell"><span class="spill spill-${esc(a.status)}">${esc(V.label(a))}</span></span>
        <span role="cell" class="a-actions">${action(a)}</span>
      </div>`).join("") : `<p class="o-empty">${all.some(V.visible) ? "Nothing matches your search." : "No appointments assigned to you yet."}</p>`;
  }

  const dlg = $("done-dialog");
  const find = (u) => all.find((a) => a.owner + "|" + a.id === u);
  function finish() {
    const a = cur;
    dlg.close();
    location.href = V.recordHref(a);
  }

  document.addEventListener("click", async (e) => {
    if (e.target.closest("[data-close]")) { e.target.closest("dialog").close(); return; }
    const b = e.target.closest("[data-act]"); if (!b) return;
    const a = find(b.dataset.id); if (!a) return;
    if (b.dataset.act === "start") {
      try { await A.change(a, { status: "with_vet" }); render(); S.toast("Visit started for " + petName(a) + "."); }
      catch (error) { console.error("Could not start visit:", error); S.toast(error.message || "Could not start the visit."); }
    }
    else { cur = a; $("done-sub").textContent = petName(a) + " - " + ownerName(a) + ", " + fmtDate(a.date) + " " + fmtTime(a.time); dlg.showModal(); }
  });
  $("done-ok").addEventListener("click", finish);
  $("done-record").addEventListener("click", finish);
  $("search").addEventListener("input", render);
  $("sort").addEventListener("change", render);
  A.load().then((appointments) => { all = appointments; render(); }).catch((error) => {
    console.error("Could not load veterinarian appointments:", error);
    $("pt-rows").innerHTML = '<p class="o-empty">Appointments could not be loaded. Please refresh and try again.</p>';
  });
})();
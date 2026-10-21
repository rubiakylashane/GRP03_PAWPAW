/* js/vet/vet-home.js - Vet Dashboard (demo mode)
   Reads the same appointment list as the staff pages. Only the patients assigned to the
   signed-in vet are counted. Backend: GET /api/vet/dashboard
     -> { stats, today: [appointment], upcoming: [appointment], recent: [appointment] } */
(() => {
  const V = window.PawVet, A = V.A, S = window.PawStaff, O = window.PawOwners, $ = (id) => document.getElementById(id), esc = O.esc;
  const all = A.load().filter(V.visible), t = V.today();
  const by = (a, b) => V.stamp(a).localeCompare(V.stamp(b));

  $("greeting").textContent = V.greeting;
  $("today").textContent = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  const todays = all.filter((a) => a.date === t).sort(by);
  const upcoming = all.filter((a) => a.status === "confirmed" && a.date > t).sort(by);
  const done = all.filter((a) => a.status === "completed").sort((a, b) => V.stamp(b).localeCompare(V.stamp(a)));
  $("stat-today").textContent = todays.length;
  $("stat-progress").textContent = all.filter((a) => a.status === "with_vet").length;
  $("stat-done").textContent = done.filter((a) => a.date === t).length;
  $("stat-upcoming").textContent = upcoming.length;

  const pill = (a) => `<span class="pill pill-${esc(a.status)}">${esc(V.label(a))}</span>`;
  $("today-rows").innerHTML = todays.length ? todays.map((a) => `
    <div class="row vrow-today" role="row">
      <span role="cell" class="c-time">${esc(V.fmtTime(a.time))}</span>
      <span role="cell"><span class="cell-main">${esc(V.petName(a))}</span><span class="cell-sub">${esc(V.ownerName(a))}</span></span>
      <span role="cell" class="c-service">${esc(V.services(a))}</span>
      <span role="cell">${pill(a)}</span>
    </div>`).join("") : `<p class="empty">No appointments today.</p>`;

  $("upcoming-rows").innerHTML = upcoming.length ? upcoming.slice(0, 4).map((a) => `
    <div class="row vrow-up" role="row">
      <span role="cell"><span class="cell-main">${esc(V.fmtDate(a.date))}</span><span class="cell-sub">${esc(V.fmtTime(a.time))}</span></span>
      <span role="cell"><span class="cell-main">${esc(V.petName(a))}</span><span class="cell-sub">${esc(V.ownerName(a))}</span></span>
      <span role="cell" class="c-service">${esc(V.services(a))}</span>
      <span role="cell">${pill(a)}</span>
      <span role="cell" class="c-action"><a class="btn btn-outline" href="patients.html?${V.patientQuery(a)}">View Patient</a></span>
    </div>`).join("") : `<p class="empty">No upcoming appointments.</p>`;

  $("recent-list").innerHTML = done.length ? done.slice(0, 3).map((a) => `
    <div class="req">
      <div class="vrec">
        <div>
          <p class="req-title"><strong>${esc(V.petName(a))}</strong> - ${esc(V.ownerName(a))}</p>
          <p class="req-sub">${esc(V.fmtMD(a.date))} - ${esc(V.services(a))}</p>
        </div>
        <a class="btn btn-primary" href="medical-records.html?${V.recQuery(a)}">View Record</a>
      </div>
    </div>`).join("") : `<p class="empty">No completed visits yet.</p>`;
})();
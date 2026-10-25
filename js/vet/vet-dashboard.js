/* js/staff/vet-dashboard.js - Vet: My Patients + Complete Visit
   The vet starts the visit and completes it. Completing saves, in one step:
     - the visit record (diagnosis, treatment, notes)      "pawpaw_records:<owner>".visits
     - an optional prescription                           "pawpaw_records:<owner>".prescriptions
     - the next due date of each vaccine given             "pawpaw_vaccinations:<owner>"  (feeds Vaccine Reminders)
     - the appointment status -> completed, and a notification for the owner.
   Backend: replace load / change / the saves with
     GET  /api/vet/appointments            PATCH /api/appointments/:id { status }
     POST /api/vet/appointments/:id/complete   { diagnosis, treatment, notes, prescription, vaccines: [{ name, nextDue }] } */
(() => {
  const A = window.PawStaffAppts, O = window.PawOwners, S = window.PawStaff, $ = (id) => document.getElementById(id), esc = O.esc;
  const TBA = A.TBA, ALL = "__all";
  const INTERVAL_MONTHS = { rabies: 12, "5-in-1": 12, dhpp: 12, "4-in-1": 12, default: 12 };   // suggested next due; the vet can edit it

  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const today = () => iso(new Date());
  const fmtDate = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const fmtShort = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const fmtTime = (t) => { const [h, m] = String(t || "00:00").split(":").map(Number); return new Date(2000, 0, 1, h, m).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }); };
  const ownerName = (a) => { try { return O.owner(a.owner).short; } catch (_) { return a.owner; } };
  const petName = (a) => a.petName || a.pet || "-";
  const services = (a) => (a.services || []).map((s) => s.name).join(", ") || a.service || "-";
  const stamp = (a) => (a.date || "") + " " + (a.time || "");

  let all = [], tab = "clinic";

  /* ----- which vet is signed in ----- */
  let userName = "";
  for (const st of ["sessionStorage", "localStorage"]) { try { const u = JSON.parse(window[st].getItem("pawpaw_user") || "null"); if (u && u.name) { userName = String(u.name).toLowerCase(); break; } } catch (_) {} }
  let mine = null;

  /* ----- list ----- */
  const SHOWN = ["confirmed", "checked_in", "with_vet", "completed"];
  const TABS = [["clinic", "In clinic"], ["upcoming", "Upcoming"], ["done", "Completed"], ["all", "All"]];
  const inTab = (a, t) => t === "all" || (t === "clinic" ? a.status === "checked_in" || a.status === "with_vet" : t === "upcoming" ? a.status === "confirmed" : a.status === "completed");
  const mineOnly = (a) => SHOWN.includes(a.status) && a.vet && a.vet !== TBA && ($("vet-pick").value === ALL || a.vet === $("vet-pick").value);

  const recQuery = (a) => "owner=" + encodeURIComponent(a.owner) + "&petid=" + encodeURIComponent(a.petId || "") + "&q=" + encodeURIComponent(petName(a));
  function action(a) {
    const u = `data-id="${esc(a.owner + "|" + a.id)}"`;
    if (a.status === "checked_in") return `<button type="button" class="obtn obtn-outline obtn-sm" data-act="start" ${u}>Start Visit</button>`;
    if (a.status === "with_vet") return `<button type="button" class="obtn obtn-green obtn-sm" data-act="complete" ${u}>Complete Visit</button>`;
    if (a.status === "completed") return `<a class="obtn obtn-outline obtn-sm" href="medical-records.html?${recQuery(a)}">View Record</a>`;
    return "";
  }
  function render() {
    const base = all.filter(mineOnly), q = $("search").value.trim().toLowerCase();
    $("tabs").innerHTML = TABS.map(([k, l]) => `<button type="button" role="tab" class="apt-tab${k === tab ? " on" : ""}" data-tab="${k}" aria-selected="${k === tab}">${l} <i>${base.filter((a) => inTab(a, k)).length}</i></button>`).join("");
    const list = base.filter((a) => inTab(a, tab) && (!q || [petName(a), ownerName(a), services(a)].join(" ").toLowerCase().includes(q))).sort((a, b) => stamp(a).localeCompare(stamp(b)));
    $("pt-rows").innerHTML = list.length ? list.map((a) => `
      <div class="orow arow vrow-pt" role="row">
        <span role="cell"><span class="o-name">${esc(fmtDate(a.date))}</span><span class="o-email">${esc(fmtTime(a.time))}</span></span>
        <span role="cell"><span class="o-name">${esc(petName(a))}</span><span class="o-email">${esc(ownerName(a))}</span></span>
        <span role="cell">${esc(services(a))}</span>
        <span role="cell"><span class="spill spill-${esc(a.status)}">${esc(A.STATUS[a.status] || a.status)}</span></span>
        <span role="cell" class="a-actions">${action(a)}</span>
      </div>`).join("") : `<p class="o-empty">${base.length ? "No patients here." : "No patients assigned to you yet."}</p>`;
  }

  /* ----- complete visit ----- */
  const dlg = $("visit-dialog");
  let cur = null;
  const find = (u) => all.find((a) => a.owner + "|" + a.id === u);
  const given = (a) => (a.date && a.date <= today() ? a.date : today());
  const vaccinesOf = (a) => (a.services || []).map((x) => x.name || "")
    .filter((name) => /vaccin|rabies|dhpp|dhppl|4-in-1|kennel cough/i.test(name))
    .map((name) => { const match = name.match(/\(([^)]+)\)/); return match ? match[1].trim() : name; });
  function suggestDue(vaccine, from) {
    const v = vaccine.toLowerCase(); let m = INTERVAL_MONTHS.default;
    Object.keys(INTERVAL_MONTHS).forEach((k) => { if (v.indexOf(k) >= 0) m = INTERVAL_MONTHS[k]; });
    const d = new Date(from + "T00:00:00"); d.setMonth(d.getMonth() + m); return iso(d);
  }
  const err = (m) => { $("cv-err").textContent = m || ""; $("cv-err").hidden = !m; return !m; };

  function openComplete(a) {
    cur = a;
    $("cv-sub").textContent = petName(a) + " - " + ownerName(a) + " - " + fmtShort(given(a));
    ["cv-diag", "cv-treat", "cv-notes", "cv-med", "cv-dose", "cv-qty", "cv-inst"].forEach((id) => { $(id).value = ""; });
    const v = vaccinesOf(a), g = given(a);
    $("cv-vacc").innerHTML = v.length ? `<h3 class="dlg-h">Vaccines given - next due</h3>` + v.map((n, i) => `
      <label class="dlg-label" for="cv-v${i}">${esc(n)}</label>
      <input type="date" id="cv-v${i}" class="dlg-select" data-vname="${esc(n)}" min="${g}" value="${suggestDue(n, g)}" />`).join("") : "";
    err(""); dlg.showModal();
  }

  const readJson = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (_) { return d; } };
  async function complete() {
    const a = cur, diag = $("cv-diag").value.trim(), g = given(a), dues = [...$("cv-vacc").querySelectorAll("input")];
    if (!diag) return err("Enter the diagnosis.");
    if (dues.some((i) => !i.value)) return err("Pick the next due date for each vaccine.");
    const med = $("cv-med").value.trim();
    const payload = {
      diagnosis: diag,
      recordDate: g,
      treatment: $("cv-treat").value.trim(),
      notes: $("cv-notes").value.trim(),
      prescriptions: med ? [{
        medication: med,
        dose: $("cv-dose").value.trim(),
        instructions: $("cv-inst").value.trim(),
        quantity: $("cv-qty").value.trim() || 1
      }] : [],
      vaccinations: dues.map((input) => ({
        name: input.dataset.vname,
        dateAdministered: g,
        nextDue: input.value
      }))
    };
    try {
      const response = await fetch(`/api/medical-records/appointments/${encodeURIComponent(a.id)}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not save the completed visit.");
      a.status = "completed";
      dlg.close(); render(); S.toast(petName(a) + " completed. Records saved.");
    } catch (error) {
      console.error("Visit completion failed:", error);
      err(error.message || "Could not save the completed visit.");
    }
  }

  /* ----- events ----- */
  document.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-tab]"); if (t) { tab = t.dataset.tab; render(); return; }
    if (e.target.closest("[data-close]")) { e.target.closest("dialog").close(); return; }
    const b = e.target.closest("[data-act]"); if (!b) return;
    const a = find(b.dataset.id); if (!a) return;
    if (b.dataset.act === "start") {
      try { await A.change(a, { status: "with_vet" }); tab = "clinic"; render(); S.toast("Visit started for " + petName(a) + "."); }
      catch (error) { console.error("Could not start visit:", error); S.toast(error.message || "Could not start the visit."); }
    }
    else openComplete(a);
  });
  $("cv-ok").addEventListener("click", complete);
  $("search").addEventListener("input", render);
  $("vet-pick").addEventListener("change", render);
  A.load().then((appointments) => {
    all = appointments;
    mine = A.VETS.find((vet) => userName.split(/[\s_.-]+/).some((word) => word.length > 2 && vet.toLowerCase().includes(word))) ||
      (all.length ? all[0].vet : null);
    $("vet-pick").innerHTML = `<option value="${ALL}">My assigned patients</option>` +
      (mine ? `<option selected>${esc(mine)}</option>` : "");
    $("vet-pick").value = mine || ALL;
    render();
  }).catch((error) => {
    console.error("Could not load veterinarian appointments:", error);
    $("pt-rows").innerHTML = '<p class="o-empty">Appointments could not be loaded. Please refresh and try again.</p>';
  });
})();

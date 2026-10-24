/* js/admin/veterinarians.js - Veterinarians page: list, edit, delete (adding is done on register-vet.html).
   Delete is blocked when the vet already has appointments / records / prescriptions / vaccinations (history is never lost). */
(() => {
  const A = window.PawAdmin, S = window.PawStaff, $ = (id) => document.getElementById(id);
  let list = A.vets(), current = null;

  const row = (v) => `
    <div class="v-row" role="row">
      <span role="cell" class="v-name" data-label="Name">${A.esc(v.name)}</span>
      <span role="cell" data-label="Specialization">${A.esc(v.specialization)}</span>
      <span role="cell" data-label="License">${A.esc(v.license)}</span>
      <span role="cell" data-label="Phone">${A.esc(A.phoneShow(v.phone))}</span>
      <span role="cell" class="v-email" data-label="Email">${A.esc(v.email)}</span>
      <span role="cell" class="v-acts"><button type="button" class="u-act" data-act="edit" data-id="${A.esc(v.id)}">Edit</button><button type="button" class="u-act u-act-red" data-act="del" data-id="${A.esc(v.id)}">Delete</button></span>
    </div>`;
  function render() {
    list = A.vets();
    $("v-rows").innerHTML = list.length ? list.map(row).join("") : `<p class="u-empty">No veterinarians yet.</p>`;
  }

  /* Specialization is a dropdown (the list lives in admin-store.js); an older saved value that is not in the list is kept as an extra option */
  const fillSpec = (sel, extra) => { const list = A.SPECS.slice(); if (extra && list.indexOf(extra) < 0) list.push(extra); sel.innerHTML = `<option value="" selected disabled>Select specialization</option>` + list.map((x) => `<option>${A.esc(x)}</option>`).join(""); };
  fillSpec($("e-spec"));

  const err = (p, k, m) => { const e = $("err-" + p + k), i = $(p + k); e.textContent = m || ""; e.hidden = !m; i.setAttribute("aria-invalid", m ? "true" : "false"); };
  /* checks for the edit form; p = "e-" */
  function check(p, exceptId) {
    const v = { name: $(p + "name").value.trim().replace(/\s+/g, " "), specialization: $(p + "spec").value.trim().replace(/\s+/g, " "), license: A.normLicense($(p + "license").value), phone: $(p + "phone").value.replace(/[\s-]/g, ""), email: $(p + "email").value.trim() }, e = {};
    if (!v.name) e.name = "Enter the veterinarian's name.";
    else if (!A.validName(v.name)) e.name = "Use letters only.";
    if (!v.specialization) e.spec = "Choose a specialization.";
    if (!$(p + "license").value.trim()) e.license = "Enter the license number.";
    else if (!v.license) e.license = "Use the format PRC 0012345.";
    else if (A.licenseTaken(v.license, exceptId)) e.license = "This license number is already registered.";
    if (!v.phone) e.phone = "Enter the phone number.";
    else if (!A.validPhone(v.phone)) e.phone = "Use a mobile number like 09XXXXXXXXX.";
    if (!v.email) e.email = "Enter the email address.";
    else if (!A.validEmail(v.email)) e.email = "Enter a valid email address.";
    else if (A.vetEmailTaken(v.email, exceptId) || (!exceptId && A.emailTaken(v.email)) ) e.email = "This email is already used by another account.";
    ["name", "spec", "license", "phone", "email"].forEach((k) => err(p, k, e[k]));
    const first = ["name", "spec", "license", "phone", "email"].find((k) => e[k]);
    if (first) $(p + first).focus();
    return first ? null : v;
  }
  ["e-"].forEach((p) => ["name", "spec", "license", "phone", "email"].forEach((k) => ["input", "change"].forEach((ev) => $(p + k).addEventListener(ev, () => err(p, k, "")))));

  const editDlg = $("edit-dialog"), delDlg = $("del-dialog");
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    current = list.find((v) => v.id === b.dataset.id); if (!current) return;
    if (b.dataset.act === "edit") {
      $("e-name").value = current.name; fillSpec($("e-spec"), current.specialization); $("e-spec").value = current.specialization; $("e-license").value = current.license; $("e-phone").value = A.phoneShow(current.phone); $("e-email").value = current.email;
      ["name", "spec", "license", "phone", "email"].forEach((k) => err("e-", k, "")); editDlg.showModal();
    } else {
      const h = A.history(current);
      if (h.total) {   // blocked
        const parts = [h.appointments && h.appointments + " appointment" + (h.appointments > 1 ? "s" : ""), h.records && h.records + " medical record" + (h.records > 1 ? "s" : ""), h.prescriptions && h.prescriptions + " prescription" + (h.prescriptions > 1 ? "s" : ""), h.vaccinations && h.vaccinations + " vaccination" + (h.vaccinations > 1 ? "s" : "")].filter(Boolean);
        $("del-title").textContent = "Cannot delete"; $("del-sub").textContent = current.name + " already has " + parts.join(", ") + ". Deactivate the account in Users and Staff instead."; $("del-ok").hidden = true; $("del-cancel").textContent = "Close";
      } else { $("del-title").textContent = "Delete veterinarian"; $("del-sub").textContent = "Delete " + current.name + "? This cannot be undone."; $("del-ok").hidden = false; $("del-cancel").textContent = "Cancel"; }
      delDlg.showModal();
    }
  });
  $("edit-cancel").addEventListener("click", () => editDlg.close());
  $("edit-form").addEventListener("submit", (ev) => { ev.preventDefault(); const v = check("e-", current.id); if (!v) return; editDlg.close(); A.updateVet(current, v); render(); S.toast("Changes saved."); });
  $("del-cancel").addEventListener("click", () => delDlg.close());
  $("del-ok").addEventListener("click", () => { delDlg.close(); A.removeVet(current); render(); S.toast(current.name + " deleted."); });

  render();
  S.toast(A.takeFlash());
})();
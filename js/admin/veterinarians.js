/* js/admin/veterinarians.js - Veterinarians page: list, edit, delete (adding is done on register-vet.html).
   Delete is blocked when the vet already has appointments / records / prescriptions / vaccinations (history is never lost). */
(() => {
  const A = window.PawAdmin, S = window.PawStaff, $ = (id) => document.getElementById(id);
  let list = [], current = null;
  async function request(url, options) {
    const response = await fetch(url, options);
    const result = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) throw new Error((result && result.error) || "The request could not be completed.");
    return result;
  }

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
    $("v-rows").innerHTML = list.length ? list.map(row).join("") : `<p class="u-empty">No veterinarians yet.</p>`;
  }
  async function load() {
    try {
      list = await request("/api/admin/veterinarians", { headers: { Accept: "application/json" } });
      render();
    } catch (error) {
      console.error("Could not load veterinarians:", error);
      $("v-rows").innerHTML = `<p class="u-empty">${A.esc(error.message || "Could not load veterinarians.")}</p>`;
    }
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
    if (!v.phone) e.phone = "Enter the phone number.";
    else if (!A.validPhone(v.phone)) e.phone = "Use a mobile number like 09XXXXXXXXX.";
    if (!v.email) e.email = "Enter the email address.";
    else if (!A.validEmail(v.email)) e.email = "Enter a valid email address.";
    ["name", "spec", "license", "phone", "email"].forEach((k) => err(p, k, e[k]));
    const first = ["name", "spec", "license", "phone", "email"].find((k) => e[k]);
    if (first) $(p + first).focus();
    return first ? null : v;
  }
  ["e-"].forEach((p) => ["name", "spec", "license", "phone", "email"].forEach((k) => ["input", "change"].forEach((ev) => $(p + k).addEventListener(ev, () => err(p, k, "")))));

  const editDlg = $("edit-dialog"), delDlg = $("del-dialog");
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    current = list.find((v) => String(v.id) === b.dataset.id); if (!current) return;
    if (b.dataset.act === "edit") {
      $("e-name").value = current.name; fillSpec($("e-spec"), current.specialization); $("e-spec").value = current.specialization; $("e-license").value = current.license; $("e-phone").value = A.phoneShow(current.phone); $("e-email").value = current.email;
      ["name", "spec", "license", "phone", "email"].forEach((k) => err("e-", k, "")); editDlg.showModal();
    } else {
      $("del-title").textContent = "Delete veterinarian";
      $("del-sub").textContent = "Delete " + current.name + "? If the veterinarian has clinical history, the account will be kept and deletion will be blocked.";
      $("del-ok").hidden = false; $("del-cancel").textContent = "Cancel";
      delDlg.showModal();
    }
  });
  $("edit-cancel").addEventListener("click", () => editDlg.close());
  $("edit-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const v = check("e-", current.id);
    if (!v) return;
    const submit = $("edit-form").querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      await request("/api/admin/veterinarians/" + encodeURIComponent(current.id), {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(v)
      });
      editDlg.close();
      await load();
      S.toast("Changes saved.");
    } catch (error) {
      console.error("Could not update veterinarian:", error);
      err("e-", /license/i.test(error.message) ? "license" : /email/i.test(error.message) ? "email" : "name", error.message);
    } finally {
      if (submit) submit.disabled = false;
    }
  });
  $("del-cancel").addEventListener("click", () => delDlg.close());
  $("del-ok").addEventListener("click", async () => {
    delDlg.close();
    try {
      await request("/api/admin/veterinarians/" + encodeURIComponent(current.id), { method: "DELETE" });
      S.toast(current.name + " deleted.");
      await load();
    } catch (error) {
      console.error("Could not delete veterinarian:", error);
      S.toast(error.message || "Could not delete veterinarian.");
    }
  });

  load();
  S.toast(A.takeFlash());
})();
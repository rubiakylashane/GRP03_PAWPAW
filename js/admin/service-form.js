/* js/admin/service-form.js - Add service / Edit service (service-form.html or service-form.html?id=<service id>)
   Backend: POST /api/services { name, price, desc }   PUT /api/services/:id   (409 when the name is already used) */
(() => {
  const A = window.PawAdmin, $ = (id) => document.getElementById(id);
  const id = new URLSearchParams(location.search).get("id") || "";
  const cur = id ? A.services().find((x) => x.id === id) : null;
  if (id && !cur) { location.replace("services.html"); return; }

  const K = ["name", "price", "desc"];
  const err = (k, m) => { const e = $("err-" + k); e.textContent = m || ""; e.hidden = !m; $(k).setAttribute("aria-invalid", m ? "true" : "false"); };

  if (cur) {
    document.title = "Edit Service | Pawpaw Clinic Admin";
    $("form-title").textContent = "Edit service"; $("save").textContent = "Save changes";
    $("name").value = cur.name; $("price").value = String(cur.price); $("desc").value = cur.desc || "";
    $("price-hint").hidden = !cur.options;
  }

  $("svc-form").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const name = $("name").value.trim().replace(/\s+/g, " "), raw = $("price").value.replace(/[₱,\s]/g, ""), desc = $("desc").value.trim().replace(/\s+/g, " "), e = {};
    if (!name) e.name = "Enter the service name.";
    else if (name.length < 2) e.name = "Use at least 2 characters.";
    else if (!/^[A-Za-z0-9][A-Za-z0-9 &'\-\/(),.]*$/.test(name)) e.name = "Use letters, numbers and common punctuation only.";
    else if (A.serviceNameTaken(name, cur && cur.id)) e.name = "A service with this name already exists.";
    if (!raw) e.price = "Enter the price.";
    else if (!/^\d+(\.\d{1,2})?$/.test(raw)) e.price = "Use a number like 500 or 1500.50.";
    else if (!(Number(raw) > 0)) e.price = "The price must be more than 0.";
    else if (Number(raw) > 100000) e.price = "The price cannot be more than 100,000.";
    if (!desc) e.desc = "Enter a short description.";
    else if (desc.length < 5) e.desc = "Use at least 5 characters.";
    K.forEach((k) => err(k, e[k]));
    const first = K.find((k) => e[k]); if (first) { $(first).focus(); return; }
    const price = Math.round(Number(raw) * 100) / 100;
    if (cur) { A.updateService(cur.id, { name, price, desc }); A.setFlash(name + " saved."); }
    else { A.addService({ name, price, desc }); A.setFlash(name + " added."); }
    location.href = "services.html";
  });
  K.forEach((k) => $(k).addEventListener("input", () => err(k, "")));
})();
/* js/admin/service-form.js - Add service / Edit service (service-form.html or service-form.html?id=<service id>)
   Backend: POST /api/services { name, price, desc }   PUT /api/services/:id   (409 when the name is already used) */
(() => {
  const A = window.PawAdmin, $ = (id) => document.getElementById(id);
  const id = new URLSearchParams(location.search).get("id") || "";
  const K = ["name", "price", "desc"];
  let cur = null;
  const err = (k, m) => { const e = $("err-" + k); e.textContent = m || ""; e.hidden = !m; $(k).setAttribute("aria-invalid", m ? "true" : "false"); };

  function fillForm() {
    if (!cur) return;
    document.title = "Edit Service | Pawpaw Clinic Admin";
    $("form-title").textContent = "Edit service"; $("save").textContent = "Save changes";
    $("name").value = cur.name; $("price").value = String(cur.price); $("desc").value = cur.desc || "";
    $("price-hint").hidden = !cur.options;
  }

  $("svc-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const name = $("name").value.trim().replace(/\s+/g, " "), raw = $("price").value.replace(/[₱,\s]/g, ""), desc = $("desc").value.trim().replace(/\s+/g, " "), e = {};
    if (!name) e.name = "Enter the service name.";
    else if (name.length < 2) e.name = "Use at least 2 characters.";
    else if (!/^[A-Za-z0-9][A-Za-z0-9 &'\-\/(),.]*$/.test(name)) e.name = "Use letters, numbers and common punctuation only.";
    if (!raw) e.price = "Enter the price.";
    else if (!/^\d+(\.\d{1,2})?$/.test(raw)) e.price = "Use a number like 500 or 1500.50.";
    else if (!(Number(raw) > 0)) e.price = "The price must be more than 0.";
    else if (Number(raw) > 100000) e.price = "The price cannot be more than 100,000.";
    if (!desc) e.desc = "Enter a short description.";
    else if (desc.length < 5) e.desc = "Use at least 5 characters.";
    K.forEach((k) => err(k, e[k]));
    const first = K.find((k) => e[k]); if (first) { $(first).focus(); return; }
    const price = Math.round(Number(raw) * 100) / 100;
    try {
      const response = await fetch(cur ? `/api/services/${encodeURIComponent(cur.id)}` : "/api/services", {
        method: cur ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ name, price, desc })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not save the service.");
      A.setFlash(name + (cur ? " saved." : " added."));
      location.href = "services.html";
    } catch (error) {
      console.error("Could not save clinic service:", error);
      err("name", error.message || "Could not save the service.");
    }
  });
  K.forEach((k) => $(k).addEventListener("input", () => err(k, "")));
  if (id) {
    fetch("/api/services", { headers: { Accept: "application/json" } })
      .then(async (response) => {
        const services = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(services.error || "Could not load clinic services.");
        cur = services.find((service) => String(service.id) === id) || null;
        if (!cur) { location.replace("services.html"); return; }
        fillForm();
      })
      .catch((error) => {
        console.error("Could not load clinic service:", error);
        $("form-title").textContent = error.message || "Could not load the service.";
        $("save").disabled = true;
      });
  }
})();
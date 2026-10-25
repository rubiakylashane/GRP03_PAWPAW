/* js/staff/vaccine-book.js - staff books a vaccination visit using the clinic API. */
(() => {
  const A = window.PawStaffAppts, $ = (id) => document.getElementById(id);
  const qs = new URLSearchParams(location.search);
  const ownerId = qs.get("owner") || "", petParam = qs.get("pet") || "";
  const petIdParam = qs.get("petid") || "", vaccineParam = qs.get("vaccine") || "";
  const state = { date: "", selected: {}, quantity: {} };
  let owner, pets = [], appointments = [], services = [];
  let catalog = [];

  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const today = iso(new Date());
  const fmtTime = (t) => {
    const [h, m] = t.split(":").map(Number);
    return new Date(2000, 0, 1, h, m).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  };
  const fmtDate = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
  const peso = (n) => "PHP " + Number(n).toLocaleString("en-US");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const error = (message) => {
    $("f-err").textContent = message || "";
    $("f-err").hidden = !message;
  };

  function renderServices() {
    $("svc-list").innerHTML = catalog.map((service) => {
      const on = !!state.selected[service.id];
      const head = `<label class="vx-svc-head"><input type="checkbox" data-svc="${esc(service.id)}" ${on ? "checked" : ""} /><span class="vx-svc-name">${esc(service.name)}</span>${service.types ? "" : `<span class="vx-price">${peso(service.price)}</span>`}</label>`;
      const types = service.types && on ? `<div class="vx-types">${service.types.map((type) => `
          <div class="vx-type"><span>${esc(type.name)}</span><span>${peso(type.price)}</span>
            <select data-qty="${esc(type.name)}" aria-label="Quantity of ${esc(type.name)}">${[0, 1, 2, 3].map((n) => `<option value="${n}"${(state.quantity[type.name] || 0) === n ? " selected" : ""}>${n}x</option>`).join("")}</select></div>`).join("")}</div>` : "";
      return `<div class="vx-svc${on ? " on" : ""}">${head}${types}</div>`;
    }).join("");
  }

  function lines() {
    const output = [];
    catalog.forEach((service) => {
      if (!state.selected[service.id]) return;
      if (service.types) {
        service.types.forEach((type) => {
          const quantity = state.quantity[type.name] || 0;
          if (quantity) output.push({ name: type.name, price: type.price * quantity, unit: type.price, quantity });
        });
      } else output.push({ name: service.name, price: service.price, unit: service.price, quantity: 1 });
    });
    return output;
  }

  function renderSummary() {
    const pet = pets.find((item) => String(item.id) === String($("f-pet").value));
    const selected = lines();
    const total = selected.reduce((sum, line) => sum + line.price, 0);
    $("sum-lines").innerHTML =
      `<div><dt>Pet</dt><dd>${esc(pet ? pet.name : "-")}</dd></div>` +
      `<div><dt>Vet</dt><dd>${esc($("f-vet").value)}</dd></div>` +
      (state.date ? `<div><dt>When</dt><dd>${esc(fmtDate(state.date) + ", " + fmtTime($("f-time").value))}</dd></div>` : "") +
      selected.map((line) => `<div><dt>${esc(line.name)}${line.quantity > 1 ? " x" + line.quantity : ""}</dt><dd>${peso(line.price)}</dd></div>`).join("");
    $("sum-total").textContent = peso(total);
    return { selected, total, pet };
  }

  function buildCatalog() {
    const vaccineServices = services.filter((service) => /rabies|dhpp|dhppl|feline 4-in-1|kennel cough/i.test(service.name));
    const vaccineParent = services.find((service) => service.name.toLowerCase() === "vaccination");
    const normalServices = services.filter((service) =>
      service !== vaccineParent && !vaccineServices.includes(service));
    catalog = normalServices.map((service) => ({ id: String(service.id), name: service.name, price: Number(service.price) }));
    if (vaccineServices.length) {
      catalog.splice(Math.max(0, catalog.findIndex((service) => /consultation/i.test(service.name)) + 1), 0, {
        id: vaccineParent ? String(vaccineParent.id) : "vaccination",
        name: vaccineParent ? vaccineParent.name : "Vaccination",
        types: vaccineServices.map((service) => ({ name: service.name, price: Number(service.price) }))
      });
    }
    state.selected[String((vaccineParent && vaccineParent.id) || "vaccination")] = true;
    const matched = vaccineServices.find((service) =>
      vaccineParam && service.name.toLowerCase().includes(vaccineParam.toLowerCase().replace(/^vaccination\s*/, "").trim()));
    const defaultVaccine = matched || vaccineServices[0];
    if (defaultVaccine) state.quantity[defaultVaccine.name] = 1;
  }

  function renderForm() {
    $("who").textContent = "Booking for " + owner.name + ". Pick a pet, a time, and what they need.";
    $("f-pet").innerHTML = pets.length ? pets.map((pet) => `<option value="${esc(pet.id)}">${esc(pet.name)}</option>`).join("") : '<option value="">No pets yet</option>';
    const match = pets.find((pet) => petIdParam && String(pet.id) === petIdParam) || pets.find((pet) => pet.name === petParam);
    if (match) $("f-pet").value = match.id;
    $("f-vet").innerHTML = `<option value="${A.TBA}">${A.TBA}</option>` + A.VETS.map((vet) => `<option>${esc(vet)}</option>`).join("");
    const times = [];
    for (let hour = 8; hour <= 17; hour++) [0, 30].forEach((minute) => {
      if (!(hour === 17 && minute)) times.push(pad(hour) + ":" + pad(minute));
    });
    $("f-time").innerHTML = times.map((time) => `<option value="${time}">${fmtTime(time)}</option>`).join("");
    $("f-reason").value = "Overdue Vaccination";
    renderServices();
    renderSummary();
  }

  $("svc-list").addEventListener("change", (event) => {
    const target = event.target;
    if (target.dataset.svc) {
      state.selected[target.dataset.svc] = target.checked;
      renderServices();
    }
    if (target.dataset.qty) state.quantity[target.dataset.qty] = Number(target.value);
    renderSummary();
  });
  ["f-pet", "f-vet", "f-time"].forEach((id) => $(id).addEventListener("change", renderSummary));

  $("f-date-btn").addEventListener("click", () => {
    window.PawCalendar.open({
      anchor: $("f-date-btn"), value: state.date || today, min: today,
      onPick: (value) => {
        state.date = value; $("f-date-label").textContent = fmtDate(value);
        $("f-date-btn").classList.add("has"); error(""); renderSummary();
      }
    });
  });

  $("book-btn").addEventListener("click", async () => {
    const petId = $("f-pet").value, { selected, pet } = renderSummary();
    if (!petId) return error("This owner has no pet yet. Add a pet first.");
    if (!state.date) return error("Pick a date.");
    if (!selected.length) return error("Choose at least one service.");
    const veterinarian = $("f-vet").value, time = $("f-time").value;
    if (A.conflict(appointments, veterinarian, state.date, time)) {
      return error(veterinarian + " already has an appointment at this time. Pick another time or vet.");
    }
    try {
      await A.add(ownerId, {
        petId, vet: veterinarian, date: state.date, time, reason: $("f-reason").value.trim(),
        services: selected.map((line) => ({ name: line.name, quantity: line.quantity }))
      });
      window.PawOwners.setFlash("Vaccination booked for " + pet.name + ".");
      location.href = "appointments.html";
    } catch (requestError) {
      console.error("Could not book vaccination appointment:", requestError);
      error(requestError.message || "The appointment could not be booked.");
    }
  });

  async function initialize() {
    if (!ownerId) {
      location.replace("vaccine-reminders.html");
      return;
    }
    try {
      const [ownerRows, loadedAppointments] = await Promise.all([A.owners(), A.load()]);
      owner = ownerRows.find((item) => String(item.id) === ownerId);
      if (!owner) throw new Error("The selected owner could not be found.");
      pets = await A.pets(ownerId);
      appointments = loadedAppointments;
      services = await fetch("/api/services", { headers: { Accept: "application/json" } }).then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Could not load clinic services.");
        return result;
      });
      buildCatalog();
      renderForm();
    } catch (requestError) {
      console.error("Could not initialize vaccination booking:", requestError);
      error(requestError.message || "Could not load the booking details.");
      $("book-btn").disabled = true;
    }
  }

  initialize();
})();

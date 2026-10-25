/* js/owner/services.js
   Services page: draws one card per service from services-data.js (two cards per row, every other row shifted right).
   Clicking a card opens Book Appointment with that service already ticked. */
(() => {
  const list = document.getElementById("svc-list");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const peso = (n) => "₱" + Number(n).toLocaleString("en-US");

  const card = (s) => `
    <a class="svc-card" href="book-appointment.html?service=${encodeURIComponent(s.id)}" aria-label="Book ${esc(s.name)}">
      <h2>${esc(s.name)}</h2>
      <p>${esc(s.desc)}</p>
      <div class="svc-foot">
        <strong>${peso(s.price)}</strong>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h17M14 6l6 6-6 6"/></svg>
      </div>
    </a>`;

  window.PawServicesReady.then((services) => {
    let html = "";
    for (let i = 0; i < services.length; i += 2) {
      const row = services.slice(i, i + 2).map(card).join("");
      html += `<div class="svc-row${(i / 2) % 2 === 1 ? " is-shifted" : ""}">${row}</div>`;
    }
    list.innerHTML = html || `<p class="svc-empty">No services listed yet.</p>`;
  }).catch((error) => {
    console.error("Could not load clinic services:", error);
    list.innerHTML = `<p class="svc-empty">Services could not be loaded. Please refresh and try again.</p>`;
  });
})();
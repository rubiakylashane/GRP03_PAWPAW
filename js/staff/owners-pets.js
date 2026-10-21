/* js/staff/owners-pets.js - Owner and Pets list (search + sort) */
(() => {
  const O = window.PawOwners, $ = (id) => document.getElementById(id);
  const rowsEl = $("owner-rows");
  const owners = O.list();

  const sorters = {
    "name-asc": (a, b) => a.name.localeCompare(b.name),
    "name-desc": (a, b) => b.name.localeCompare(a.name),
    newest: (a, b) => (b.registered || "").localeCompare(a.registered || ""),
    oldest: (a, b) => (a.registered || "9999").localeCompare(b.registered || "9999"),
    pets: (a, b) => b.petCount - a.petCount || a.name.localeCompare(b.name)
  };

  function row(o) {
    return `
      <div class="orow" role="row">
        <span role="cell"><span class="o-name">${O.esc(o.short)}</span><span class="o-email">${O.esc(o.email || "-")}</span></span>
        <span role="cell" class="o-phone">${O.esc(o.phone || "-")}</span>
        <span role="cell" class="c-center">${o.petCount}</span>
        <span role="cell" class="c-center">${O.esc(O.fmtLong(o.registered))}</span>
        <span role="cell" class="c-center"><a class="obtn obtn-outline obtn-sm" href="owner-details.html?id=${encodeURIComponent(o.id)}">View and Edit</a></span>
      </div>`;
  }

  function render() {
    const q = $("search").value.trim().toLowerCase();
    const list = owners
      .filter((o) => !q || [o.name, o.email, o.phone].join(" ").toLowerCase().includes(q))
      .sort(sorters[$("sort").value] || sorters["name-asc"]);
    rowsEl.innerHTML = list.length
      ? list.map(row).join("")
      : `<p class="o-empty">${owners.length ? "No owners match your search." : 'No owners yet. Click "Register Walk-in Customer" to add one.'}</p>`;
  }

  $("search").addEventListener("input", render);
  $("sort").addEventListener("change", render);
  render();
})();
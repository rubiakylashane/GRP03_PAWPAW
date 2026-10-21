/* js/staff/staff-shell.js
   Shared by the staff pages: mobile menu, user name, log out, and the little "saved" message. */
window.PawStaff = (() => {
  const $ = (id) => document.getElementById(id);

  for (const store of ["sessionStorage", "localStorage"]) {
    try {
      const u = JSON.parse(window[store].getItem("pawpaw_user") || "null");
      if (u && u.name) { if ($("sidebar-name")) $("sidebar-name").textContent = u.name; break; }
    } catch (_) { /* ignore */ }
  }

  const sidebar = $("sidebar"), overlay = $("overlay"), menuBtn = $("menu-btn");
  if (sidebar && overlay && menuBtn) {
    const setMenu = (open) => {
      sidebar.classList.toggle("open", open);
      overlay.classList.toggle("show", open);
      menuBtn.setAttribute("aria-expanded", String(open));
    };
    menuBtn.addEventListener("click", () => setMenu(!sidebar.classList.contains("open")));
    overlay.addEventListener("click", () => setMenu(false));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });
  }

  const logout = $("logout");
  if (logout) logout.addEventListener("click", () => {
    try { localStorage.removeItem("token"); localStorage.removeItem("pawpaw_user"); sessionStorage.clear(); } catch (_) { /* ignore */ }
  });

  let timer;
  function toast(msg) {
    const t = $("toast");
    if (!t || !msg) return;
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(timer);
    timer = setTimeout(() => t.classList.remove("show"), 2600);
  }
  if (window.PawOwners) toast(window.PawOwners.takeFlash());

  /* small helpers used by the form pages */
  const ownerId = () => new URLSearchParams(location.search).get("id") || new URLSearchParams(location.search).get("owner") || "";
  function setError(key, msg) {
    const el = $("err-" + key), input = $(key);
    if (el) { el.textContent = msg || ""; el.hidden = !msg; }
    if (input) input.setAttribute("aria-invalid", msg ? "true" : "false");
  }
  /* shrink a picked image to a small data URL so it fits in localStorage */
  function resize(file, max = 480) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const r = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read that image.")); };
      img.src = url;
    });
  }
  return { toast, ownerId, setError, resize };
})();
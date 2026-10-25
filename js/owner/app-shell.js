/* js/owner/app-shell.js
   Sidebar behaviour shared by every owner page: mobile menu, user name, log out. */
(() => {
  const $ = (id) => document.getElementById(id);

  /* ----- Mobile menu ----- */
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

  /* ----- User name (saved by login.js) ----- */
  let saved = null;
  for (const store of ["sessionStorage", "localStorage"]) {
    try {
      const u = JSON.parse(window[store].getItem("pawpaw_user") || "null");
      if (u && u.name) { saved = u; break; }
    } catch (_) { /* ignore */ }
  }
  if (saved) {
    if ($("sidebar-name")) $("sidebar-name").textContent = saved.name;
    // "Good day, <span id="greeting-name">User</span>" on any page
    if ($("greeting-name")) $("greeting-name").textContent = saved.name;
  }

  /* ----- Profile picture in the sidebar ----- */
  fetch("/api/me", { headers: { Accept: "application/json" } })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Profile request failed (${response.status}).`);
      return response.json();
    })
    .then((data) => {
      const avatar = $("user-avatar");
      if (avatar && data.profile && data.profile.photo) {
        avatar.style.cssText += `;background-image:url('${data.profile.photo}');background-size:cover;background-position:center`;
      }
    })
    .catch((error) => console.error("Could not load profile picture:", error));

  /* ----- Log out ----- */
  const logout = $("logout");
  if (logout) {
    logout.addEventListener("click", () => {
      try { localStorage.removeItem("token"); localStorage.removeItem("pawpaw_user"); sessionStorage.clear(); } catch (_) { /* ignore */ }
    });
  }
})();
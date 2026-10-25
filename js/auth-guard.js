/* js/auth-guard.js - validates page access against the server-side session.
   Put it in <head> of every page that is not public, BEFORE the other scripts:
     <script src="../../js/auth-guard.js" data-role="staff"></script>
   data-role takes one role or a list: "owner" | "staff" | "vet" | "admin" | "staff,admin".
   - not signed in            -> pages/auth/login.html
   - signed in with a wrong role -> that role's own home page
   The backend remains authoritative for every data request. */
(() => {
  const me = document.currentScript;
  const allowed = String((me && me.dataset.role) || "").split(",").map((s) => s.trim()).filter(Boolean);
  const base = location.pathname.replace(/\/pages\/[^/]*\/[^/]*$/, "/pages/");   // .../pages/
  const HOME = { owner: "owner/dashboard.html", staff: "staff/dashboard.html", vet: "vet/dashboard.html", admin: "admin/dashboard.html" };

  if (allowed.length) {
    document.documentElement.style.visibility = "hidden";
    fetch("/api/auth/me", { headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error("Session expired.");
        const data = await response.json();
        const user = data.user;
        if (!user || !user.role) throw new Error("Session is invalid.");
        sessionStorage.setItem("pawpaw_user", JSON.stringify({
          id: user.userId,
          ownerId: user.ownerId,
          username: user.username,
          name: user.name || user.username,
          role: user.role
        }));
        if (!allowed.includes(user.role)) {
          location.replace(base + (HOME[user.role] || "auth/login.html"));
          return;
        }
        document.documentElement.style.visibility = "";
      })
      .catch(() => {
        sessionStorage.removeItem("pawpaw_user");
        location.replace(base + "auth/login.html?session=expired");
      });
  }

  document.addEventListener("click", async (event) => {
    const link = event.target.closest("#logout");
    if (!link) return;
    event.preventDefault();
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout failed.");
      sessionStorage.removeItem("pawpaw_user");
      localStorage.removeItem("pawpaw_user");
      location.replace(base + "auth/login.html");
    } catch (error) {
      window.alert("Could not sign out. Please try again.");
    }
  });
})();
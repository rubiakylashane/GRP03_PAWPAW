window.PawProfile = (() => {
  async function request(url, options) {
    const response = await fetch(url, {
      headers: { Accept: "application/json", ...(options && options.body ? { "Content-Type": "application/json" } : {}) },
      ...options
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `Profile request failed (${response.status}).`);
    }
    return response.status === 204 ? null : response.json();
  }

  async function load() {
    const result = await request("/api/me");
    const profile = result.profile;
    return {
      ...profile,
      name: profile.name || "User",
      email: profile.email || "",
      phone: profile.phone || "",
      address: profile.address || "",
      photo: profile.photo || "",
      memberSince: profile.memberSince || ""
    };
  }

  async function save(profile) {
    const result = await request("/api/me", {
      method: "PUT",
      body: JSON.stringify(profile)
    });
    return result.profile;
  }

  return { load, save };
})();

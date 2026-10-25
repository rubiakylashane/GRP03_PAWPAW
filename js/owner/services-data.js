window.PawServices = [];
window.PawServicesReady = (async () => {
  const response = await fetch("/api/services", { headers: { Accept: "application/json" } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Could not load services (${response.status}).`);
  }

  const rows = await response.json();
  const byName = new Map(rows.map((service) => [String(service.name).trim().toLowerCase(), service]));
  const requireService = (name) => {
    const service = byName.get(name.toLowerCase());
    if (!service) throw new Error(`Clinic service "${name}" is not configured.`);
    return service;
  };

  const consultation = requireService("General Consultation");
  const vaccination = requireService("Vaccination");
  const deworming = requireService("Deworming");
  const grooming = requireService("Grooming");
  const dental = requireService("Dental Cleaning");
  const lab = requireService("Laboratory Test");

  window.PawServices = [
    { ...consultation, desc: consultation.desc || "A full check of your pet's health with a veterinarian, including advice on diet and care" },
    {
      ...vaccination,
      id: "vaccination",
      price: Number(vaccination.price),
      desc: vaccination.desc || "Core and booster vaccines, recorded in your pet's history with the next due date.",
      options: [
        ["Anti Rabies", "rabies"],
        ["5-in-1 DHPPL", "dhppl"],
        ["Feline 4-in-1", "fvrcp"],
        ["Kennel Cough", "bordetella"]
      ].map(([name, id]) => {
        const service = requireService(name);
        return { id, serviceId: service.id, name, price: Number(service.price) };
      })
    },
    { ...deworming, desc: deworming.desc || "Treatment for common intestinal parasites, with a follow-up schedule when needed" },
    { ...grooming, desc: grooming.desc || "Bath, brush, nail trim, and ear cleaning for a clean and comfortable pet." },
    { ...dental, desc: dental.desc || "Scaling and polishing to keep teeth and gums healthy." },
    { ...lab, desc: lab.desc || "Blood and other lab work ordered by your veterinarian to support a diagnosis." }
  ].map((service) => ({ ...service, id: String(service.id), price: Number(service.price) }));

  return window.PawServices;
})();

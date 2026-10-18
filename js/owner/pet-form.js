
/* js/owner/pet-form.js
   Add a new pet / Edit pet.
   The page decides which one with <body data-mode="add"> or "edit".
*/
(() => {
  const P = window.PawPets || {
    get: () => null,
    add: () => {},
    update: () => {},
    setFlash: () => {}
  };

  const $ = (id) => document.getElementById(id);
  const mode = document.body.dataset.mode === "edit" ? "edit" : "add";

  /* ----- Breed lists ----- */
  const BREED_LISTS = {
    Dog: [
      "Aspin", "Akita", "Beagle", "Bichon Frise", "Border Collie",
      "Boxer", "Chihuahua", "Cocker Spaniel", "Corgi", "Dachshund",
      "Dalmatian", "Doberman", "English Bulldog", "French Bulldog",
      "German Shepherd", "Golden Retriever", "Great Dane",
      "Jack Russell Terrier", "Labrador Retriever", "Maltese",
      "Pit Bull", "Pomeranian", "Poodle", "Pug", "Rottweiler",
      "Samoyed", "Shiba Inu", "Shih Tzu", "Siberian Husky",
      "Yorkshire Terrier"
    ],
    Cat: [
      "Puspin", "Abyssinian", "American Shorthair", "Bengal",
      "Birman", "British Shorthair", "Burmese", "Exotic Shorthair",
      "Himalayan", "Maine Coon", "Munchkin", "Norwegian Forest Cat",
      "Persian", "Ragdoll", "Russian Blue", "Scottish Fold",
      "Siamese", "Sphynx"
    ],
    Rabbit: [
      "Dutch", "English Angora", "Flemish Giant", "Holland Lop",
      "Lionhead", "Mini Lop", "Mini Rex", "Netherland Dwarf", "Rex"
    ],
    Bird: [
      "African Grey", "Budgerigar (Parakeet)", "Canary", "Cockatiel",
      "Cockatoo", "Conure", "Finch", "Lovebird", "Macaw", "Parrot"
    ],
    Hamster: [
      "Chinese", "Dwarf Campbell", "Roborovski", "Syrian", "Winter White"
    ],
    "Guinea Pig": [
      "Abyssinian", "American", "Peruvian", "Skinny Pig", "Teddy"
    ],
    Chinchilla: ["Beige", "Black Velvet", "Standard Gray", "White"],
    Ferret: ["Albino", "Cinnamon", "Sable", "Standard"],
    Hedgehog: ["African Pygmy"],
    Turtle: ["Box Turtle", "Red-eared Slider", "Tortoise"],
    Lizard: ["Bearded Dragon", "Chameleon", "Iguana", "Leopard Gecko"],
    Snake: ["Ball Python", "Corn Snake"],
    Fish: ["Arowana", "Betta", "Goldfish", "Guppy", "Koi"],
    Other: []
  };

  const TOP = new Set(["Aspin", "Puspin"]);
  const BREEDS = {};

  Object.keys(BREED_LISTS).forEach((species) => {
    const list = BREED_LISTS[species];
    const top = list.filter((breed) => TOP.has(breed));
    const rest = list
      .filter((breed) => !TOP.has(breed))
      .sort((a, b) => a.localeCompare(b));

    BREEDS[species] = [
      ...top,
      ...rest,
      ...(species === "Other" ? [] : ["Mixed breed"]),
      "Other"
    ];
  });

  const form = $("pet-form");
  if (!form) return;

  const f = {
    name: $("name"),
    species: $("species"),
    breed: $("breed"),
    sex: $("sex"),
    dob: $("dob"),
    allergies: $("allergies"),
    notes: $("notes"),
    photo: $("photo")
  };

  let photoData = "";
  let editingId = null;

  /* ----- Species -> breed list ----- */
  if (f.species) {
    Object.keys(BREEDS).forEach((species) => {
      f.species.add(new Option(species, species));
    });
  }

  function fillBreeds(species, selected) {
    if (!f.breed) return;

    f.breed.length = 1;

    const list = BREEDS[species] || [];

    list.forEach((breed) => {
      f.breed.add(new Option(breed, breed));
    });

    if (selected && !list.includes(selected)) {
      f.breed.add(new Option(selected, selected));
    }

    f.breed.disabled = !species;
    f.breed.value = selected || "";
  }

  fillBreeds("", "");

  if (f.species) {
    f.species.addEventListener("change", () => {
      fillBreeds(f.species.value, "");
    });
  }

  /* ----- Date of birth handling ----- */
  const pad = (n) => String(n).padStart(2, "0");

  const toIso = (date) =>
    date.getFullYear() + "-" +
    pad(date.getMonth() + 1) + "-" +
    pad(date.getDate());

  const todayIso = toIso(new Date());

  /*
    Birthday input format: MM/DD/YYYY
    Example: 10182020 -> 10/18/2020
  */
  if (f.dob) {
    f.dob.type = "text";
    f.dob.placeholder = "MM/DD/YYYY";
    f.dob.maxLength = 10;
    f.dob.inputMode = "numeric";
    f.dob.autocomplete = "bday";

    f.dob.addEventListener("input", () => {
      const digits = f.dob.value
        .replace(/\D/g, "")
        .slice(0, 8);

      let formatted = digits.slice(0, 2);

      if (digits.length > 2) {
        formatted += "/" + digits.slice(2, 4);
      }

      if (digits.length > 4) {
        formatted += "/" + digits.slice(4, 8);
      }

      f.dob.value = formatted;
      setError("dob", "");
    });
  }

  /*
    Converts MM/DD/YYYY to YYYY-MM-DD.
    Returns null if the date is invalid.
  */
  function parseDob(text) {
    if (!text) return null;

    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());

    if (!match) return null;

    const month = Number(match[1]);
    const day = Number(match[2]);
    const year = Number(match[3]);

    // Prevent invalid years and impossible calendar dates.
    if (year < 1000 || year > 9999) return null;

    const date = new Date(year, month - 1, day);

    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null;
    }

    return `${year}-${pad(month)}-${pad(day)}`;
  }

  /* ----- Photo upload and preview ----- */
  const preview = $("photo-preview");
  const hint = $("photo-hint");
  const removeBtn = $("photo-remove");

  function setPhoto(dataUrl) {
    photoData = dataUrl || "";

    if (preview) preview.hidden = !photoData;
    if (hint) hint.hidden = !!photoData;
    if (removeBtn) removeBtn.hidden = !photoData;

    if (preview) {
      if (photoData) {
        preview.src = photoData;
      } else {
        preview.removeAttribute("src");
      }
    }
  }

  function resize(file, max = 480) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();

      img.onload = () => {
        const ratio = Math.min(
          1,
          max / Math.max(img.width, img.height)
        );

        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);

        const context = canvas.getContext("2d");

        if (!context) {
          URL.revokeObjectURL(url);
          reject(new Error("Could not process that image."));
          return;
        }

        context.drawImage(
          img,
          0,
          0,
          canvas.width,
          canvas.height
        );

        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Could not read that image."));
      };

      img.src = url;
    });
  }

  if (f.photo) {
    f.photo.addEventListener("change", async () => {
      const file = f.photo.files[0];

      setError("photo", "");

      if (!file) return;

      if (!file.type.startsWith("image/")) {
        f.photo.value = "";
        setError("photo", "Please choose an image file.");
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        f.photo.value = "";
        setError("photo", "Image must be 5 MB or smaller.");
        return;
      }

      try {
        setPhoto(await resize(file));
      } catch (err) {
        setError("photo", err.message);
      }
    });
  }

  if (removeBtn) {
    removeBtn.addEventListener("click", () => {
      if (f.photo) f.photo.value = "";
      setPhoto("");
      setError("photo", "");
    });
  }

  /* ----- Error messages ----- */
  function setError(key, message) {
    const el = $("err-" + key);

    if (el) {
      el.textContent = message || "";
      el.hidden = !message;
    }

    if (f[key]) {
      f[key].setAttribute(
        "aria-invalid",
        message ? "true" : "false"
      );
    }
  }

  /* ----- Edit mode: load existing pet ----- */
  if (mode === "edit") {
    editingId = new URLSearchParams(location.search).get("id");

    const pet = editingId && P.get(editingId);

    if (!pet) {
      location.replace("my-pets.html");
      return;
    }

    if (f.name) f.name.value = pet.name || "";

    if (f.species) {
      f.species.value = pet.species || "";
      f.species.disabled = true;
    }

    fillBreeds(pet.species, pet.breed);

    if (f.sex) f.sex.value = pet.sex || "";

    if (f.dob && pet.dob) {
      // Stored date is YYYY-MM-DD.
      // Display it as MM/DD/YYYY in the input.
      const parts = pet.dob.split("-");

      if (parts.length === 3) {
        const [year, month, day] = parts;
        f.dob.value = `${month}/${day}/${year}`;
      } else {
        f.dob.value = pet.dob;
      }
    }

    if (f.allergies) {
      f.allergies.value = pet.allergies || "";
    }

    if (f.notes) {
      f.notes.value = pet.notes || "";
    }

    setPhoto(pet.photo || "");
  }

  /* ----- Submit form ----- */
  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const name = f.name ? f.name.value.trim() : "";
    const rawDob = f.dob ? f.dob.value.trim() : "";
    const parsedDob = parseDob(rawDob);

    const values = {
      name,
      species: f.species ? f.species.value : "",
      breed: f.breed ? f.breed.value : "",
      sex: f.sex ? f.sex.value : "",
      dob: parsedDob || "",
      allergies: f.allergies ? f.allergies.value.trim() : "",
      notes: f.notes ? f.notes.value.trim() : "",
      photo: photoData
    };

    const errors = {};

    if (!name) {
      errors.name = "Enter your pet's name.";
    } else if (name.length > 40) {
      errors.name = "Name must be 40 characters or fewer.";
    }

    if (!values.species) {
      errors.species = "Choose a species.";
    }

    if (!values.breed) {
      errors.breed = "Choose a breed.";
    }

    if (!values.sex) {
      errors.sex = "Choose a sex.";
    }

    if (!rawDob) {
      errors.dob = "Enter the date of birth.";
    } else if (!values.dob) {
      errors.dob = "Enter a valid date in MM/DD/YYYY format.";
    } else if (values.dob > todayIso) {
      errors.dob = "Date of birth can't be in the future.";
    } else if (values.dob < "1990-01-01") {
      errors.dob = "Please check the year.";
    }

    ["name", "species", "breed", "sex", "dob"].forEach((key) => {
      setError(key, errors[key]);
    });

    const firstBad = Object.keys(errors)[0];

    if (firstBad && f[firstBad]) {
      f[firstBad].focus();
      return;
    }

    if (mode === "edit") {
      P.update(editingId, values);
      P.setFlash("Changes saved.");
    } else {
      P.add(values);
      P.setFlash("Pet added.");
    }

    location.href = "my-pets.html";
  });
})();

// Pantalla de ingreso: vista previa en vivo + registro del usuario
const $ = (s) => document.querySelector(s);

const form = $("#joinForm");
const nameInput = $("#name");
const bioInput = $("#bio");
const errorEl = $("#formError");
const btn = $("#joinBtn");
const card = $("#previewCard");
const pvAvatar = $("#pvAvatar");
const pvName = $("#pvName");
const pvBio = $("#pvBio");
const pvMini = $("#pvMini");
const pvMiniName = $("#pvMiniName");

const COLOR_CLASSES = ["violeta", "oceano", "lima", "atardecer", "oro", "chicle"].map((c) => "c-" + c);

// Recordar el último perfil usado (solo comodidad local)
try {
    const saved = JSON.parse(localStorage.getItem("parche:perfil") || "null");
    if (saved) {
        nameInput.value = saved.name || "";
        bioInput.value = saved.bio || "";
        const av = form.querySelector(`input[name="avatar"][value="${CSS.escape(saved.avatar || "")}"]`);
        if (av) av.checked = true;
        const col = form.querySelector(`input[name="color"][value="${CSS.escape(saved.color || "")}"]`);
        if (col) col.checked = true;
    }
} catch { /* sin almacenamiento disponible */ }

const current = () => ({
    name: nameInput.value.trim(),
    bio: bioInput.value.trim(),
    avatar: form.querySelector('input[name="avatar"]:checked')?.value,
    color: form.querySelector('input[name="color"]:checked')?.value,
});

function updatePreview(changed) {
    const p = current();
    pvName.textContent = p.name || "Tu nombre";
    pvName.classList.toggle("placeholder", !p.name);
    pvMiniName.textContent = p.name || "Tu nombre";
    pvBio.textContent = p.bio || "Sin estado";

    if (pvAvatar.textContent !== p.avatar) {
        pvAvatar.textContent = p.avatar;
        pvMini.textContent = p.avatar;
        if (changed === "avatar") {
            pvAvatar.classList.remove("flip");
            void pvAvatar.offsetWidth; // reinicia la animación
            pvAvatar.classList.add("flip");
        }
    }
    for (const el of [card, pvMini]) {
        el.classList.remove(...COLOR_CLASSES);
        el.classList.add("c-" + p.color);
    }
}

form.addEventListener("input", (e) => {
    if (e.target === nameInput) {
        nameInput.closest(".field").classList.remove("invalid");
        errorEl.textContent = "";
    }
    updatePreview(e.target.name);
});
updatePreview();

function fail(message) {
    errorEl.textContent = message;
    nameInput.closest(".field").classList.add("invalid");
    nameInput.classList.remove("shake");
    void nameInput.offsetWidth;
    nameInput.classList.add("shake");
    nameInput.focus();
}

form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const p = current();
    if (p.name.length < 2) return fail("Escribe un nombre de al menos 2 caracteres.");

    btn.classList.add("loading");
    btn.disabled = true;
    try {
        const res = await fetch("/chat/join", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(p),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "No se pudo entrar al chat.");

        try { localStorage.setItem("parche:perfil", JSON.stringify(p)); } catch { /* ignorar */ }

        // Animación de salida antes de entrar a la sala
        document.querySelector(".login").classList.add("leaving");
        $("#loginCard").classList.add("leaving");
        setTimeout(() => { location.href = "/chat/" + data.id; }, 550);
    } catch (err) {
        btn.classList.remove("loading");
        btn.disabled = false;
        fail(err.message);
    }
});

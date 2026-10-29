// Sala de chat: tiempo real con Server-Sent Events
const $ = (s) => document.querySelector(s);

const app = $("#app");
const ME = app.dataset.me;
const messagesEl = $("#messages");
const userList = $("#userList");
const typingEl = $("#typing");
const input = $("#msgInput");
const sendBtn = $("#sendBtn");
const composer = $("#composer");
const emojiPanel = $("#emojiPanel");
const jumpBtn = $("#jumpBtn");
const connState = $("#connState");
const api = (path) => `/chat/${ME}/${path}`;

const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtTime = (ts) => new Date(Number(ts)).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
const post = (path, body) =>
    fetch(api(path), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}), keepalive: true });

let users = [];
let lastId = 0;
let unread = 0;
const baseTitle = document.title;

// ───────── Mensajes ─────────
const isEmojiOnly = (t) => /^(\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s){1,12}$/u.test(t) && !/^[\d#*\s]+$/.test(t);

function finishMessage(el, prev) {
    const time = el.querySelector("time");
    if (time) time.textContent = fmtTime(time.dataset.ts);
    if (el.classList.contains("msg")) {
        if (isEmojiOnly(el.querySelector(".bubble").textContent.trim())) el.classList.add("emoji-only");
        // Agrupar mensajes seguidos de la misma persona (< 3 min)
        if (prev?.classList.contains("msg") && prev.dataset.user === el.dataset.user && el.dataset.ts - prev.dataset.ts < 180000) {
            el.classList.add("grouped");
        }
    }
    const id = Number(el.dataset.id);
    if (id > lastId) lastId = id;
}

function messageHTML(m) {
    if (m.type === "system") {
        return `<div class="sys ${esc(m.kind)} new" data-id="${m.id}"><span>${esc(m.avatar)} <b>${esc(m.name)}</b> ${esc(m.text)}</span></div>`;
    }
    const mine = m.userId === ME ? "mine" : "";
    return `<div class="msg ${mine} new" data-id="${m.id}" data-user="${esc(m.userId)}" data-ts="${m.ts}">
        <span class="avatar c-${esc(m.color)}">${esc(m.avatar)}</span>
        <div class="msg-body">
            <div class="msg-meta"><b class="msg-name t-${esc(m.color)}">${esc(m.name)}</b><time data-ts="${m.ts}"></time></div>
            <div class="bubble c-${esc(m.color)}">${esc(m.text)}</div>
        </div>
    </div>`;
}

const nearBottom = () => messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 120;
function scrollToBottom(smooth = true) {
    messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: smooth ? "smooth" : "auto" });
}

function addMessage(m) {
    if (m.id <= lastId) return;
    const stick = nearBottom() || m.userId === ME;
    const prev = messagesEl.lastElementChild;
    messagesEl.insertAdjacentHTML("beforeend", messageHTML(m));
    finishMessage(messagesEl.lastElementChild, prev);

    if (m.userId && m.userId !== ME) clearTyping(m.userId);
    if (stick) scrollToBottom();
    else if (m.type === "msg") jumpBtn.classList.add("show");

    if (document.hidden && m.type === "msg" && m.userId !== ME) {
        unread++;
        document.title = `(${unread}) ${baseTitle}`;
    }
}

// Mensajes renderizados por Handlebars en el servidor
{
    let prev = null;
    for (const el of messagesEl.querySelectorAll(".msg, .sys")) {
        finishMessage(el, prev);
        prev = el;
    }
    requestAnimationFrame(() => scrollToBottom(false));
}

messagesEl.addEventListener("scroll", () => { if (nearBottom()) jumpBtn.classList.remove("show"); });
jumpBtn.addEventListener("click", () => { scrollToBottom(); jumpBtn.classList.remove("show"); });

// ───────── Personas en línea ─────────
function userHTML(u, entering) {
    const me = u.id === ME;
    const sub = u.bio || (u.status === "away" ? "Ausente" : "En línea");
    return `<li class="user ${me ? "is-me" : ""} ${u.status === "away" ? "away" : ""} ${entering ? "entering" : ""}" data-id="${esc(u.id)}">
        <span class="avatar c-${esc(u.color)}">${esc(u.avatar)}<i class="dot ${esc(u.status)}"></i></span>
        <div class="user-info"><b>${esc(u.name)}${me ? " <em>(tú)</em>" : ""}</b><small>${esc(sub)}</small></div>
    </li>`;
}

function renderUsers(next, animate = true) {
    const nextIds = new Set(next.map((u) => u.id));
    const prevIds = new Set([...userList.children].map((li) => li.dataset.id));

    // Salientes: animación de salida y luego se eliminan
    for (const li of [...userList.children]) {
        if (!nextIds.has(li.dataset.id) && !li.classList.contains("leaving")) {
            li.classList.add("leaving");
            li.addEventListener("animationend", () => li.remove(), { once: true });
        }
    }
    // Entrantes / actualizados, respetando el orden
    next.forEach((u, i) => {
        const existing = userList.querySelector(`[data-id="${CSS.escape(u.id)}"]:not(.leaving)`);
        const html = userHTML(u, animate && !prevIds.has(u.id));
        if (existing) {
            const tmp = document.createElement("template");
            tmp.innerHTML = html.trim();
            const fresh = tmp.content.firstChild;
            fresh.classList.remove("entering");
            if (existing.outerHTML !== fresh.outerHTML) existing.replaceWith(fresh);
        } else {
            const ref = userList.children[i] || null;
            const tmp = document.createElement("template");
            tmp.innerHTML = html.trim();
            userList.insertBefore(tmp.content.firstChild, ref);
        }
    });

    // Toasts para quien llega
    if (animate) {
        for (const u of next) if (!prevIds.has(u.id) && u.id !== ME) toast(`${u.avatar} <b>${esc(u.name)}</b> está en línea`, u.color);
    }

    // Contadores
    for (const el of [$("#onlineCount"), $("#headerCount")]) {
        if (el.textContent !== String(next.length)) {
            el.textContent = next.length;
            el.classList.remove("bump");
            void el.offsetWidth;
            el.classList.add("bump");
        }
    }
    $("#aloneHint").hidden = next.length > 1;

    // Avatares en la cabecera (otros usuarios)
    const others = next.filter((u) => u.id !== ME);
    $("#headerStack").innerHTML =
        others.slice(0, 4).map((u) => `<span class="avatar sm c-${esc(u.color)}" title="${esc(u.name)}">${esc(u.avatar)}</span>`).join("") +
        (others.length > 4 ? `<span class="avatar sm more">+${others.length - 4}</span>` : "");

    users = next;
}

// ───────── Toasts ─────────
function toast(html, color = "violeta") {
    const box = $("#toasts");
    const el = document.createElement("div");
    el.className = `toast c-${color}`;
    el.innerHTML = html;
    box.appendChild(el);
    setTimeout(() => {
        el.classList.add("out");
        el.addEventListener("animationend", () => el.remove(), { once: true });
    }, 3200);
}

// ───────── Escribiendo… ─────────
const typers = new Map(); // id → {name, avatar, timer}
function renderTyping() {
    const list = [...typers.values()];
    if (!list.length) {
        typingEl.classList.remove("show");
        return;
    }
    const names = list.map((t) => `${t.avatar} ${esc(t.name)}`);
    const text =
        names.length === 1 ? `${names[0]} está escribiendo`
        : names.length === 2 ? `${names[0]} y ${names[1]} están escribiendo`
        : `${names.length} personas están escribiendo`;
    const stick = nearBottom();
    typingEl.innerHTML = `<span class="typing-dots"><i></i><i></i><i></i></span><span>${text}…</span>`;
    typingEl.classList.add("show");
    if (stick) setTimeout(() => scrollToBottom(), 320); // tras la transición de altura
}
function clearTyping(id) {
    const t = typers.get(id);
    if (t) clearTimeout(t.timer);
    typers.delete(id);
    renderTyping();
}

let typingSent = false;
let typingIdle;
input.addEventListener("input", () => {
    sendBtn.disabled = !input.value.trim();
    if (!typingSent && input.value.trim()) {
        typingSent = true;
        post("typing", { typing: true });
    }
    clearTimeout(typingIdle);
    typingIdle = setTimeout(stopTyping, 2500);
});
function stopTyping() {
    if (typingSent) post("typing", { typing: false });
    typingSent = false;
}
sendBtn.disabled = true;

// ───────── Enviar ─────────
composer.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    sendBtn.disabled = true;
    clearTimeout(typingIdle);
    typingSent = false;
    emojiPanel.classList.remove("open");

    sendBtn.classList.remove("fly");
    void sendBtn.offsetWidth;
    sendBtn.classList.add("fly");

    const res = await post("message", { text }).catch(() => null);
    if (!res || !res.ok) {
        if (res?.status === 404) return (location.href = "/");
        input.value = text;
        sendBtn.disabled = false;
        toast("⚠️ No se pudo enviar el mensaje", "atardecer");
    }
    input.focus();
});

// ───────── Emojis ─────────
$("#emojiBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    emojiPanel.classList.toggle("open");
});
emojiPanel.addEventListener("click", (e) => {
    const b = e.target.closest(".emoji");
    if (!b) return;
    const pos = input.selectionStart ?? input.value.length;
    input.value = input.value.slice(0, pos) + b.textContent + input.value.slice(pos);
    input.focus();
    input.setSelectionRange(pos + b.textContent.length, pos + b.textContent.length);
    input.dispatchEvent(new Event("input"));
});
document.addEventListener("click", (e) => {
    if (!emojiPanel.contains(e.target)) emojiPanel.classList.remove("open");
});

// ───────── Menú móvil ─────────
$("#menuBtn").addEventListener("click", () => app.classList.add("drawer-open"));
$("#scrim").addEventListener("click", () => app.classList.remove("drawer-open"));

// ───────── Salir ─────────
$("#leaveBtn").addEventListener("click", async () => {
    source.close();
    await post("leave").catch(() => {});
    app.classList.add("exiting");
    setTimeout(() => (location.href = "/"), 450);
});

// ───────── Ausente / en línea ─────────
document.addEventListener("visibilitychange", () => {
    post("status", { status: document.hidden ? "away" : "online" });
    $("#myDot").className = `dot ${document.hidden ? "away" : "online"}`;
    if (!document.hidden) {
        unread = 0;
        document.title = baseTitle;
    }
});

// ───────── Tiempo real ─────────
const source = new EventSource(api("stream"));

source.addEventListener("sync", (e) => {
    const { users: list, messages } = JSON.parse(e.data);
    renderUsers(list, users.length > 0); // la primera sincronización no lanza toasts
    messages.forEach(addMessage);
    connState.textContent = "conectado";
    connState.parentElement.classList.remove("offline");
});
source.addEventListener("presence", (e) => renderUsers(JSON.parse(e.data)));
source.addEventListener("message", (e) => addMessage(JSON.parse(e.data)));
source.addEventListener("typing", (e) => {
    const t = JSON.parse(e.data);
    if (!t.typing) return clearTyping(t.id);
    clearTimeout(typers.get(t.id)?.timer);
    typers.set(t.id, { name: t.name, avatar: t.avatar, timer: setTimeout(() => clearTyping(t.id), 6000) });
    renderTyping();
});
source.addEventListener("error", () => {
    connState.textContent = "reconectando…";
    connState.parentElement.classList.add("offline");
    // Si la sesión ya no existe en el servidor, volver al ingreso
    fetch(location.href, { method: "HEAD", redirect: "manual" }).then((r) => {
        if (r.type === "opaqueredirect") location.href = "/";
    }).catch(() => {});
});

// Inicializar la lista renderizada por el servidor
users = [...userList.children].map((li) => ({ id: li.dataset.id }));
$("#aloneHint").hidden = users.length > 1;
input.focus();

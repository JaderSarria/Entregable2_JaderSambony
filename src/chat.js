// ─────────────────────────────────────────────────────────────
//  Parche · Chat en vivo con Express + Handlebars
//  Servidor independiente: no modifica index.js ni sus vistas.
//  Tiempo real con Server-Sent Events (sin dependencias nuevas).
//  Ejecutar:  node --watch src/chat.js   →  http://localhost:8080
// ─────────────────────────────────────────────────────────────
import express from "express";
import handlebars from "express-handlebars";
import { randomUUID } from "crypto";
import { __dirname } from "./util.js";

const app = express();
const port = process.env.CHAT_PORT || 8080;

// ── Opciones de perfil ───────────────────────────────────────
const AVATARS = ["🦊", "🐼", "🐸", "🐙", "🦄", "🐯", "🐨", "🐵", "🐧", "🦁", "🐳", "🐝", "🦉", "🐢", "🦖", "🐱"];
const COLORS = [
  { key: "violeta", label: "Violeta" },
  { key: "oceano", label: "Océano" },
  { key: "lima", label: "Lima" },
  { key: "atardecer", label: "Atardecer" },
  { key: "oro", label: "Oro" },
  { key: "chicle", label: "Chicle" },
];
const COLOR_KEYS = COLORS.map((c) => c.key);

// ── Estado en memoria ────────────────────────────────────────
const users = new Map(); // id → usuario
const messages = []; // historial (últimos 100)
let msgSeq = 0;

const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  avatar: u.avatar,
  color: u.color,
  bio: u.bio,
  status: u.status,
  joinedAt: u.joinedAt,
});
const onlineList = () => [...users.values()].sort((a, b) => a.joinedAt - b.joinedAt).map(publicUser);

function pushMessage(msg) {
  msg.id = ++msgSeq;
  msg.ts = Date.now();
  messages.push(msg);
  if (messages.length > 100) messages.shift();
  broadcast("message", msg);
  return msg;
}

function send(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function broadcast(event, data, exceptId = null) {
  for (const u of users.values()) {
    if (u.id === exceptId) continue;
    for (const res of u.clients) send(res, event, data);
  }
}

function broadcastPresence() {
  broadcast("presence", onlineList());
}

function removeUser(id, reason = "salió del parche") {
  const u = users.get(id);
  if (!u) return;
  clearTimeout(u.leaveTimer);
  for (const res of u.clients) res.end();
  users.delete(id);
  broadcastPresence();
  pushMessage({ type: "system", kind: "leave", avatar: u.avatar, name: u.name, text: reason });
}

// Si nadie se conecta al stream en X ms, el usuario se considera desconectado
function scheduleLeave(u, ms) {
  clearTimeout(u.leaveTimer);
  u.leaveTimer = setTimeout(() => {
    if (u.clients.size === 0) removeUser(u.id);
  }, ms);
}

// ── Motor de plantillas ──────────────────────────────────────
app.engine(
  "handlebars",
  handlebars.engine({
    defaultLayout: "chat",
    helpers: {
      eq: (a, b) => a === b,
      initial: (s) => (s || "?").trim().charAt(0).toUpperCase(),
    },
  })
);
app.set("views", __dirname + "/views");
app.set("view engine", "handlebars");

app.use("/static", express.static(__dirname + "/public"));
app.use(express.json());

// ── Pantalla de ingreso ──────────────────────────────────────
app.get("/", (req, res) => {
  const online = onlineList();
  res.render("chat-login", {
    title: "Parche · Entra a la charla",
    page: "login",
    avatars: AVATARS,
    colors: COLORS,
    online: online.slice(0, 5),
    onlineCount: online.length,
    extraOnline: Math.max(0, online.length - 5),
  });
});

app.post("/chat/join", (req, res) => {
  const name = String(req.body?.name || "").trim().replace(/\s+/g, " ");
  const bio = String(req.body?.bio || "").trim().slice(0, 60);
  const avatar = AVATARS.includes(req.body?.avatar) ? req.body.avatar : AVATARS[0];
  const color = COLOR_KEYS.includes(req.body?.color) ? req.body.color : COLOR_KEYS[0];

  if (name.length < 2 || name.length > 20) {
    return res.status(400).json({ error: "Tu nombre debe tener entre 2 y 20 caracteres." });
  }
  const taken = [...users.values()].some((u) => u.name.toLowerCase() === name.toLowerCase());
  if (taken) {
    return res.status(409).json({ error: `“${name}” ya está en el chat. Prueba con otro nombre.` });
  }

  const user = {
    id: randomUUID(),
    name,
    bio,
    avatar,
    color,
    status: "online",
    joinedAt: Date.now(),
    clients: new Set(),
    leaveTimer: null,
  };
  users.set(user.id, user);
  scheduleLeave(user, 20000);

  broadcastPresence();
  pushMessage({ type: "system", kind: "join", avatar, name, text: "entró al parche" });
  res.json({ id: user.id });
});

// ── Sala de chat ─────────────────────────────────────────────
app.get("/chat/:id", (req, res) => {
  const me = users.get(req.params.id);
  if (!me) return res.redirect("/");
  res.render("chat-room", {
    title: `Parche · ${me.name}`,
    page: "room",
    me: publicUser(me),
    users: onlineList(),
    onlineCount: users.size,
    messages: messages.slice(-60),
    emojis: ["😀", "😂", "🥹", "😍", "😎", "🤔", "😴", "😭", "🔥", "✨", "🎉", "💜", "👍", "👏", "🙌", "🤝", "👀", "💯", "🚀", "🍕", "☕", "🎮", "🎧", "🌙"],
  });
});

// Stream en tiempo real (Server-Sent Events)
app.get("/chat/:id/stream", (req, res) => {
  const me = users.get(req.params.id);
  if (!me) return res.status(404).end();

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 2000\n\n");

  me.clients.add(res);
  clearTimeout(me.leaveTimer);
  send(res, "sync", { users: onlineList(), messages: messages.slice(-60) });

  const ping = setInterval(() => res.write(": ping\n\n"), 25000);
  req.on("close", () => {
    clearInterval(ping);
    me.clients.delete(res);
    if (me.clients.size === 0) scheduleLeave(me, 6000); // margen para recargas
  });
});

app.post("/chat/:id/message", (req, res) => {
  const me = users.get(req.params.id);
  if (!me) return res.status(404).json({ error: "Sesión no encontrada" });
  const text = String(req.body?.text || "").trim().slice(0, 500);
  if (!text) return res.status(400).json({ error: "Mensaje vacío" });
  broadcast("typing", { id: me.id, typing: false }, me.id);
  pushMessage({ type: "msg", userId: me.id, name: me.name, avatar: me.avatar, color: me.color, text });
  res.json({ ok: true });
});

app.post("/chat/:id/typing", (req, res) => {
  const me = users.get(req.params.id);
  if (!me) return res.status(404).end();
  broadcast("typing", { id: me.id, name: me.name, avatar: me.avatar, typing: !!req.body?.typing }, me.id);
  res.json({ ok: true });
});

app.post("/chat/:id/status", (req, res) => {
  const me = users.get(req.params.id);
  if (!me) return res.status(404).end();
  const status = req.body?.status === "away" ? "away" : "online";
  if (me.status !== status) {
    me.status = status;
    broadcastPresence();
  }
  res.json({ ok: true });
});

app.post("/chat/:id/leave", (req, res) => {
  removeUser(req.params.id);
  res.json({ ok: true });
});

app.listen(port, () => {
  console.log(`💬 Parche chat escuchando en http://localhost:${port}`);
});

# 💬 Parche · Chat en vivo

Interfaz de chat añadida al proyecto **sin modificar los archivos originales**
(`src/index.js`, `src/util.js`, las vistas `index`, `contact`, `layouts/main` y `package.json` siguen igual).

## Cómo ejecutarlo

```bash
npm install
node --watch src/chat.js
```

Abre http://localhost:8080 (y otra pestaña o ventana de incógnito para ver a otra persona en línea).
El proyecto original sigue funcionando igual con `npm start` en http://localhost:3000.

## Archivos nuevos

| Archivo | Qué hace |
|---|---|
| `src/chat.js` | Servidor Express + Handlebars del chat. Tiempo real con Server-Sent Events (no necesita dependencias nuevas). |
| `src/views/layouts/chat.handlebars` | Layout del chat (fondo animado, fuentes, estilos). |
| `src/views/chat-login.handlebars` | Pantalla de ingreso: nombre, avatar, color y estado, con vista previa en vivo. |
| `src/views/chat-room.handlebars` | Sala: personas en línea, mensajes, "escribiendo…", emojis. |
| `src/public/chat/styles.css` | Estilos y animaciones. |
| `src/public/chat/login.js` | Lógica de la pantalla de ingreso. |
| `src/public/chat/room.js` | Lógica de la sala (mensajes en vivo, presencia, escribiendo, ausente). |

## Rutas

- `GET /` → formulario de ingreso
- `POST /chat/join` → crea el usuario
- `GET /chat/:id` → sala (renderizada con Handlebars)
- `GET /chat/:id/stream` → eventos en tiempo real
- `POST /chat/:id/message | typing | status | leave`

Los datos viven en memoria: al reiniciar el servidor se vacía el chat.

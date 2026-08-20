/* HTTP (statik dosyalar) + WebSocket sunucusu tek portta.
   Barındırma sağlayıcıları tek port verdiği için ikisi aynı sunucuya bağlanır. */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");
const { Hub } = require("./rooms.js");

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || "0.0.0.0";
const MAX_CONN_PER_IP = Number(process.env.MAX_CONN_PER_IP) || 8;
const MAX_MSG_BYTES = 4096;
const MSG_BURST = 40;            // 2 saniyede en fazla bu kadar mesaj
const MSG_WINDOW_MS = 2000;
const HEARTBEAT_MS = 25000;

const ROOT = path.join(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const SHARED = path.join(ROOT, "shared");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json"
};

/* İstenen yolu public/ (ve /shared/) içine hapseder; dizin dışına çıkışı engeller. */
function resolveFile(urlPath) {
  let p = decodeURIComponent(urlPath.split("?")[0]);
  if (p === "/" || p === "") p = "/index.html";
  const base = p.startsWith("/shared/") ? ROOT : PUBLIC;
  const rel = p.slice(1);
  const full = path.normalize(path.join(base, rel));
  const allowed = p.startsWith("/shared/") ? SHARED : PUBLIC;
  if (!full.startsWith(allowed + path.sep) && full !== allowed) return null;
  return full;
}

const server = http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
    return res.end("Yalnizca GET");
  }
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({
      ok: true,
      rooms: hub.rooms.size,
      clients: hub.clients.size,
      uptime: Math.round(process.uptime())
    }));
  }

  const file = resolveFile(req.url);
  if (!file) {
    res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    return res.end("Yasak");
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      return res.end("Bulunamadi");
    }
    const ext = path.extname(file).toLowerCase();
    /* Sürüm damgası yok; bu yüzden süreli önbellek yerine her istekte
       doğrulama yapıyoruz. Aksi halde yayın sonrası eski JS elde kalıyor. */
    const etag = '"' + st.size.toString(16) + "-" + st.mtimeMs.toString(16) + '"';
    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304, { etag: etag, "cache-control": "no-cache" });
      return res.end();
    }
    res.writeHead(200, {
      "content-type": MIME[ext] || "application/octet-stream",
      "content-length": st.size,
      "cache-control": "no-cache",
      etag: etag,
      "last-modified": st.mtime.toUTCString(),
      "x-content-type-options": "nosniff"
    });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  });
});

const hub = new Hub({ speed: Number(process.env.GORILLAS_SPEED) || 1 });
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: MAX_MSG_BYTES });
const perIp = new Map();

function ipOf(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length) return fwd.split(",")[0].trim();
  return req.socket.remoteAddress || "?";
}

wss.on("connection", (ws, req) => {
  const ip = ipOf(req);
  const used = perIp.get(ip) || 0;
  if (used >= MAX_CONN_PER_IP) {
    ws.send(JSON.stringify({ t: "err", text: "Bu adresten çok fazla bağlantı var.", code: "ratelimit" }));
    return ws.close(1008, "too many connections");
  }
  perIp.set(ip, used + 1);

  const id = crypto.randomUUID();
  const client = {
    id: id,
    name: "Goril",
    stamps: [],
    alive: true,
    send(msg) { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg)); }
  };
  hub.addClient(client);

  ws.on("message", (data, isBinary) => {
    if (isBinary || data.length > MAX_MSG_BYTES) return;
    const now = Date.now();
    client.stamps = client.stamps.filter((s) => now - s < MSG_WINDOW_MS);
    if (client.stamps.length >= MSG_BURST) return;
    client.stamps.push(now);

    let msg;
    try { msg = JSON.parse(data.toString("utf8")); } catch (e) { return; }
    if (!msg || typeof msg !== "object") return;
    try { hub.handle(id, msg); } catch (e) { console.error("handle hatasi:", e); }
  });

  ws.on("pong", () => { client.alive = true; });

  ws.on("close", () => {
    hub.removeClient(id);
    const left = (perIp.get(ip) || 1) - 1;
    if (left <= 0) perIp.delete(ip); else perIp.set(ip, left);
  });

  ws.on("error", () => { try { ws.terminate(); } catch (e) {} });

  ws._client = client;
});

/* Sessizce kopan bağlantılar odada hayalet oyuncu bırakmasın. */
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    const c = ws._client;
    if (c && c.alive === false) { try { ws.terminate(); } catch (e) {} continue; }
    if (c) c.alive = false;
    try { ws.ping(); } catch (e) {}
  }
}, HEARTBEAT_MS);
heartbeat.unref?.();

function shutdown() {
  clearInterval(heartbeat);
  for (const ws of wss.clients) { try { ws.close(1001, "server restart"); } catch (e) {} }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log("GORILLAS ONLINE -> http://localhost:" + PORT);
  });
}

module.exports = { server, hub, wss };

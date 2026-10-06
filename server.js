// Spribe-OS "BRIDGE" — Middleware + Next.js host (single process).
// - POST /api/ingest      <- Extension pushes ticks / crashes / credentials
// - GET  /api/history     <- Dashboard bootstrap (last 200)
// - GET  /api/operator/generate
// - Socket.io rooms: operator:<CODE> events: tick, crash, stats, credentials, hello
const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const http = require("http");
const next = require("next");
const { Server } = require("socket.io");

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);
const app = next({ dev });
const handle = app.getRequestHandler();

const DATA_DIR = path.join(__dirname, "server", "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

// ---- In-memory store: operatorCode -> { history[<=200], live, credentials, updatedAt }
const store = new Map();

function codeOf(v) {
  return String(v || "").trim().toUpperCase();
}
function isCode(v) {
  return /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(codeOf(v));
}
function genCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `${seg()}-${seg()}-${seg()}`;
}
function dataFile(code) {
  return path.join(DATA_DIR, `history-${code}.json`);
}
function getState(code) {
  code = codeOf(code);
  if (!store.has(code)) {
    let history = [];
    try {
      if (fs.existsSync(dataFile(code))) {
        const raw = JSON.parse(fs.readFileSync(dataFile(code), "utf8"));
        if (Array.isArray(raw)) history = raw.filter((r) => r && Number(r.crashPoint) >= 1).slice(-200);
      }
    } catch {}
    store.set(code, { history, live: null, credentials: null, updatedAt: Date.now() });
  }
  return store.get(code);
}
function persist(code) {
  try {
    const st = store.get(codeOf(code));
    if (st) fs.writeFileSync(dataFile(codeOf(code)), JSON.stringify(st.history.slice(-200)));
  } catch {}
}
function analyze(history) {
  const pts = history.map((h) => Number(h.crashPoint)).filter((n) => Number.isFinite(n) && n >= 1);
  const n = pts.length;
  if (!n) return { count: 0, sub2Streak: 0, biasLabel: "Waiting for data", message: "Connect extension.", avg: 0 };
  let streak = 0;
  for (let i = pts.length - 1; i >= 0; i--) { if (pts[i] < 2) streak++; else break; }
  const sub2 = pts.filter((x) => x < 2).length;
  const avg = pts.reduce((a, b) => a + b, 0) / n;
  let biasLabel = "Neutral", message = `Neutral over last ${n} (avg ${avg.toFixed(2)}x).`;
  if (streak >= 4) { biasLabel = "High volatility expected"; message = `Server produced ${streak} sub-2.00x results in a row. High volatility expected.`; }
  else if (streak >= 3) { biasLabel = "Pressure building"; message = `${streak} sub-2.00x in a row. Pressure building.`; }
  else if (sub2 / n > 0.65) { biasLabel = "House bias: LOW"; message = `${Math.round((sub2 / n) * 100)}% under 2x — house is tight.`; }
  else if (avg > 3.2) { biasLabel = "House bias: GENEROUS"; message = `Avg ${avg.toFixed(2)}x — table is generous.`; }
  return { count: n, sub2Streak: streak, biasLabel, message, avg: Math.round(avg * 100) / 100 };
}

app.prepare().then(() => {
  const ex = express();
  ex.use(cors());
  ex.use(express.json({ limit: "256kb" }));

  // Health
  ex.get("/api/health", (req, res) => res.json({ ok: true, at: Date.now() }));

  // Operator code issuance
  ex.get("/api/operator/generate", (req, res) => {
    const code = genCode();
    getState(code);
    persist(code);
    res.json({ operatorCode: code });
  });

  // Dashboard bootstrap: last 200 + live + stats
  ex.get("/api/history", (req, res) => {
    const code = codeOf(req.query.operatorCode);
    if (!isCode(code)) return res.status(400).json({ error: "valid operatorCode required" });
    const st = getState(code);
    res.json({ operatorCode: code, history: st.history.slice(-200), live: st.live, stats: analyze(st.history), credentials: st.credentials ? { updatedAt: st.credentials.updatedAt, wsHost: st.credentials.wsHost } : null });
  });

  // ---- INGESTION (the Data Loop entry) ----
  ex.post("/api/ingest", (req, res) => {
    const b = req.body || {};
    const code = codeOf(b.operatorCode);
    if (!isCode(code)) return res.status(400).json({ error: "valid operatorCode required (XXXX-XXXX-XXXX)" });
    const type = String(b.type || "").toLowerCase();
    if (!["tick", "crash", "hello", "credentials"].includes(type)) return res.status(400).json({ error: "type must be tick|crash|hello|credentials" });
    const st = getState(code);
    const now = Date.now();
    let emitted = null;

    if (type === "tick") {
      const m = Number(b.multiplier);
      if (!Number.isFinite(m) || m < 1 || m >= 1000) return res.status(400).json({ error: "valid multiplier required" });
      st.live = { multiplier: Math.round(m * 100) / 100, at: now, roundId: b.roundId ? String(b.roundId).slice(0, 64) : undefined };
      st.updatedAt = now;
      emitted = { event: "tick", payload: { operatorCode: code, ...st.live } };
      io.to(`operator:${code}`).emit("tick", emitted.payload);
    } else if (type === "crash") {
      const c = Number(b.crashPoint);
      if (!Number.isFinite(c) || c < 1 || c >= 1000) return res.status(400).json({ error: "valid crashPoint required" });
      const row = { crashPoint: Math.round(c * 100) / 100, at: now, roundId: b.roundId ? String(b.roundId).slice(0, 64) : undefined };
      const last = st.history[st.history.length - 1];
      if (!last || last.crashPoint !== row.crashPoint || now - last.at > 3000 || (row.roundId && row.roundId !== last.roundId)) {
        st.history.push(row);
        if (st.history.length > 200) st.history = st.history.slice(-200);
        persist(code);
      }
      st.live = null;
      st.updatedAt = now;
      emitted = { event: "crash", payload: { operatorCode: code, ...row, stats: analyze(st.history) } };
      io.to(`operator:${code}`).emit("crash", emitted.payload);
      io.to(`operator:${code}`).emit("stats", { operatorCode: code, ...analyze(st.history) });
    } else if (type === "credentials" || type === "hello") {
      st.credentials = {
        updatedAt: now,
        wsHost: b.wsUrl ? String(b.wsUrl).slice(0, 160) : undefined,
        hasSession: Boolean(b.sessionToken),
        operator: b.operator ? String(b.operator).slice(0, 64) : undefined,
        userAgent: req.headers["user-agent"]?.slice(0, 120),
      };
      st.updatedAt = now;
      // persist credentials meta alongside (best-effort)
      try { fs.writeFileSync(path.join(DATA_DIR, `creds-${code}.json`), JSON.stringify(st.credentials)); } catch {}
      emitted = { event: type, payload: { operatorCode: code, ...st.credentials } };
      io.to(`operator:${code}`).emit(type === "hello" ? "hello" : "credentials", emitted.payload);
    }

    res.json({ ok: true, ...emitted, stats: analyze(st.history), historyLen: st.history.length });
  });

  const server = http.createServer(ex);
  const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

  io.on("connection", (socket) => {
    // Client: socket.emit("subscribe", "XXXX-XXXX-XXXX") or ?operatorCode=
    const q = codeOf(socket.handshake.query?.operatorCode);
    if (isCode(q)) {
      socket.join(`operator:${q}`);
      const st = getState(q);
      socket.emit("bootstrap", { operatorCode: q, history: st.history.slice(-200), live: st.live, stats: analyze(st.history) });
    }
    socket.on("subscribe", (code) => {
      code = codeOf(code);
      if (!isCode(code)) return socket.emit("error", { error: "valid operatorCode required" });
      socket.join(`operator:${code}`);
      const st = getState(code);
      socket.emit("bootstrap", { operatorCode: code, history: st.history.slice(-200), live: st.live, stats: analyze(st.history) });
    });
    socket.on("unsubscribe", (code) => socket.leave(`operator:${codeOf(code)}`));
  });

  // Next.js fallback
  ex.all("*", (req, res) => handle(req, res));

  server.listen(port, () => console.log(`> Spribe-OS ready on http://localhost:${port}`));
});

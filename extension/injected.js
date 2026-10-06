// injected.js — runs in PAGE context (not isolated). Patches WebSocket
// before the Aviator client connects, then decodes Spribe frames.
//
// Target gateway example: wss://et.af-south-1.spribegaming.com?...userid=..&gameZone=..
// Observed Spribe payload shapes (defensive parsing covers variants):
//   {"t":"telemetry","current_multiplier":3.42,...}
//   {"event":"multiplier","value":3.42} / {"coefficient":3.42}
//   {"t":"game_result","crash_point":2.13} / {"crashPoint":..} / {"final_multiplier":..}
// Never place bets — read-only telemetry.
(function () {
  if (window.__spribeSensorPatched) return;
  window.__spribeSensorPatched = true;

  const post = (msg) => window.postMessage({ __spribe_sensor: true, ...msg }, "*");

  function extractNumbers(obj, keys) {
    if (obj == null) return null;
    if (typeof obj === "number") return null;
    if (typeof obj === "object") {
      for (const k of keys) {
        if (obj[k] !== undefined) {
          const n = Number(obj[k]);
          if (Number.isFinite(n) && n >= 1 && n < 100000) return n;
        }
      }
      // nested scan one level deep
      for (const v of Object.values(obj)) {
        if (v && typeof v === "object") {
          for (const k of keys) {
            if (v[k] !== undefined) {
              const n = Number(v[k]);
              if (Number.isFinite(n) && n >= 1 && n < 100000) return n;
            }
          }
        }
      }
    }
    return null;
  }

  const MULT_KEYS = ["current_multiplier", "multiplier", "coefficient", "coef", "value", "x"];
  const CRASH_KEYS = ["crash_point", "crashPoint", "final_multiplier", "finalMultiplier", "game_result", "gameResult", "crash"];

  function handleText(url, text) {
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* binary-ish or concatenated frames */ }
    const tryObj = (o) => {
      if (!o || typeof o !== "object") return;
      const crash = extractNumbers(o, CRASH_KEYS);
      // A crash frame usually also carries a terminal flag; accept explicit crash keys only
      // to avoid mistaking a live tick for a crash.
      const looksTerminal =
        o.t === "game_result" || o.event === "crash" || o.event === "game_result" ||
        o.state === "crashed" || o.crashed === true || crash !== null && (o.final === true || o.t === "crash");
      const mult = extractNumbers(o, MULT_KEYS);
      if (crash !== null && (looksTerminal || o.crash_point !== undefined || o.crashPoint !== undefined)) {
        post({ kind: "ws-msg", url, data: JSON.stringify({ __decoded: "crash", crashPoint: crash, roundId: o.round_id || o.roundId, raw: text.slice(0, 500) }) });
      } else if (mult !== null) {
        post({ kind: "ws-msg", url, data: JSON.stringify({ __decoded: "tick", multiplier: mult, roundId: o.round_id || o.roundId, raw: text.slice(0, 300) }) });
      } else {
        // Fallback regex on raw text (covers string-encoded floats)
        const m1 = text.match(/"current_multiplier"\s*:\s*([0-9]+\.[0-9]+)/);
        const m2 = text.match(/"(crash_point|crashPoint|final_multiplier)"\s*:\s*([0-9]+\.[0-9]+)/);
        if (m2) post({ kind: "ws-msg", url, data: JSON.stringify({ __decoded: "crash", crashPoint: Number(m2[2]) }) });
        else if (m1) post({ kind: "ws-msg", url, data: JSON.stringify({ __decoded: "tick", multiplier: Number(m1[1]) }) });
      }
    };
    if (parsed) {
      if (Array.isArray(parsed)) parsed.forEach(tryObj);
      else tryObj(parsed);
    } else {
      const m1 = text.match(/"current_multiplier"\s*:\s*([0-9]+\.[0-9]+)/);
      const m2 = text.match(/"(crash_point|crashPoint|final_multiplier)"\s*:\s*([0-9]+\.[0-9]+)/);
      if (m2) post({ kind: "ws-msg", url, data: JSON.stringify({ __decoded: "crash", crashPoint: Number(m2[2]) }) });
      else if (m1) post({ kind: "ws-msg", url, data: JSON.stringify({ __decoded: "tick", multiplier: Number(m1[1]) }) });
    }
  }

  const NativeWS = window.WebSocket;
  function PatchedWS(url, protocols) {
    const ws = protocols ? new NativeWS(url, protocols) : new NativeWS(url);
    if (typeof url === "string" && url.includes("spribegaming")) {
      post({ kind: "ws-open", url: String(url).slice(0, 500) });
      ws.addEventListener("message", (ev) => {
        try {
          const data = typeof ev.data === "string" ? ev.data : null;
          if (data) handleText(String(url), data);
        } catch {}
      });
    }
    return ws;
  }
  PatchedWS.prototype = NativeWS.prototype;
  Object.defineProperties(PatchedWS, Object.getOwnPropertyDescriptors(NativeWS));
  window.WebSocket = PatchedWS;
})();

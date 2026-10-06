// background.js — MV3 service worker: the SENDER.
// Receives sniffed frames + credentials from content.js, normalizes,
// and POSTs to the Bridge (/api/ingest) under the user's Operator Code.

const DEFAULT_BRIDGE = "http://localhost:3000"; // user can override in popup

async function cfg() {
  const s = await chrome.storage.sync.get({ operatorCode: "", bridgeUrl: DEFAULT_BRIDGE });
  return { operatorCode: String(s.operatorCode || "").trim().toUpperCase(), bridgeUrl: String(s.bridgeUrl || DEFAULT_BRIDGE).replace(/\/$/, "") };
}

async function postIngest(payload) {
  const { operatorCode, bridgeUrl } = await cfg();
  if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(operatorCode)) {
    await chrome.storage.local.set({ lastError: "Set your Operator Code in the popup first." });
    return { ok: false, error: "no-operator-code" };
  }
  try {
    const res = await fetch(`${bridgeUrl}/api/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operatorCode, ...payload }),
    });
    const json = await res.json().catch(() => ({}));
    await chrome.storage.local.set({ lastError: res.ok ? "" : (json.error || `HTTP ${res.status}`), lastPush: Date.now(), lastType: payload.type });
    return json;
  } catch (e) {
    await chrome.storage.local.set({ lastError: String(e?.message || e).slice(0, 160) });
    return { ok: false, error: String(e?.message || e) };
  }
}

// Throttle ticks: at most 1 per 120ms; crashes + credentials always pass.
let lastTickAt = 0;
let lastCredsSig = "";

function frameToPayload(raw, url) {
  let o = null;
  try { o = JSON.parse(raw); } catch { return null; }
  const inner = o?.__decoded ? o : null;
  if (inner) {
    if (inner.__decoded === "crash" && Number.isFinite(Number(inner.crashPoint))) {
      return { type: "crash", crashPoint: Number(inner.crashPoint), roundId: inner.roundId, wsUrl: url };
    }
    if (inner.__decoded === "tick" && Number.isFinite(Number(inner.multiplier))) {
      return { type: "tick", multiplier: Number(inner.multiplier), roundId: inner.roundId, wsUrl: url };
    }
    return null;
  }
  // Raw spribe frame passthrough (best effort)
  const get = (k) => (o?.[k] ?? o?.data?.[k]);
  const crash = Number(get("crash_point") ?? get("crashPoint") ?? get("final_multiplier"));
  if (Number.isFinite(crash) && crash >= 1) return { type: "crash", crashPoint: crash, wsUrl: url };
  const mult = Number(get("current_multiplier") ?? get("multiplier") ?? get("coefficient"));
  if (Number.isFinite(mult) && mult >= 1) return { type: "tick", multiplier: mult, wsUrl: url };
  return null;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg?.kind === "spribe-frame") {
      const payload = frameToPayload(msg.raw, msg.url);
      if (!payload) return sendResponse({ ok: false, ignored: true });
      if (payload.type === "tick") {
        const now = Date.now();
        if (now - lastTickAt < 120) return sendResponse({ ok: true, throttled: true });
        lastTickAt = now;
      }
      sendResponse(await postIngest(payload));
    } else if (msg?.kind === "spribe-credentials") {
      const c = msg.creds || {};
      const sig = [c.sessionToken, c.wsUrl, c.operator].join("|");
      if (sig === lastCredsSig) return sendResponse({ ok: true, deduped: true });
      lastCredsSig = sig; // refresh handling: new token/URL always pushed
      sendResponse(await postIngest({ type: "credentials", sessionToken: c.sessionToken, operator: c.operator, wsUrl: c.wsUrl, userid: c.userid, gameZone: c.gameZone }));
    } else if (msg?.kind === "ping-bridge") {
      sendResponse(await postIngest({ type: "hello" }));
    }
  })();
  return true; // async response
});

// Re-push a hello on install so the dashboard shows the sensor as linked.
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get({ operatorCode: "" }, () => {});
});

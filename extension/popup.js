const $ = (id) => document.getElementById(id);

async function load() {
  const s = await chrome.storage.sync.get({ operatorCode: "", bridgeUrl: "http://localhost:3000" });
  $("code").value = s.operatorCode || "";
  $("bridge").value = s.bridgeUrl || "";
  const l = await chrome.storage.local.get({ lastError: "", lastPush: 0, lastType: "" });
  $("last").textContent = l.lastPush ? `last ${l.lastType || "?"} push: ${new Date(l.lastPush).toLocaleTimeString()}${l.lastError ? " · ERR " + l.lastError : " · OK"}` : "no pushes yet — open an Aviator tab";
}

$("save").onclick = async () => {
  const code = $("code").value.trim().toUpperCase();
  const bridgeUrl = $("bridge").value.trim().replace(/\/$/, "") || "http://localhost:3000";
  if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) {
    $("status").textContent = "Format must be XXXX-XXXX-XXXX";
    $("status").style.color = "#ff8fa3";
    return;
  }
  await chrome.storage.sync.set({ operatorCode: code, bridgeUrl });
  $("status").style.color = "#34F5C5";
  $("status").textContent = "Linked ✓ — open the Aviator tab now.";
};

$("test").onclick = async () => {
  $("status").textContent = "Pinging bridge…";
  const r = await chrome.runtime.sendMessage({ kind: "ping-bridge" });
  $("status").textContent = r?.ok ? "Bridge reachable ✓" : `Failed: ${r?.error || (await chrome.storage.local.get({ lastError: "?" })).lastError}`;
};

load();

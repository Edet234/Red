"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

function useOperatorCode() {
  const [code, setCode] = useState("");
  useEffect(() => {
    setCode(localStorage.getItem("spribe-operator") || "");
  }, []);
  return [code, setCode];
}

export default function Landing() {
  const [code] = useOperatorCode();
  const [health, setHealth] = useState(null);
  useEffect(() => {
    fetch("/api/health").then((r) => r.json()).then(setHealth).catch(() => {});
  }, []);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-20 pt-6 sm:pt-10">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-neon font-black">S</div>
          <div>
            <p className="text-sm font-extrabold tracking-widest">SPRIBE-OS</p>
            <p className="text-[11px] text-white/50">Aviator Intelligence Portal</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ${health ? "bg-emerald-500/15 text-emerald-300" : "bg-white/10 text-white/60"}`}>
            <span className={`h-2 w-2 rounded-full ${health ? "bg-emerald-400 live-dot" : "bg-white/40"}`} />
            {health ? "Bridge online" : "Checking bridge…"}
          </span>
          <Link href="/dashboard" className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-black active:scale-95">Open Brain</Link>
        </div>
      </header>

      <section className="glass mt-8 overflow-hidden rounded-3xl p-6 sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-mint">Distribution Hub · Brain · Bridge</p>
        <h1 className="mt-3 text-4xl font-black leading-tight sm:text-6xl">
          The Aviator<br />Intelligence Portal<span className="text-neon">.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/70 sm:text-base">
          Install the <b>Spribe Sensor</b> extension on your game tab (1Win / Bangbet / Stake).
          It sniffs the live <code className="rounded bg-black/50 px-1 text-mint">wss://et.af-south-1.spribegaming.com</code> gateway —
          current multiplier + final crash point — and pushes it to the Bridge.
          The Brain dashboard renders it in real time, keyed to your <b>Operator Code</b>.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <a href="/downloads/spribe-sensor.zip" className="rounded-2xl bg-neon px-6 py-4 text-center text-base font-black shadow-[0_10px_40px_rgba(255,61,90,.45)] active:scale-[.98]">
            ⬇ Download the Spribe Sensor (.zip)
          </a>
          <Link href="/dashboard" className="rounded-2xl border border-white/15 bg-white/5 px-6 py-4 text-center text-base font-bold active:scale-[.98]">
            Open live dashboard →
          </Link>
        </div>
        {code && <p className="mt-4 text-xs text-white/60">Your Operator Code on this device: <b className="text-gold">{code}</b></p>}
        <div className="mt-6 grid grid-cols-3 gap-2 text-center text-[11px] sm:text-xs">
          {[["① Install", "Unpack .zip in Kiwi / Chrome"], ["② Link", "Paste Operator Code in popup"], ["③ Watch", "Live ticker in the Brain"]].map(([t, d]) => (
            <div key={t} className="rounded-2xl bg-black/30 p-3">
              <p className="font-black text-white">{t}</p>
              <p className="mt-1 text-white/55">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="download" className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="glass rounded-3xl p-6">
          <h2 className="text-lg font-black">📦 Download Center</h2>
          <p className="mt-1 text-sm text-white/60">Manifest V3 sensor · Chrome / Kiwi / Via compatible · ~15 KB</p>
          <ul className="mt-4 space-y-2 text-sm text-white/75">
            <li>✓ Sniffs sessionToken + operator + dynamic WSS URL</li>
            <li>✓ Parses multiplier &amp; crash-point frames</li>
            <li>✓ Auto re-syncs credentials on page refresh</li>
            <li>✓ Pushes only to <i>your</i> Operator Code room</li>
          </ul>
          <a href="/downloads/spribe-sensor.zip" className="mt-5 block rounded-2xl bg-gold px-5 py-3.5 text-center font-black text-black active:scale-[.98]">Download spribe-sensor.zip</a>
          <p className="mt-2 text-center text-[11px] text-white/40">If the button 404s before first build, run <code>npm run zip:extension</code>.</p>
        </div>
        <div className="glass rounded-3xl p-6">
          <h2 className="text-lg font-black">🔑 Operator Code</h2>
          <p className="mt-1 text-sm text-white/60">The key that links your extension → your dashboard. Keep it private.</p>
          <OperatorBox />
          <Link href="/dashboard" className="mt-4 block rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-center font-bold">Go to Admin Panel →</Link>
        </div>
      </section>

      <section className="glass mt-4 rounded-3xl p-6">
        <h2 className="text-lg font-black">🔁 The Data Loop</h2>
        <ol className="mt-3 space-y-2 text-sm text-white/70">
          <li><b className="text-white">SOURCE —</b> Extension captures <code>current_multiplier</code> + <code>game_result</code> (crash point) from the Spribe gateway tab.</li>
          <li><b className="text-white">TRANSMISSION —</b> <code>POST /api/ingest</code> with <code>{"{operatorCode, type, multiplier/crashPoint}"}</code>.</li>
          <li><b className="text-white">PROCESSING —</b> Bridge normalizes, keeps rolling last-200 history, persists to disk.</li>
          <li><b className="text-white">DISPLAY —</b> Dashboard subscribes <code>socket.emit("subscribe", code)</code> → live <code>tick</code> / <code>crash</code> / <code>stats</code>.</li>
        </ol>
      </section>

      <footer className="mt-8 text-center text-[11px] text-white/35">
        Spribe-OS is an analytics overlay. It does not place bets and cannot predict certified RNG outcomes. Play responsibly.
      </footer>
    </main>
  );
}

function OperatorBox() {
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  useEffect(() => { setCode(localStorage.getItem("spribe-operator") || ""); }, []);
  const fresh = async () => {
    const r = await fetch("/api/operator/generate").then((r) => r.json());
    localStorage.setItem("spribe-operator", r.operatorCode);
    setCode(r.operatorCode); setMsg("New code issued + saved.");
  };
  const save = (v) => {
    const c = v.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(c)) { setMsg("Format: XXXX-XXXX-XXXX"); return; }
    localStorage.setItem("spribe-operator", c); setCode(c); setMsg("Linked ✓");
  };
  return (
    <div className="mt-3">
      <div className="rounded-2xl bg-black/50 p-4 text-center font-mono text-xl font-black tracking-widest text-gold">{code || "— no code yet —"}</div>
      <div className="mt-2 flex gap-2">
        <button onClick={fresh} className="flex-1 rounded-xl bg-white px-3 py-2.5 text-sm font-black text-black">Generate</button>
        <button onClick={() => { const v = prompt("Paste Operator Code:"); if (v) save(v); }} className="flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm font-bold">Paste existing</button>
      </div>
      {msg && <p className="mt-2 text-center text-xs text-mint">{msg}</p>}
    </div>
  );
}

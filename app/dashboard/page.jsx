"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { io } from "socket.io-client";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, BarChart, Bar, Cell,
} from "recharts";
import { analyzePatterns, probabilityCurve } from "@/lib/spribe";

export default function Dashboard() {
  const [code, setCode] = useState("");
  const [input, setInput] = useState("");
  const [live, setLive] = useState(null);
  const [history, setHistory] = useState([]);
  const [status, setStatus] = useState("disconnected");
  const [err, setErr] = useState("");
  const sockRef = useRef(null);

  useEffect(() => {
    setCode(localStorage.getItem("spribe-operator") || "");
  }, []);

  const authed = useMemo(
    () => /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code),
    [code]
  );

  useEffect(() => {
    if (!authed) return;
    setStatus("connecting");
    setErr("");
    // Bootstrap via REST (persistent last-200)
    fetch(`/api/history?operatorCode=${encodeURIComponent(code)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("history failed"))))
      .then((d) => { setHistory(d.history || []); if (d.live) setLive(d.live); })
      .catch(() => setErr("Could not load history. Is the Bridge running?"));
    // Live subscription
    const s = io({ query: { operatorCode: code } });
    sockRef.current = s;
    s.on("connect", () => setStatus("live"));
    s.on("disconnect", () => setStatus("reconnecting"));
    s.on("bootstrap", (d) => { setHistory(d.history || []); if (d.live) setLive(d.live); });
    s.on("tick", (t) => setLive(t));
    s.on("crash", (c) => {
      setLive(null);
      setHistory((h) => {
        if (h.length && h[h.length - 1]?.crashPoint === c.crashPoint && h[h.length - 1]?.roundId === c.roundId) return h;
        return [...h, { crashPoint: c.crashPoint, at: c.at, roundId: c.roundId }].slice(-200);
      });
    });
    s.emit("subscribe", code);
    return () => s.disconnect();
  }, [authed, code]);

  const stats = useMemo(() => analyzePatterns(history), [history]);
  const curve = useMemo(() => probabilityCurve(history), [history]);
  const spark = useMemo(
    () => history.slice(-60).map((h, i) => ({ i: i + 1, crash: Number(h.crashPoint) })),
    [history]
  );

  const login = () => {
    const c = input.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(c)) { setErr("Operator Code format: XXXX-XXXX-XXXX"); return; }
    localStorage.setItem("spribe-operator", c);
    setCode(c); setErr("");
  };
  const logout = () => { localStorage.removeItem("spribe-operator"); setCode(""); setHistory([]); setLive(null); };

  if (!authed) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-16 pt-10">
        <Link href="/" className="text-xs text-white/50">← Spribe-OS</Link>
        <div className="glass mt-6 rounded-3xl p-6">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-mint">Brain · secured</p>
          <h1 className="mt-2 text-3xl font-black">Enter Operator Code</h1>
          <p className="mt-2 text-sm text-white/60">Same code you pasted into the extension popup. Generate one on the landing page if needed.</p>
          <input
            value={input} onChange={(e) => setInput(e.target.value.toUpperCase())}
            placeholder="XXXX-XXXX-XXXX"
            inputMode="text" autoCapitalize="characters"
            className="mt-4 w-full rounded-2xl border border-white/15 bg-black/50 p-4 text-center font-mono text-lg font-black tracking-[0.2em] text-gold outline-none placeholder:text-white/20 focus:border-gold"
          />
          <button onClick={login} className="mt-3 w-full rounded-2xl bg-neon py-4 font-black active:scale-[.98]">Unlock dashboard</button>
          {err && <p className="mt-3 text-center text-xs text-red-300">{err}</p>}
          <button onClick={async () => { const r = await fetch("/api/operator/generate").then(r=>r.json()); setInput(r.operatorCode); }} className="mt-2 w-full rounded-2xl border border-white/15 bg-white/5 py-3 text-sm font-bold">I don't have one — generate</button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-3 pb-24 pt-4 sm:pt-6">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-xs text-white/50">← Hub</Link>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold ${status === "live" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>
          <span className={`h-2 w-2 rounded-full ${status === "live" ? "bg-emerald-400 live-dot" : "bg-amber-400"}`} />
          {status === "live" ? "LIVE" : status.toUpperCase()}
        </span>
        <button onClick={logout} className="text-[11px] text-white/40 underline">unlink</button>
      </header>

      {/* LIVE MULTIPLIER */}
      <section className="glass animate-rise mt-3 rounded-3xl p-5 text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/50">Live multiplier</p>
        {live ? (
          <>
            <p className="ticker-glow font-black text-neon" style={{ fontSize: "clamp(56px,18vw,110px)", lineHeight: 1 }}>
              {Number(live.multiplier).toFixed(2)}x
            </p>
            <p className="mt-1 text-[11px] text-white/45">round {live.roundId || "—"} · tick {new Date(live.at).toLocaleTimeString()}</p>
          </>
        ) : (
          <>
            <p className="mt-2 text-4xl font-black text-white/25">— waiting —</p>
            <p className="mx-auto mt-2 max-w-sm text-xs text-white/45">No live round. Open the Aviator tab with the Sensor extension — ticks appear here in ~100ms.</p>
          </>
        )}
        <p className="mt-3 inline-block rounded-full bg-black/40 px-3 py-1 font-mono text-[11px] tracking-widest text-gold">{code}</p>
      </section>

      {/* CRYSTAL BALL */}
      <section className="glass mt-3 rounded-3xl p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-black">🔮 Crystal Ball <span className="text-[11px] font-medium text-white/40">· last {stats.count}</span></h2>
          <span className="rounded-full bg-violet/20 px-3 py-1 text-[11px] font-bold text-violet-200">{stats.volatility}</span>
        </div>
        <p className="mt-2 rounded-2xl bg-black/40 p-3 text-sm leading-relaxed text-white/85"><b className="text-gold">{stats.biasLabel}.</b> {stats.message}</p>
        <div className="mt-3 grid grid-cols-4 gap-2 text-center">
          {[
            ["Avg", stats.avg ? `${stats.avg.toFixed(2)}x` : "—"],
            ["Median", stats.median ? `${stats.median.toFixed(2)}x` : "—"],
            ["Sub-2 streak", `${stats.sub2Streak}`],
            ["Max", stats.max ? `${stats.max.toFixed(2)}x` : "—"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl bg-white/5 p-2.5">
              <p className="text-sm font-black">{v}</p>
              <p className="text-[10px] uppercase tracking-wider text-white/45">{k}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 h-28">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.distribution}>
              <XAxis dataKey="label" tick={{ fill: "#ffffff88", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#0D1321", border: "1px solid #ffffff22", borderRadius: 12, fontSize: 12 }} />
              <Bar dataKey="pct" radius={[8, 8, 4, 4]}>
                {(stats.distribution || []).map((_, i) => (
                  <Cell key={i} fill={["#FF3D5A", "#FFC531", "#34F5C5", "#8B5CF6"][i % 4]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* PROBABILITY */}
      <section className="glass mt-3 rounded-3xl p-5">
        <h2 className="text-base font-black">📈 Upcoming-round probability <span className="text-[11px] font-medium text-white/40">(empirical, last {stats.count})</span></h2>
        <div className="mt-2 h-44">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={curve}>
              <XAxis dataKey="target" tick={{ fill: "#ffffff88", fontSize: 11 }} tickFormatter={(v) => `${v}x`} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#ffffff88", fontSize: 11 }} tickFormatter={(v) => `${v}%`} width={44} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#0D1321", border: "1px solid #ffffff22", borderRadius: 12, fontSize: 12 }} formatter={(v) => [`${v}%`, "P(crash ≥ target)"]} labelFormatter={(l) => `Target ${l}x`} />
              <Area type="monotone" dataKey="prob" stroke="#34F5C5" fill="#34F5C533" strokeWidth={2.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {curve.map((c) => (
            <span key={c.target} className="whitespace-nowrap rounded-full bg-white/5 px-3 py-1.5 text-xs"><b>≥{c.target}x</b> <span className="text-mint">{c.prob}%</span></span>
          ))}
        </div>
        <div className="mt-3 h-20">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark}>
              <Area type="monotone" dataKey="crash" stroke="#FFC531" fill="#FFC53133" strokeWidth={1.5} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <p className="text-center text-[10px] uppercase tracking-widest text-white/35">last {spark.length} crashes</p>
      </section>

      {/* RESULT LOG */}
      <section className="glass mt-3 rounded-3xl p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-black">🧾 Confirmed crashes</h2>
          <span className="text-[11px] text-white/40">{history.length}/200</span>
        </div>
        {err && <p className="mt-2 text-xs text-red-300">{err}</p>}
        <div className="mt-3 space-y-1.5">
          {[...history].reverse().slice(0, 30).map((h, i) => {
            const v = Number(h.crashPoint);
            const col = v < 2 ? "text-red-300 bg-red-500/10" : v < 5 ? "text-gold bg-gold/10" : "text-mint bg-mint/10";
            return (
              <div key={`${h.at}-${i}`} className="flex items-center justify-between rounded-xl bg-black/30 px-3 py-2 text-sm">
                <span className={`rounded-lg px-2.5 py-0.5 font-black ${col}`}>{v.toFixed(2)}x</span>
                <span className="font-mono text-[11px] text-white/40">{h.roundId || ""} · {h.at ? new Date(h.at).toLocaleTimeString() : ""}</span>
              </div>
            );
          })}
          {!history.length && <p className="rounded-xl bg-black/30 p-4 text-center text-xs text-white/40">No confirmed crashes yet — feed starts when the extension reports a <code>game_result</code>.</p>}
        </div>
      </section>

      <p className="mt-6 text-center text-[11px] text-white/30">Analytics only — Spribe outcomes are certified RNG. No pattern implies future results.</p>
    </main>
  );
}

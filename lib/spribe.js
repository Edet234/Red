// Shared Spribe analytics: House Bias + probability model.
// Usable from both Node middleware and the Next.js client.

export const MAX_HISTORY = 200;

export function isValidOperatorCode(code) {
  return typeof code === "string" && /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code.trim().toUpperCase());
}

export function generateOperatorCode() {
  const seg = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s = "";
    for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  };
  return `${seg()}-${seg()}-${seg()}`;
}

export function analyzePatterns(history) {
  const pts = (history || []).map((h) => Number(h.crashPoint ?? h)).filter((n) => Number.isFinite(n) && n >= 1);
  const n = pts.length;
  if (n === 0) {
    return {
      count: 0,
      sub2Streak: 0,
      sub2Rate: 0,
      avg: 0,
      median: 0,
      max: 0,
      volatility: "unknown",
      biasLabel: "Waiting for data",
      message: "Connect your extension to start feeding rounds.",
      distribution: [],
    };
  }
  let sub2Streak = 0;
  for (let i = pts.length - 1; i >= 0; i--) {
    if (pts[i] < 2) sub2Streak++;
    else break;
  }
  const sub2 = pts.filter((x) => x < 2).length;
  const sub2Rate = sub2 / n;
  const avg = pts.reduce((a, b) => a + b, 0) / n;
  const sorted = [...pts].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const max = Math.max(...pts);
  const variance = pts.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / n;
  const std = Math.sqrt(variance);

  let volatility = "stable";
  if (std > 6 || max > 20) volatility = "high";
  else if (std > 3 || max > 10) volatility = "elevated";

  let biasLabel = "Neutral";
  let message = `House is neutral over last ${n} rounds (avg ${avg.toFixed(2)}x).`;
  if (sub2Streak >= 4) {
    biasLabel = "High volatility expected";
    message = `Server produced ${sub2Streak} sub-2.00x results in a row. High volatility expected — a correction multiplier (>5x) is statistically overdue, but never guaranteed.`;
  } else if (sub2Streak >= 3) {
    biasLabel = "Pressure building";
    message = `${sub2Streak} sub-2.00x in a row. Pressure building — watch for a breakout round.`;
  } else if (sub2Rate > 0.65) {
    biasLabel = "House bias: LOW";
    message = `${Math.round(sub2Rate * 100)}% of last ${n} rounds died under 2x. House bias is LOW — play tight.`;
  } else if (avg > 3.2) {
    biasLabel = "House bias: GENEROUS";
    message = `Avg ${avg.toFixed(2)}x over last ${n}. Table is generous — consider riding slightly longer.`;
  }

  const buckets = [
    { label: "<2x", min: 1, max: 2 },
    { label: "2–5x", min: 2, max: 5 },
    { label: "5–10x", min: 5, max: 10 },
    { label: "10x+", min: 10, max: Infinity },
  ].map((b) => {
    const c = pts.filter((x) => x >= b.min && (b.max === Infinity ? true : x < b.max)).length;
    return { ...b, count: c, pct: n ? Math.round((c / n) * 1000) / 10 : 0 };
  });

  return { count: n, sub2Streak, sub2Rate, avg, median, max, volatility, biasLabel, message, distribution: buckets, std };
}

// Survival model P(crash >= target) estimated empirically + smoothed.
export function probabilityCurve(history, targets = [1.5, 2, 3, 5, 10, 20]) {
  const pts = (history || []).map((h) => Number(h.crashPoint ?? h)).filter((n) => Number.isFinite(n) && n >= 1);
  if (pts.length === 0) return targets.map((t) => ({ target: t, prob: 0 }));
  return targets.map((t) => {
    const hit = pts.filter((x) => x >= t).length;
    return { target: t, prob: Math.round((hit / pts.length) * 1000) / 10 };
  });
}

export function normalizeIngest(body) {
  const operatorCode = String(body?.operatorCode || "").trim().toUpperCase();
  const type = String(body?.type || "").toLowerCase();
  const out = { operatorCode, type, at: Date.now() };
  if (body?.multiplier !== undefined) {
    const m = Number(body.multiplier);
    if (Number.isFinite(m) && m >= 1 && m < 1000) out.multiplier = Math.round(m * 100) / 100;
  }
  if (body?.crashPoint !== undefined) {
    const c = Number(body.crashPoint);
    if (Number.isFinite(c) && c >= 1 && c < 1000) out.crashPoint = Math.round(c * 100) / 100;
  }
  if (body?.sessionToken) out.hasSession = true;
  if (body?.wsUrl) out.wsHost = String(body.wsUrl).slice(0, 120);
  if (body?.roundId !== undefined) out.roundId = String(body.roundId).slice(0, 64);
  return out;
}

# Spribe-OS — Setup Guide

## 1. Run the portal (Hub + Brain + Bridge)

```bash
npm install
npm run build
npm start          # http://localhost:3000  (dev: npm run dev)
```

| Route | Purpose |
|---|---|
| `/` | Landing + **Download Center** (`Download spribe-sensor.zip`) |
| `/dashboard` | **Brain** — protected by Operator Code, live ticker + Crystal Ball + crash log |
| `POST /api/ingest` | **Bridge ingestion** — the extension pushes here |
| `GET /api/history?operatorCode=XXXX-XXXX-XXXX` | Last-200 bootstrap |
| `GET /api/operator/generate` | Issue a new Operator Code |

The Bridge keeps a rolling **last-200** confirmed crashes per Operator Code
(in memory + `server/data/history-<CODE>.json`) and broadcasts over Socket.io
rooms `operator:<CODE>` events `tick`, `crash`, `stats`, `credentials`, `hello`.

## 2. Get your Operator Code

1. Open `/` → **Operator Code** card → **Generate**.
2. It is saved to `localStorage` (`spribe-operator`) on that device.
3. Use the **same** code in the extension popup and in `/dashboard`.

## 3. Install the Sensor extension (Android Kiwi / Via + desktop Chrome)

1. Download `spribe-sensor.zip` from the landing page (`/downloads/spribe-sensor.zip`)
   or build it yourself: `npm run zip:extension` → `public/downloads/spribe-sensor.zip`.
2. Unzip it somewhere permanent.
3. **Kiwi Browser (Android):** `⋮ → Extensions → + (from .zip)` → pick the zip
   → enable **Spribe Sensor**. (Alternatively Developer Mode → Load unpacked → the unzipped folder.)
4. **Desktop Chrome:** `chrome://extensions` → Developer mode → Load unpacked → folder.
5. Click the Sensor icon → paste **Operator Code** + **Bridge URL**
   (local test: `http://<your-PC-LAN-IP>:3000`; production: your `https://…` domain) → **Link sensor** → **Test connection**.
6. Open the Aviator game tab (1Win / Bangbet / Stake) and keep it active.
   The sensor patches `WebSocket` before the game connects, sniffs
   `sessionToken`, `operator`, and the dynamic `wss://…spribegaming…?userid=…&gameZone=…`,
   parses `current_multiplier` ticks + final `game_result` crash points,
   and `POST`s them to `/api/ingest`. Refresh-safe: any token/URL change is auto re-pushed.

## 4. Verify the Data Loop

1. Extension popup → **Test connection** → "Bridge reachable ✓".
2. Keep the game tab open; open `/dashboard` on your phone → status flips to **LIVE**.
3. The big ticker climbs every ~100 ms; when the round ends a row appears in **Confirmed crashes** and the Crystal Ball + probability chart update.

Manual check without the game site:

```bash
CODE=$(curl -s localhost:3000/api/operator/generate | python3 -c "import sys,json;print(json.load(sys.stdin)['operatorCode'])")
curl -X POST localhost:3000/api/ingest -H 'Content-Type: application/json' \
  -d "{\"operatorCode\":\"$CODE\",\"type\":\"tick\",\"multiplier\":3.42}"
curl -X POST localhost:3000/api/ingest -H 'Content-Type: application/json' \
  -d "{\"operatorCode\":\"$CODE\",\"type\":\"crash\",\"crashPoint\":2.13}"
curl "localhost:3000/api/history?operatorCode=$CODE"
```

## 5. Production notes

- Put the Bridge behind HTTPS; set the exact `bridgeUrl` in the popup (mixed-content blocks `http` from `https` game pages — use `https`).
- One Operator Code = one isolated room/history. Never share yours.
- Analytics are descriptive (empirical survival rates over last N). Spribe outcomes are certified RNG — nothing here predicts or influences results. Play responsibly.

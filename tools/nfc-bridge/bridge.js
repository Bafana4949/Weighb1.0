#!/usr/bin/env node
/*
 * Weighbridge NFC bridge
 * ----------------------
 * Reads card UIDs from the Camelote "NFC-X / NFC ultra" handheld NFC tool
 * (USB composite device VID_0483 / PID_4343, HID interface MI_01) and serves
 * them to the weighbridge web app over a localhost-only HTTP endpoint.
 *
 * The device speaks a vendor HID framing that was reverse-engineered from the
 * vendor tool (Cyb_Nfctool). It is a request/response protocol over 64-byte
 * HID reports:
 *
 *   Frame:  55 | cmdHi cmdLo | lenHi lenLo | payload[len] | ckHi ckLo
 *     - leading 0x55 start byte
 *     - command (big-endian 16-bit), echoed back in the response
 *     - payload length (big-endian 16-bit)
 *     - 2-byte checksum: X = XOR(payload bytes); ckHi = (~X)&0xff, ckLo = X
 *   Written to the device as an HID output report with a leading 0x00 report-id
 *   byte, split into <=64 byte chunks; responses are report-aligned.
 *
 * Only READ / card-detect commands are ever sent (HF NTAG read 0x83, LF scan
 * 0x72). The bridge never sends write / format / firmware commands.
 *
 * Usage:
 *   node bridge.js serve   # run the HTTP bridge (default)
 *   node bridge.js probe   # interactive: dump raw frames as you tap a card
 *   node bridge.js once    # read one UID and print it
 */

"use strict";

const http = require("http");
let HID;
try {
  HID = require("node-hid");
} catch (e) {
  console.error("[nfc-bridge] node-hid is not installed. Run `npm install` in tools/nfc-bridge first.");
  process.exit(1);
}

// ---- config -------------------------------------------------------------
const VID = 0x0483;
const PID = 0x4343;
const HOST = "127.0.0.1"; // bound to loopback only
const PORT = Number(process.env.NFC_BRIDGE_PORT || 7777);

// HF card search (ISO14443A REQA + anticollision + SELECT). Request is cmd
// 0x69 with a single 0x01 byte; the reply carries the UID/ATQA/SAK. Confirmed
// by capturing the vendor tool reading a Mifare Classic 1K (UID 34981DEB,
// SAK 08, ATQA 0400). Works for any 14443A card: 4-byte (Mifare Classic),
// 7-byte (NTAG / Ultralight / DESFire), etc.
//
// Reply payload layout (card present):
//   [0]      0x01            status: card found
//   [1]      flags
//   [2..11]  UID (10-byte field, left-aligned)
//   [12]     UID length (4 / 7 / 10)
//   [13..14] ATQA (big-endian)
//   [15]     SAK
const CMD_HF_SELECT = 0x69;
const HF_SELECT_PAYLOAD = [0x01];

// ---- protocol -----------------------------------------------------------
function buildFrame(cmd, payload) {
  payload = payload || [];
  let x = 0;
  for (const b of payload) x ^= b;
  return [
    0x55,
    (cmd >> 8) & 0xff,
    cmd & 0xff,
    (payload.length >> 8) & 0xff,
    payload.length & 0xff,
    ...payload,
    (~x) & 0xff,
    x & 0xff,
  ];
}

/**
 * Extract the first complete, checksum-valid frame starting at the first 0x55
 * in `buf`. Returns { cmd, payload, raw } or null if not enough bytes yet.
 */
function parseFrame(buf) {
  let i = 0;
  while (i < buf.length && buf[i] !== 0x55) i++;
  if (i + 5 > buf.length) return null;
  const cmd = (buf[i + 1] << 8) | buf[i + 2];
  const len = (buf[i + 3] << 8) | buf[i + 4];
  const total = 5 + len + 2;
  if (i + total > buf.length) return null;
  const payload = buf.slice(i + 5, i + 5 + len);
  let x = 0;
  for (const b of payload) x ^= b;
  const ckHi = buf[i + 5 + len];
  const ckLo = buf[i + 5 + len + 1];
  const ok = ckHi === ((~x) & 0xff) && ckLo === (x & 0xff);
  return { cmd, payload, raw: buf.slice(i, i + total), checksumOk: ok, consumed: i + total };
}

class Device {
  constructor() {
    this.hid = null;
    this.rx = []; // array of Buffers from HID 'data'
  }

  info() {
    return HID.devices().find((d) => d.vendorId === VID && d.productId === PID) || null;
  }

  open() {
    if (this.hid) return;
    const d = this.info();
    if (!d) {
      const err = new Error("NFC device not found (VID_0483/PID_4343 not plugged in)");
      err.code = "NO_DEVICE";
      throw err;
    }
    this.hid = new HID.HID(d.path);
    this.hid.on("data", (b) => this.rx.push(Buffer.from(b)));
    this.hid.on("error", () => this.close());
  }

  close() {
    if (this.hid) {
      try { this.hid.close(); } catch (_) {}
      this.hid = null;
    }
    this.rx = [];
  }

  /** Send a command and wait for the response frame that echoes `cmd`. */
  transceive(cmd, payload, timeoutMs) {
    this.open();
    this.rx = [];
    const frame = buildFrame(cmd, payload);
    // write in <=64 byte chunks, each as its own report (0x00 report id prefix)
    for (let off = 0; off < frame.length; off += 64) {
      this.hid.write([0x00, ...frame.slice(off, off + 64)]);
    }
    const deadline = Date.now() + (timeoutMs || 800);
    return new Promise((resolve) => {
      const tick = () => {
        // reassemble everything received so far and look for our frame
        if (this.rx.length) {
          const all = Buffer.concat(this.rx);
          let scan = all;
          while (scan.length >= 7) {
            const f = parseFrame(scan);
            if (!f) break;
            if (f.cmd === cmd && f.checksumOk) return resolve(f);
            scan = scan.slice(f.consumed);
          }
        }
        if (Date.now() > deadline) return resolve(null);
        setTimeout(tick, 15);
      };
      tick();
    });
  }
}

// ---- UID extraction -----------------------------------------------------
function normalizeUid(bytes) {
  return Buffer.from(bytes)
    .toString("hex")
    .toUpperCase()
    .replace(/[^0-9A-F]/g, "");
}

/**
 * Parse the HF select reply. Returns { uid, kind, atqa, sak, raw } when a card
 * is present, or null otherwise. UID is read as a fixed 10-byte field at
 * offset 2, trimmed to the length reported at offset 12.
 */
function parseSelect(frame) {
  if (!frame) return null;
  const p = frame.payload;
  if (p.length < 16 || p[0] !== 0x01) return null; // no card / error
  const uidLen = p[12];
  if (uidLen !== 4 && uidLen !== 7 && uidLen !== 10) return null;
  const uid = p.slice(2, 2 + uidLen);
  // reject an all-zero UID (defensive)
  if (uid.every((b) => b === 0x00)) return null;
  return {
    uid: normalizeUid(uid),
    kind: "HF",
    atqa: ((p[13] << 8) | p[14]).toString(16).toUpperCase().padStart(4, "0"),
    sak: p[15].toString(16).toUpperCase().padStart(2, "0"),
    raw: frame.raw.toString("hex"),
  };
}

/** One poll cycle (a few quick attempts). Returns a card hit or null. */
async function pollOnce(dev) {
  for (let i = 0; i < 3; i++) {
    const hit = parseSelect(await dev.transceive(CMD_HF_SELECT, HF_SELECT_PAYLOAD, 400));
    if (hit) return hit;
  }
  return null;
}

// ---- HTTP server --------------------------------------------------------
function cors(res) {
  // Allow the local dev app (localhost:3010) to call the bridge.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  // Chrome Private Network Access: a page may only call a loopback address
  // (127.0.0.1) if the preflight is answered with this header.
  res.setHeader("Access-Control-Allow-Private-Network", "true");
}

function serve() {
  const dev = new Device();

  // Serialize device access: only one scan touches the HID device at a time,
  // so overlapping requests (e.g. repeated clicks) can't corrupt each other.
  let lock = Promise.resolve();
  function withDevice(fn) {
    const run = lock.then(fn, fn);
    lock = run.then(() => {}, () => {});
    return run;
  }

  const server = http.createServer(async (req, res) => {
    cors(res);
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    console.log(`[nfc-bridge] ${req.method} ${url.pathname}`);

    if (url.pathname === "/health") {
      const d = dev.info();
      res.writeHead(d ? 200 : 503, { "content-type": "application/json" });
      return res.end(JSON.stringify({ ok: !!d, device: d ? { manufacturer: d.manufacturer, product: d.product, serialNumber: d.serialNumber } : null }));
    }

    if (url.pathname === "/raw") {
      // Diagnostic: dump the raw HF select reply regardless of detection.
      try {
        const out = await withDevice(async () => {
          const hf = await dev.transceive(CMD_HF_SELECT, HF_SELECT_PAYLOAD, 600);
          return {
            hf: hf ? { cmd: hf.cmd.toString(16), payload: hf.payload.toString("hex") } : null,
          };
        });
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify(out));
      } catch (e) {
        dev.close();
        res.writeHead(e.code === "NO_DEVICE" ? 503 : 500, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: e.message }));
      }
    }

    if (url.pathname === "/uid") {
      // Short, non-blocking: run ONE scan cycle and answer immediately. The
      // web client polls this repeatedly while the operator taps a card, so no
      // single request stays open long.
      const debug = url.searchParams.get("debug") === "1";
      try {
        const hit = await withDevice(() => pollOnce(dev));
        if (hit) {
          console.log(`[nfc-bridge] read ${hit.kind} UID=${hit.uid}  raw=${hit.raw}`);
          res.writeHead(200, { "content-type": "application/json" });
          return res.end(JSON.stringify(debug ? hit : { uid: hit.uid, kind: hit.kind }));
        }
        res.writeHead(408, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: "No card detected. Tap a card on the reader and try again." }));
      } catch (e) {
        dev.close();
        const code = e.code === "NO_DEVICE" ? 503 : 500;
        res.writeHead(code, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: e.message }));
      }
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found", endpoints: ["/health", "/uid"] }));
  });

  server.listen(PORT, HOST, () => {
    console.log(`[nfc-bridge] listening on http://${HOST}:${PORT}`);
    console.log(`[nfc-bridge] endpoints: GET /health, GET /uid?timeout=15000`);
    const d = dev.info();
    console.log(d ? `[nfc-bridge] device: ${d.manufacturer} ${d.product} (serial ${d.serialNumber})` : "[nfc-bridge] WARNING: NFC device not detected yet — plug it in.");
  });
}

// ---- probe / once (CLI diagnostics) ------------------------------------
async function probe() {
  const dev = new Device();
  try { dev.open(); } catch (e) { console.error("[probe]", e.message); process.exit(1); }
  console.log("[probe] Tap a card on the reader. Showing the HF select reply (cmd 0x69). Ctrl+C to stop.\n");
  for (;;) {
    const hf = await dev.transceive(CMD_HF_SELECT, HF_SELECT_PAYLOAD, 500);
    const hfP = hf ? hf.payload.toString("hex") : "(no reply)";
    const hit = parseSelect(hf);
    console.log(
      `reply: ${hfP}\n` +
      (hit ? `>>> UID = ${hit.uid}  ATQA=${hit.atqa} SAK=${hit.sak}\n` : "    (no card)\n")
    );
    await new Promise((r) => setTimeout(r, 700));
  }
}

async function once() {
  const dev = new Device();
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const hit = await pollOnce(dev);
    if (hit) { console.log(JSON.stringify(hit)); process.exit(0); }
  }
  console.error("No card detected within 20s.");
  process.exit(1);
}

const mode = (process.argv[2] || "serve").toLowerCase();
if (mode === "serve") serve();
else if (mode === "probe") probe();
else if (mode === "once") once();
else { console.error(`unknown mode "${mode}". Use: serve | probe | once`); process.exit(1); }

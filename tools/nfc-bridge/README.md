# Weighbridge NFC bridge

A tiny localhost service that reads card UIDs from the **Camelote "NFC-X / NFC
ultra"** USB reader (`VID_0483` / `PID_4343`) and serves them to the weighbridge
web app, so you can tap a card to fill the **Tag UID** / **RFID tag** fields
instead of typing them.

The reader is **not** a keyboard-wedge device — it speaks a vendor HID framing,
so a small bridge is needed. See [`../../docs/NFC_SCANNER_SETUP.md`](../../docs/NFC_SCANNER_SETUP.md)
for the full setup, protocol notes, and troubleshooting.

## Run

```bash
# from the repo root, once:
npm run nfc-bridge:setup     # installs node-hid in tools/nfc-bridge

# then, whenever you want to scan cards:
npm run nfc-bridge           # serves http://127.0.0.1:7777
```

## Endpoints (bound to 127.0.0.1 only)

| Method | Path       | Description |
| ------ | ---------- | ----------- |
| GET    | `/health`  | `{ ok, device }` — is the reader connected? |
| GET    | `/uid` | one quick scan; returns `{ uid, kind }` on a card, `408` if none, `503` if the reader is unplugged. Add `?debug=1` for the raw frame. The web app polls this. |
| GET    | `/raw` | the raw HF select reply, for diagnostics. |

## Diagnostics

```bash
npm run nfc-bridge:probe     # prints the select reply + decoded UID/ATQA/SAK as you tap a card
node bridge.js once          # read a single UID and print it as JSON
```

## Safety

The bridge only ever sends the **read-only HF card-select** command
(ISO14443A, cmd `0x69`). It never sends write / format / firmware commands.
Only 13.56 MHz HF cards are read today; 125 kHz LF is not decoded yet.

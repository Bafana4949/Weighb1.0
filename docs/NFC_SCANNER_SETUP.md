# NFC scanner setup — tap a card to fill the UID

This describes how to read RFID/NFC card UIDs with the USB NFC reader and have
them auto-fill the **Tag UID** field (Issue New RFID, Super Admin) and the
driver **RFID tag** fields, instead of typing them by hand.

## How it works

The reader is a Camelote **"NFC-X / NFC ultra"** handheld tool — a USB composite
device (`VID_0483` / `PID_4343`, serial `BEGIN-2025`). Its HID interface does
**not** act as a keyboard, so the app can't read it directly from the browser.
A small local bridge (`tools/nfc-bridge`) talks to the device over USB HID and
exposes the UID on `http://127.0.0.1:7777`. The "Scan card" buttons in the app
call that bridge.

```
 NFC card ──tap──► USB reader ──HID──► nfc-bridge (127.0.0.1:7777)
                                           ▲ HTTP (server-side only)
 web app field ◄── /api/nfc/uid (app server proxy) ◄── browser "Scan card"
```

The browser never calls `127.0.0.1` directly (Chrome blocks pages from reaching
loopback addresses); it calls the same-origin `/api/nfc/uid` route, and the app
server forwards to the bridge.

## One-time setup

1. Install Node.js 20+ (already required by this repo).
2. Plug in the reader. Install the deps for the bridge:

   ```bash
   npm run nfc-bridge:setup
   ```

## Every time you want to scan

1. Start the app as usual:

   ```bash
   docker compose up -d postgres mosquitto
   npm run dev:web            # http://localhost:3010
   ```

2. In a second terminal, start the bridge:

   ```bash
   npm run nfc-bridge
   ```

   You should see:

   ```
   [nfc-bridge] listening on http://127.0.0.1:7777
   [nfc-bridge] device: CYBDZKJ-BSJ TCC-TSY-TBY (serial BEGIN-2025)
   ```

3. In the app:
   - **Issue New RFID** (`/admin/hardware/rfid`, Super Admin): open the dialog,
     click **Scan card** next to *Tag UID*, tap the card, then **Issue RFID**.
   - **Drivers** (`/admin/fleet`): in the New / Edit driver dialog, click
     **Scan card** next to *RFID tag*.

   The field fills with the UID as **uppercase hex, no separators**. You can
   still type a UID in manually at any time.

## UID format

The scan returns the card UID exactly as the vendor tool shows it: **uppercase
hex, most-significant byte first, no separators**.

- **Mifare Classic (4-byte UID):** 8 hex chars, e.g. `34981DEB`.
- **NTAG / Ultralight / DESFire (7-byte UID):** 14 hex chars.

Store this value in the RFID table's `uid` (or driver `rfidTag`) field as-is.

## Check a card (optional diagnostic)

To see the raw reply and the decoded UID/ATQA/SAK for a card:

```bash
npm run nfc-bridge:probe
```

Each tap prints the HF select reply and `>>> UID = … ATQA=… SAK=…`, which should
match what `Cyb_Nfctool` displays.

## Prove tags end-to-end (gate demo)

With the bridge running, this live "gate" demo lets you tap cards and watch each
one resolve to its driver/truck and the order it's booked on:

```bash
npm run gate          # = node scripts/verify-tag.mjs --watch
```

Tap a card → it prints whether the tag is **registered**, who/what it maps to,
and its current **live booking** (order, truck, driver). An unissued card prints
`NOT REGISTERED`. Press `Ctrl+C` to stop.

Verify specific UID(s) once instead of watching:

```bash
npm run verify-tag -- 34981DEB 5701A941
```

When a driver tag and a truck tag are both booked on the same order it ends with
`✅ PROVEN: both tags resolve to the SAME live booking …`.

## Troubleshooting

| Symptom | Fix |
| ------- | --- |
| Button says *"Can't reach the card-scanner bridge"* | The bridge isn't running — `npm run nfc-bridge`. |
| *"NFC reader not detected"* | Reader unplugged, or the vendor `Cyb_Nfctool` is holding it. Close that tool and retry. |
| *"No card detected"* | Hold the card flat on the reader and click **Scan card** again. Currently only 13.56 MHz (HF) cards are read; see below. |

> **Frequency:** the bridge reads **13.56 MHz HF** cards (Mifare Classic, NTAG,
> Ultralight, DESFire, …) via the ISO14443A select. 125 kHz **LF** cards
> (EM4100 / HID Prox / T5577) are not decoded yet — those still need manual
> entry, or a follow-up to add the LF read command.

## Protocol notes (for maintainers)

Reverse-engineered from the vendor tool and verified live (a Mifare Classic 1K
read as UID `34981DEB`, SAK `08`, ATQA `0400`, matching `Cyb_Nfctool`).

- **Transport:** USB HID, interface `MI_01`. 64-byte reports; writes carry a
  leading `0x00` report-id byte and are split into ≤64-byte chunks. Request/
  response (no unsolicited pushes at idle).
- **Frame:** `55 | cmdHi cmdLo | lenHi lenLo | payload[len] | ckHi ckLo`
  - command is a big-endian 16-bit code, echoed in the response
  - length is big-endian 16-bit
  - checksum: `X = XOR(payload)`, `ckHi = (~X) & 0xff`, `ckLo = X`
- **Card read (read-only):** HF ISO14443A select — request cmd `0x69` with a
  single `0x01` payload byte. Reply payload: `[0]=0x01 (card found)`,
  `[2..11]=UID field`, `[12]=UID length (4/7/10)`, `[13..14]=ATQA`, `[15]=SAK`.
  The bridge never sends write/format/firmware commands.
- **Discovery method:** the exe is packed (Enigma Virtual Box), so process
  hooking (frida) was blocked. Instead the command was captured passively —
  Windows delivers HID input reports to every open handle, so opening the device
  read-only while the vendor tool read the card captured the reply frame
  (`55 00 69 00 13 01 01 34 98 1D EB … 04 00 08 …`), which identified cmd `0x69`.
- The reader also exposes a USB Mass Storage interface (a drive with only a
  `cyb_nfctool.url` shortcut) and a Mifare-cloning toolset in the vendor app —
  neither is used or touched here.

## Security

- The bridge listens on `127.0.0.1` only (not reachable from the network).
- It performs card reads only; it issues no write/format/firmware commands.
- Issuing RFIDs still requires Super Admin, and UID validation (min length 4)
  is unchanged. The scanner only fills the field; nothing else in the flow
  changes.

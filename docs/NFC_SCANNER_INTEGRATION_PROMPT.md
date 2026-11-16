# Prompt for Claude: NFC scanner -> UID -> assign to driver/truck

Copy everything below the line into Claude (with this repo open).

---

I have a Next.js weighbridge system (this repo: `apps/web`, Prisma + Postgres,
NextAuth). I need to read RFID/NFC card UIDs from a USB NFC device plugged into
my Windows laptop and assign them to drivers and trucks in the app.

## Goal
1. Tap a card on the scanner.
2. The card's UID appears automatically in the **Tag UID** field of the
   "Issue New RFID" dialog (`apps/web/src/components/rfid-management.tsx`,
   input `id="uid"`).
3. I click "Issue RFID" to assign it to a driver or vehicle (existing flow:
   `POST /api/admin/rfid`, page `/admin/hardware/rfid`, Super Admin only).
4. Also allow the UID field on the driver form
   (`apps/web/src/components/fleet-management.tsx`, inputs `d-rfid`/`ed-rfid`)
   to be filled by the scanner if possible.

## What is already known (do not re-investigate)
- App runs at http://localhost:3010 (`npm run dev:web`), local Docker Postgres
  on 127.0.0.1:15432 (`docker compose up -d postgres mosquitto`).
- The Tag UID input is a plain text input. The app has NO scanner code.
- The scanner does NOT act as a keyboard: tapping a card types nothing in
  Notepad, so a "keyboard wedge" approach will not work.
- Device is a Camelote "NFC-X / NFC ultra" handheld NFC tool, managed with
  Windows software `Cyb_Nfctool_V2.60` (nfctools.exe, from
  https://www.camelote.cn/nfctools/). Do NOT flash firmware.
- Windows sees it as USB composite device `VID_0483&PID_4343`, serial
  `BEGIN-2025`, with two interfaces: USB Mass Storage (shows a drive
  containing only a `cyb_nfctool.url` shortcut) and an HID "USB Input Device"
  (`MI_01`). The vendor tool shows "Connected" when it is plugged in.
- The vendor tool has HF Card tabs: M1, NTAG, Simulate, Sniffing, APDU, plus
  an LF Card section. It can read card UIDs.
- Not a PC/SC smart-card reader (no smart-card device in Device Manager).

## What I need from you
1. Work out the device's USB HID command protocol. Start with the vendor
   product manuals ("NFC-X Product Manual.docx", "NFC ultra Product
   Manual.docx" on the page above); I can attach them. If no protocol is
   documented, capture/inspect the HID traffic the vendor tool sends when it
   reads a card (e.g. enumerate the HID report descriptor, then test read
   commands with `node-hid` or Python `hidapi`), and tell me before sending
   any write/format/firmware-style command.
2. Build a small local bridge (Node or Python) that reads the UID from the
   device and exposes it to the web app, e.g. a localhost WebSocket/SSE or
   `GET http://127.0.0.1:<port>/uid`, bound to 127.0.0.1 only.
3. Add a "Scan card" button/listener to the Tag UID field that fills it from
   the bridge, with clear errors when the bridge or device is not running.
4. Keep existing validation (UID min length 4) and permissions unchanged.
   Normalise the UID (uppercase hex, no separators) consistently with how
   the API stores/looks it up.
5. Give me exact steps to run and test it, and add a short section to
   `docs/` describing the setup.

## Fallback if the protocol cannot be found
Tell me honestly and propose: (a) manual copy/paste of the UID from the vendor
tool, or (b) buying a USB keyboard-wedge reader of the right frequency
(13.56 MHz or 125 kHz).

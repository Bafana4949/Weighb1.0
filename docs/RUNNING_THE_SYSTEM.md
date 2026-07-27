# Running the Weighbridge System — PowerShell Command Reference

All commands below are meant to be pasted directly into PowerShell from the
repo root:
`c:\Users\Bafana Bhuda\Downloads\weighbridge-system-production-prototype\weighbridge-system`

---

## 1. Start the whole system

```powershell
docker compose --profile cloud --profile edge up -d --build
```

This builds (if needed) and starts every service in one shot:

| Service | What it is | Port |
|---|---|---|
| `postgres` | Cloud database | 5432 |
| `mosquitto` | MQTT broker (edge ↔ cloud messaging) | 1883 |
| `web` | Next.js cloud app (the website) | 3000 |
| `site-daemon` | Python edge daemon (weighbridge state machine) | 8000 |
| `hardware-simulator` | Fake scale/gate/RFID hardware | 7001 (telemetry), 7002 (control) |

Open the app at **http://localhost:3000**.

> **This machine specifically:** other unrelated containers on this box already
> occupy host ports 3000 and 8000, so the currently-running instance is
> published on **http://localhost:3010** (web) and **8010** (site-daemon)
> instead. Run `docker ps` and check the `PORTS` column if you're ever unsure
> which host port an already-running container landed on — the container's
> internal port (right side of the `->`) is always the one listed above.

### Check everything is healthy

```powershell
docker compose ps
docker compose logs -f web            # Ctrl+C to stop following
docker compose logs -f site-daemon
```

### Stop everything (keeps your data)

```powershell
docker compose down
```

### Stop and wipe all data (careful — deletes the database)

```powershell
docker compose down -v
```

---

## 2. Login credentials (seeded demo users)

Password for all of them: **`Password123!`**

| Email | Role |
|---|---|
| `admin@weighbridge.local` | Admin |
| `operator@weighbridge.local` | Operator |
| `security@weighbridge.local` | Security |
| `transporter@weighbridge.local` | Transporter |

---

## 3. Drive the hardware simulator — automated scenarios

The simulator's control port (7002) is published to your host, so you can
drive it straight from Windows using plain Python (no Docker exec needed).
`scenarios.py` only uses the Python standard library, so this works with the
Python already on your machine.

Run one scenario at a time from the repo root:

```powershell
cd apps\hardware-simulator

python scenarios.py normal              # auto-picks a real truck from the live arrival queue
python scenarios.py normal --plate "CD 456 EF MP"  # or force a specific plate
python scenarios.py unauthorised        # unknown RFID tag tries to enter
python scenarios.py overload            # truck comes in over the legal max GVW
python scenarios.py unstable            # scale reading never settles (65s timeout scenario)
python scenarios.py driver-mismatch     # RFID tag doesn't match the booking's driver
python scenarios.py offline-sync        # stop the `web` container first, then run this —
                                         # it queues 5 weighments locally and proves the
                                         # daemon syncs them once the cloud is back
```

Watch it happen live on the **Live Weighbridge** operator dashboard while a
scenario runs — the scale gauge, gate lights, and arrival queue update in
real time.

---

## 4. Drive the hardware simulator — manual, one command at a time

Paste this function into your PowerShell session once (per session):

```powershell
function Send-SimCommand {
    param([hashtable]$Command)
    $json = $Command | ConvertTo-Json -Compress
    $client = New-Object System.Net.Sockets.TcpClient("127.0.0.1", 7002)
    $stream = $client.GetStream()
    $writer = New-Object System.IO.StreamWriter($stream)
    $writer.NewLine = "`n"
    $writer.AutoFlush = $true
    $writer.WriteLine($json)
    $reader = New-Object System.IO.StreamReader($stream)
    $reader.ReadLine()
    $client.Close()
}
```

Then send whatever you like:

```powershell
# Tap an RFID card on the reader
Send-SimCommand -Command @{ rfid = "DRV00421" }

# Break IR beam 1 (truck nose enters position) then beam 2 (truck fully on deck)
Send-SimCommand -Command @{ p1 = $true }
Send-SimCommand -Command @{ p2 = $true }

# Ramp the scale up to a settled weight
Send-SimCommand -Command @{ weight_kg = 54320; scale_status = "STABLE" }

# Make the reading jitter (simulates an unstable/uncalibrated scale)
Send-SimCommand -Command @{ scale_status = "UNSTABLE" }

# Truck pulls off — clear the beams
Send-SimCommand -Command @{ p1 = $false; p2 = $false }

# Reset everything back to empty/idle
Send-SimCommand -Command @{ weight_kg = 0; p1 = $false; p2 = $false; rfid = "00000000"; scale_status = "STABLE" }
```

Every call returns the simulator's full current state (weight, beams, RFID,
gate/light/buzzer outputs) so you can see the effect immediately.

---

## 5. Reference data (from the seed)

**Driver RFID tags** (org: Treadstone Logistics):

```
DRV00421   Sipho Mahlangu
DRV00422   Lerato Molefe
DRV00423   Musa Khumalo
DRV00424   Palesa Mokoena
DRV00425   Bongani Zulu
```

**Vehicle plates:**

```
AB 123 CD GP    CD 456 EF MP    EF 789 GH GP    GH 234 JK NW    JK 567 LM GP
LM 890 NP NC    NP 321 QR GP    QR 654 ST MP    ST 987 UV GP    UV 135 WX KZN
```

Use any tag/plate pair from these lists with an existing booking, or create a
new booking as the transporter user first.

---

## 6. Re-seed the database (reset all demo data)

```powershell
docker exec weighbridge-web-test sh -c 'echo "DATABASE_URL=$env:DATABASE_URL" > /workspace/.env'
docker exec -e NODE_ENV=development weighbridge-web-test npm run db:seed
docker exec weighbridge-web-test rm -f /workspace/.env
```

> **Important:** re-seeding deletes and recreates every booking, vehicle, and
> transaction with new IDs. The edge daemon keeps its own local ledger and
> will start rejecting syncs ("hash chain out of sequence") until it's reset
> to match. After re-seeding, also run:

```powershell
docker restart weighbridge-site-daemon-test
```

If you still see red "Cloud rejected sync item" alerts on the dashboard
after that restart, the daemon's local ledger needs a manual reset — ask for
help with this rather than editing the database directly, since it touches
the edge daemon's SQLite file.

# Weighbridge and Site Access Control Automation System

Production-oriented reference implementation for a mining weighbridge, ANPR access lane, offline edge controller, transporter portal, operator console, and enterprise administration platform.

The architecture follows **Centralised Cloud Enforcement with Edge Resiliency**:

- The cloud master owns identities, bookings, policy, audit records, reports, and the permanent transaction ledger.
- The site daemon caches active authorisations, evaluates local safety state, captures weight, and works without cloud connectivity.
- The microcontroller/simulator never approves a truck. It reports physical inputs and applies explicit gate/light/buzzer commands.
- Every completed transaction is stored locally first and protected by a SHA-256 hash chain before cloud reconciliation.

> This repository is an engineering prototype, not a certified legal-for-trade weighing instrument. Production deployment requires a registered professional engineer, accredited metrology verification, electrical safety review, site risk assessment, privacy/legal review, penetration testing, and operational acceptance testing.

## Repository map

```text
weighbridge-system/
├── apps/
│   ├── web/                    Next.js dashboard, portal, APIs, Socket.IO bridge
│   ├── site-daemon/            FastAPI edge daemon, ANPR, SQLite, MQTT, sync
│   ├── hardware-simulator/     tkinter virtual MCU and scripted scenarios
│   └── firmware-pic18/         PIC18F45K22 bare-metal XC8 firmware
├── packages/
│   ├── database/               Prisma PostgreSQL schema, migration, seed
│   ├── shared-types/           Cross-service TypeScript contracts
│   └── mqtt-topics/            MQTT topic definitions and QoS policy
├── mosquitto/                  Development MQTT broker configuration
├── docker-compose.yml
└── .env.example
```

## Which IDE to use

Use **Antigravity IDE** for the entire repository. Open the `weighbridge-system` root folder so Claude/Gemini can see all applications and shared packages together.

Use **Microchip MPLAB X IDE 6.20+** only for `apps/firmware-pic18`. Create a PIC18F45K22 standalone project, add `main.c`, select the XC8 compiler, then use MPLAB IPE/PICkit when physical hardware is available.

## Prerequisites

Install these on the laptop:

- Node.js 20 LTS or newer
- Python 3.11 or newer
- Docker Desktop with Docker Compose
- Git
- On Linux only, `python3-tk` for the simulator GUI

### Docker Desktop Setup (Windows)

If you encounter Docker connection errors, ensure Docker Desktop is correctly configured:

1. Install and open Docker Desktop.
2. Wait until Docker Desktop reports that the engine is running.
3. Use Linux containers.
4. Enable the WSL 2 backend if required in settings.
5. Verify the Docker daemon is accessible by running:
   ```powershell
   docker version
   docker info
   docker context ls
   ```
6. Ensure the active Docker context is appropriate for Docker Desktop.
7. Retry starting containers: `docker compose up -d postgres mosquitto`

The default simulator transport is TCP, so Windows does **not** require com0com. Real serial, com0com, and POSIX PTY modes remain supported.

## First-time setup

### 1. Open a terminal and configure environment

Open Windows PowerShell and navigate to the repository root:

```powershell
cd "C:\Users\Bafana Bhuda\Downloads\weighbridge-system-production-prototype\weighbridge-system"

Copy-Item .env.example .env
```

Open the `.env` file and generate secure random values for:
- `AUTH_SECRET`
- `SITE_DAEMON_API_KEY`
- `PASSWORD_PEPPER`
- `POSTGRES_PASSWORD`

**Important:** The `POSTGRES_PASSWORD` inside the `DATABASE_URL` connection string must be exactly the same as the standalone `POSTGRES_PASSWORD` value.

### 2. Install dependencies and run preflight checks

```powershell
npm install
npm run preflight
```

### 3. Start PostgreSQL and MQTT

```powershell
docker compose up -d postgres mosquitto
docker compose ps
```

To verify the database started successfully:
```powershell
docker compose logs postgres --tail 100
```

> **Note on database resets:** If PostgreSQL was previously initialized with a different password and there is no important data, the development volume can be reset with:
> ```powershell
> docker compose down -v
> docker compose up -d postgres mosquitto
> ```
> ⚠️ **WARNING:** `docker compose down -v` permanently deletes the local development database and all contained data.

Optional pgAdmin:

```bash
docker compose --profile admin-tools up -d pgadmin
```

pgAdmin is available at `http://localhost:5050` with the development credentials in `docker-compose.yml`.

### 4. Apply the database migration and seed demo records

Once `npm run preflight` reports that PostgreSQL is healthy, run:

```powershell
npm run db:generate
npm run db:migrate
npm run db:seed
```

Demo accounts all use `Password123!`:

| Role | Email |
|---|---|
| Administrator | `admin@weighbridge.local` |
| Operator | `operator@weighbridge.local` |
| Security | `security@weighbridge.local` |
| Transporter | `transporter@weighbridge.local` |

### 4. Create the Python environments

Hardware simulator:

```powershell
cd apps/hardware-simulator
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Site daemon in a second terminal:

```powershell
cd apps/site-daemon
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Linux/macOS activation is `source .venv/bin/activate`.

EasyOCR may download its free model on the first run. Once cached, ANPR works offline.

## Development startup

Use four terminals.

### Terminal 1 — infrastructure

```bash
docker compose up -d postgres mosquitto
```

### Terminal 2 — cloud application

```bash
npm run dev:web
```

Open `http://localhost:3000`.

### Terminal 3 — virtual hardware

```bash
cd apps/hardware-simulator
python simulator.py
```

The GUI opens and exposes:

- Virtual UART: `tcp://127.0.0.1:7001`
- Scenario control: `tcp://127.0.0.1:7002`

The simulator emits this frame every 100 ms:

```text
#WT:054320;P1:1;P2:1;RF:DRV00421;ST:STABLE$\r\n
```

### Terminal 4 — edge daemon

```bash
cd apps/site-daemon
python daemon.py
```

FastAPI documentation is available at `http://localhost:8000/docs`.

The default `config.yaml` connects to the simulator TCP endpoint. To use real hardware later:

```yaml
transport:
  mode: "serial"
serial:
  port: "COM11"       # Windows/com0com
  # port: "/dev/ttyUSB0"  # Linux/Raspberry Pi
  baud_rate: 115200
```

No state-machine or protocol code changes are required.

## One-command container mode

The web application, database, MQTT, edge daemon, and headless simulator can run in Docker:

```bash
docker compose --profile edge up --build
```

The desktop tkinter GUI is intentionally not containerised. The `edge` profile uses a headless simulator and the same TCP UART protocol.

## Run a complete normal weighment

1. Sign in as the transporter and confirm that `AB 123 CD GP` has an approved booking.
2. Sign in as operator in another browser profile.
3. Trigger manual ANPR check-in using the edge API, or let Beam 1 trigger the configured sample plate automatically:

```bash
curl -X POST http://localhost:8000/edge/check-in \
  -H "Content-Type: application/json" \
  -d '{"manual_plate":"AB 123 CD GP","image_path":"test_plates/sample_01.png"}'
```

PowerShell equivalent:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:8000/edge/check-in `
  -ContentType "application/json" `
  -Body '{"manual_plate":"AB 123 CD GP","image_path":"test_plates/sample_01.png"}'
```

4. In the simulator GUI, set RFID to `DRV00421`, block both beams, and move weight to approximately `52 000 kg`.
5. Keep the reading within 20 kg for three seconds.
6. The daemon captures the transaction, stores it in SQLite, publishes MQTT, reconciles it to PostgreSQL, generates a waybill, and commands the exit gate.

Automated scenario:

```bash
cd apps/hardware-simulator
python scenarios.py normal
```

Other scenarios:

```bash
python scenarios.py unauthorised
python scenarios.py overload
python scenarios.py unstable
python scenarios.py driver-mismatch
python scenarios.py offline-sync
```

## Operational state machine

```text
IDLE
  → VEHICLE_APPROACHING
  → POSITIONING
  → STABILISING
  → CAPTURED
  → PROCESSING
  → COMPLETE
```

Safety rules:

- Plate must match an active approved booking within the arrival window plus configured grace.
- RFID must match the booking driver.
- Both position beams must remain blocked for the configured hold duration.
- The full stability window must remain within the configured 20 kg range.
- Gross and net limits are recalculated in the cloud; edge values are not blindly trusted.
- Overload keeps the exit closed and produces a high-severity incident.
- Serial loss for 30 seconds enters manual mode and keeps lanes red.

## MQTT contract

Every payload is JSON with `message_id`, `site_id`, `timestamp_utc`, and `payload`.

| Topic | QoS |
|---|---:|
| `weighbridge/{site_id}/telemetry` | 0 |
| `weighbridge/{site_id}/state` | 0 |
| `weighbridge/{site_id}/transaction` | 1 |
| `weighbridge/{site_id}/alerts` | 1 |
| `weighbridge/{site_id}/hardware/status` | 0 |
| `weighbridge/{site_id}/gate/command` | 1 |
| `weighbridge/{site_id}/gate/status` | 1 |
| `weighbridge/{site_id}/queue` | 0 |
| `dashboard/{user_id}/notifications` | 1 |
| `sync/{site_id}/status` | 1 |

Topic builders are centralised in `packages/mqtt-topics/src/index.ts`.

## Offline resilience

`apps/site-daemon/database.py` uses SQLite WAL mode, full synchronous writes, a local transaction ledger, an idempotent sync queue, and hourly online backups.

Cloud retry sequence is 5, 10, 20, 40, then 60 seconds. The sync queue has no short retention limit and is designed to exceed the required 72-hour outage window, subject to disk capacity.

On startup the daemon:

- runs `PRAGMA integrity_check`;
- restores the newest known-good backup if corruption is detected;
- identifies incomplete sessions caused by power loss;
- emits an operator-review incident rather than silently completing a record.

## Hash-chain integrity

Each edge transaction includes:

- the previous transaction hash for the site;
- canonical transaction fields;
- a SHA-256 integrity hash;
- a unique edge transaction ID and waybill number.

The cloud API recalculates the hash, checks the previous hash, recalculates gross/tare/net/overload rules, and rejects duplicate IDs or hashes with HTTP 409.

## ANPR pipeline

`apps/site-daemon/anpr.py` implements:

1. Grayscale conversion
2. Bilateral filtering
3. Adaptive thresholding
4. Canny edge detection
5. Four-corner contour selection with a 2:1–5:1 aspect ratio
6. EasyOCR extraction
7. South African plate-format validation
8. Five-frame majority vote
9. Configurable 75% confidence threshold
10. Three retries before manual review

Development samples are under `apps/site-daemon/test_plates`.

## API surface

The web app implements all requested routes under `apps/web/src/app/api`, including:

- Auth, registration, self profile, and administrator role management
- Vehicle and driver registry
- Booking CRUD, approval, rejection, cancellation, and active edge lookup
- Transaction reconciliation, pagination, statistics, PDF/thermal waybill output
- Incident creation and resolution
- Fraud dashboard
- Site policy and hardware health
- Daily, tonnage, turnaround, and CSV reports

All JSON endpoints use:

```json
{
  "success": true,
  "data": {},
  "error": "only when unsuccessful",
  "meta": { "page": 1, "total": 100, "limit": 25 }
}
```

## Tests

Python edge tests:

```bash
cd apps/site-daemon
pytest
```

They cover serial parsing, corrupt/partial frames, state transitions, ANPR consensus, SQLite queue behavior, and hash chaining.

Web/domain tests:

```bash
npm --workspace @weighbridge/web test
```

They cover booking validation, role boundaries, duplicate reconciliation, integrity hashing, and report aggregation.

Production build validation:

```bash
npm run build
```

## Production deployment path

Cloud options:

- Next.js container on Railway, Azure Container Apps, AWS ECS, or Kubernetes
- PostgreSQL 16 on a managed service with point-in-time recovery
- Managed MQTT or a private Mosquitto/EMQX cluster with TLS and per-site client certificates
- Object storage for evidence images and calibration documents

Edge options:

- Raspberry Pi 4/5 or industrial x86 computer
- systemd-managed site daemon
- SQLite on industrial storage with UPS protection
- USB-isolated serial connection to the PIC controller
- Local MQTT bridge if site isolation requires store-and-forward

Real hardware:

- PIC18/dsPIC firmware built in MPLAB X/XC8
- Isolated ADC or certified weight indicator serial protocol rather than an unverified direct load-cell design
- Optocoupled relays, hardwired emergency stop, limit switches, watchdog, surge protection, and safe mechanical interlocks

## Security and compliance implementation notes

The code includes privacy and compliance foundations, but legal compliance cannot be achieved by source code alone.

- Driver ID numbers are encrypted with AES-256-GCM and separately hashed for uniqueness.
- Consent time is mandatory when a driver is registered.
- Audit records capture role changes, incident resolution, site policy changes, and hardware commands.
- Calibration certificates and expiry dates are first-class records.
- Data retention is configurable per site; add a scheduled retention worker after legal approval of deletion/archival rules.
- Production MQTT must disable anonymous access and use TLS/client credentials.
- Evidence URLs should use private object storage and short-lived signed links.
- Add field-level encryption key rotation through a managed KMS/HSM.
- Validate National Road Traffic Act axle-group rules against the actual vehicle configuration; this prototype validates configured GVW and authorised net load.
- Confirm the applicable Mine Health and Safety Act records, POPIA processing basis, NRCS/SANS metrology classification, and retention policy with qualified South African professionals.

## First tasks for your Antigravity agents

After opening the root folder, give the coding agents these assignments in order:

1. Run the documented tests and production build without changing behavior.
2. Inspect `.env` handling and replace all development secrets.
3. Connect the booking form to your real organisations, commodities, and site data.
4. Validate the state machine using every scenario in `scenarios.py`.
5. Configure SMTP with an Ethereal test account and inspect preview messages.
6. Replace sample ANPR images with controlled test photographs you are authorised to process.
7. Add your actual scale-indicator protocol and calibration mapping only after the hardware model is selected.

Do not begin with the PIC firmware. Prove the cloud, daemon, simulator, and exception flows first; then swap the simulator transport for the real serial port.

# 🚛 Weighbridge Management System: Comprehensive User & Operations Manual

Welcome to the **Weighbridge Management System** operations guide. This manual provides complete end-to-end instructions for administrators, operators, transporters, and developers to configure, operate, test, and troubleshoot the entire platform.

---

## 📑 Table of Contents
1. [System Architecture & Overview](#1-system-architecture--overview)
2. [Default Credentials & Demo Accounts](#2-default-credentials--demo-accounts)
3. [User Roles & Portal Capabilities](#3-user-roles--portal-capabilities)
4. [Step-by-Step Operations & Workflows](#4-step-by-step-operations--workflows)
   - [Phase 1: Super Admin & Mining Company Setup](#phase-1-super-admin--mining-company-setup)
   - [Phase 2: Transporter Setup & Fleet Management](#phase-2-transporter-setup--fleet-management)
   - [Phase 3: Order & Booking Creation](#phase-3-order--booking-creation)
   - [Phase 4: Truck Arrival & ANPR Camera Check-In](#phase-4-truck-arrival--anpr-camera-check-in)
   - [Phase 5: Weighbridge Scale Weighing & Driver Verification](#phase-5-weighbridge-scale-weighing--driver-verification)
   - [Phase 6: Load Acceptance, Exit Gate & Waybill PDF](#phase-6-load-acceptance-exit-gate--waybill-pdf)
5. [Interactive Hardware Simulator Guide](#5-interactive-hardware-simulator-guide)
   - [Simulator GUI Controls & Indicators](#simulator-gui-controls--indicators)
   - [Simulating Different Field Scenarios](#simulating-different-field-scenarios)
6. [Command Reference & CLI Cheat Sheet](#6-command-reference--cli-cheat-sheet)
7. [Troubleshooting & Frequently Asked Questions](#7-troubleshooting--frequently-asked-questions)

---

## 1. System Architecture & Overview

The platform connects enterprise cloud operations with local, mission-critical weighbridge hardware:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CLOUD WEB APPLICATION                         │
│  Next.js 15 + React 19 + Socket.IO (Port 3010)                          │
│  • Multi-tenant management for Mines, Transporters, and Regulators      │
│  • Real-time Operator Dashboards & Anomaly Monitoring                   │
│  • Automated PDF Waybills with cryptographic integrity hashing          │
└───────────────────▲─────────────────────────────────▲───────────────────┘
                    │ REST / WebSockets               │ SQL (Prisma ORM)
                    │                                 ▼
                    │                     ┌───────────────────────┐
                    │                     │ PostgreSQL (15432)    │
                    │                     │ Cloud Database        │
                    │                     └───────────────────────┘
                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    REAL-TIME BROKER: Mosquitto MQTT                     │
│  Broker Port 1883 / WebSocket Port 9001                                 │
│  • Streaming telemetry, hardware heartbeats, and gate command packets   │
└───────────────────▲─────────────────────────────────────────────────────┘
                    │ MQTT Pub/Sub
                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        EDGE SITE DAEMON (FastAPI)                       │
│  Port 8010 (Docker) / 8000 (Native)                                     │
│  • State Machine: IDLE ➔ APPROACHING ➔ POSITIONING ➔                    │
│                   STABILISING ➔ CAPTURED ➔ AWAITING_DECISION ➔ COMPLETE │
│  • ANPR OCR Engine (OpenCV + EasyOCR)                                   │
│  • SQLite Local Ledger (`edge.db`) for 72hr offline capability          │
└───────────────────▲─────────────────────────────────────────────────────┘
                    │ UART / TCP Virtual Serial (Port 7001)
                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    VIRTUAL HARDWARE SIMULATOR (GUI)                     │
│  Python Tkinter Desktop Application (Port 7001 Serial / 7002 Control)   │
│  • Load cell weight sliders, P1/P2 optical alignment beams,             │
│    RFID driver badge reader, traffic lights, and entry/exit boom gates. │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Default Credentials & Demo Accounts

All pre-seeded demo accounts use the standard password: **`Password123!`**

| Role | Email | Organization | Capabilities |
| :--- | :--- | :--- | :--- |
| **Platform Super Admin** | `admin@weighbridge.local` | Platform-wide | Full access to all clients, organizations, global settings, and service orders. |
| **Client Admin (Mine)** | `mine-admin@weighbridge.local` | Seriti Resources | Manages mine sites, orders, contracts, users, and custom roles. |
| **Weighbridge Operator** | `operator@weighbridge.local` | Seriti Resources | Operates live weighbridge, monitors scale telemetry, resolves anomalies. |
| **Security Officer** | `security@weighbridge.local` | Seriti Resources | Gate monitoring, ANPR override, vehicle physical inspections. |
| **Transporter Admin** | `transporter@weighbridge.local` | SG Coal | Manages trucks, trailers, drivers, and books delivery time slots. |
| **Client B Admin** | `clientb-admin@weighbridge.local` | Glencore | Separate tenant for multi-company isolation testing. |

---

## 3. User Roles & Portal Capabilities

### 👑 Platform Super-Admin (`admin@weighbridge.local`)
- **Global Overview:** Complete multi-tenant visibility across all mining houses and hauliers.
- **Client Onboarding:** Register new mining companies, define operating sites, and allocate hardware installations.
- **Service Orders:** Dispatch technical maintenance orders (scale calibration, camera replacement).

### 🏢 Mining Company Admin (`mine-admin@weighbridge.local`)
- **Product & Pit Catalog:** Define mineral products (e.g., *RB1 Export Coal*, *Eskom Grade Coal*), sources (pits), and destinations (ports/power stations).
- **Orders & Allocations:** Issue bulk tonnage contracts and authorize designated transport hauliers.
- **Role-Based Access Control (RBAC):** Create tailored permission roles (e.g., *Yard Supervisor*).

### 🚛 Transporter (`transporter@weighbridge.local`)
- **Fleet Management:** Register truck registrations, VIN numbers, tare weights, and insurance documents.
- **Driver Roster:** Maintain driver names, ID numbers, driver's licenses, and RFID badge IDs (`DRV00421`, etc.).
- **Slot Bookings:** Select an active order, assign a truck/trailer/driver combo, and book an arrival window.

### 🖥️ Weighbridge Operator (`operator@weighbridge.local`)
- **Live Weighbridge Dashboard:** Real-time visual representation of the weighbridge deck.
- **Stream Telemetry:** Live scale weight, infrared beam status, and boom gate positions.
- **Exception Handling:** Review tare weight drift, overload warnings, and driver mismatches.
- **Manual Actions:** Trigger manual check-ins, zero the scale, and print duplicate waybills.

---

## 4. Step-by-Step Operations & Workflows

### Phase 1: Super Admin & Mining Company Setup
1. Log in as **`admin@weighbridge.local`** at `http://localhost:3010`.
2. Navigate to **Admin > Companies** to review active mining companies and hauliers.
3. Switch to **Admin > Orders** and create a new Weighbridge Order:
   - Select Client: `Seriti Resources`
   - Select Product: `RB1 Export Coal`
   - Select Source: `Pit 1 North` and Destination: `Richards Bay Terminal`
   - Set Total Contract Tonnage: `50,000 Tonnes`
   - Assign Authorized Transporter: `SG Coal`

---

### Phase 2: Transporter Setup & Fleet Management
1. Log in as **`transporter@weighbridge.local`**.
2. Navigate to **Fleet > Vehicles** to ensure your truck (`AB 123 CD GP`) is active with an accurate tare weight (e.g., `16,800 kg`).
3. Navigate to **Fleet > Drivers** to verify driver details:
   - Driver Name: `Sipho Mahlangu`
   - Assigned RFID Tag: `DRV00421`

---

### Phase 3: Order & Booking Creation
1. While logged in as **Transporter**, go to **Bookings**.
2. Click **"New Booking"**:
   - Select Order: Choose the active contract created in Phase 1.
   - Select Vehicle: `AB 123 CD GP`
   - Select Trailer: `TRL-0001`
   - Select Driver: `Sipho Mahlangu`
   - Target Net Cargo: `36,000 kg`
   - Arrival Window: Current Date / Time slot.
3. Submit the booking. (Pre-seeded bookings automatically have `APPROVED` status).

---

### Phase 4: Truck Arrival & ANPR Camera Check-In
When the truck reaches the gate, the camera captures the license plate.

**To simulate the camera in development:**
Open PowerShell and run:
```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:8010/edge/check-in `
  -ContentType "application/json" `
  -Body '{"manual_plate":"AB 123 CD GP","image_path":"test_plates/sample_01.png"}'
```
* **System Action:** The Edge Daemon queries the booking, verifies compliance, sets the state to `VEHICLE_APPROACHING`, and adds the truck to the top of the Operator's live arrival queue.

---

### Phase 5: Weighbridge Scale Weighing & Driver Verification
Open the **Hardware Simulator GUI** window on your desktop:

1. **Driver RFID Identification:**
   - In the **RFID** text box, enter: `DRV00421`
   - *Result:* Entry gate opens, entry traffic light turns GREEN, state moves to `POSITIONING`.
2. **Position the Truck on the Scale:**
   - Check the **P1** box (Entry Beam).
   - Check the **P2** box (Exit Beam).
   - *Result:* Both beams active for 2 seconds closes entry gate, sets traffic light RED, and transitions state to `STABILISING`.
3. **Capture Weight:**
   - Slide the **Weight (kg)** slider to `52000` (Gross Weight = 16,800kg Tare + 35,200kg Coal).
   - Ensure the stability dropdown is set to **`STABLE`**.
   - Hold this for **3 seconds**.
   - *Result:* Weight locks in, state transitions to `AWAITING_DRIVER_DECISION`.

---

### Phase 6: Load Acceptance, Exit Gate & Waybill PDF
At the driver kiosk (or operator dashboard):

1. **Accept the Load:**
   In PowerShell, execute:
   ```powershell
   Invoke-RestMethod -Method Post -Uri http://localhost:8010/edge/driver-decision `
     -ContentType "application/json" `
     -Body '{"decision": "ACCEPT"}'
   ```
2. **Exit Release:**
   - The Exit Boom Gate opens in the simulator.
   - The Exit Traffic Light turns GREEN.
3. **Waybill Generation:**
   - In the Web UI (`http://localhost:3010`), navigate to **Transactions**.
   - The transaction appears instantly with Gross, Tare, Net weights, and a clickable **"Download PDF Waybill"** button.
4. **Clear Scale:**
   - In the Simulator GUI, uncheck **P1** and **P2**, and slide Weight back to `0`.
   - The exit gate automatically closes and the system resets to `IDLE` ready for the next truck.

---

## 5. Interactive Hardware Simulator Guide

The desktop Hardware Simulator (`apps/hardware-simulator/simulator.py`) accurately mimics the electrical signals of a physical weighbridge microcontroller.

```
┌─────────────────────────────────────────────────────────────┐
│                 WEIGHBRIDGE HARDWARE SIMULATOR              │
├─────────────────────────────────────────────────────────────┤
│  Scale Reading (kg): [ 52000 ]                              │
│  [=======================|==============] (Slider 0-80,000kg) │
│                                                             │
│  Scale Status: [ STABLE ▼ ]                                 │
│                                                             │
│  Infrared Optical Beams:                                    │
│  [✔] P1 (Entry Alignment)      [✔] P2 (Exit Alignment)      │
│                                                             │
│  Driver RFID Badge: [ DRV00421          ]                   │
│                                                             │
│  Actuators & Relays (Live Status):                          │
│  • Entry Gate : CLOSED           • Exit Gate : OPEN         │
│  • Entry Light: RED              • Exit Light: GREEN        │
│  • Alarm Buzzer: OFF                                        │
└─────────────────────────────────────────────────────────────┘
```

### Simulator GUI Controls & Indicators

| Control / Indicator | Purpose | Expected Setting for Normal Weighment |
| :--- | :--- | :--- |
| **Weight Slider** | Simulates the load cell analog voltage converted to kilograms. | Set to vehicle gross weight (`~50,000 kg`). |
| **Scale Status** | Simulates digital filtering stability (`STABLE` vs `UNSTABLE` vs `FAULT`). | Keep as `STABLE` for 3 continuous seconds. |
| **P1 Beam** | Optical infrared beam at the entry end of the concrete deck. | `Checked` (Truck body breaks the beam). |
| **P2 Beam** | Optical infrared beam at the exit end of the concrete deck. | `Checked` (Truck body breaks the beam). |
| **RFID Tag** | Emulates contactless driver card reader at the entrance pedestal. | Enter assigned driver RFID (e.g. `DRV00421`). |
| **Actuator Panel** | Live readout of boom gates (OPEN/CLOSED), lights (RED/GREEN), buzzer (ON/OFF). | Automated feedback driven by daemon commands. |

---

### Simulating Different Field Scenarios

#### ⚠️ 1. Simulating an Overload Violation
1. Check in truck `AB 123 CD GP`.
2. In simulator, set RFID to `DRV00421`, check **P1** and **P2**.
3. Slide weight to **`65,000 kg`** (exceeds legal GVW limit of 56,000 kg).
4. **Result:** Alarm Buzzer turns **ON**, Exit Gate remains **LOCKED CLOSED**, and a High-Severity `OVERLOAD` incident is raised on the Operator Dashboard requiring supervisor sign-off.

#### 🚫 2. Simulating a Driver Badge Mismatch (Anti-Theft)
1. Check in truck `AB 123 CD GP` (Registered driver is Sipho Mahlangu: `DRV00421`).
2. In simulator, type a different badge into the RFID box: **`DRV99999`**.
3. **Result:** Entry Gate refuses to open, Buzzer sounds, and a Critical `DRIVER_MISMATCH` alert is triggered.

#### 📏 3. Simulating Improper Truck Alignment (Axle off scale)
1. Check in truck and enter valid RFID.
2. Check only **P1**, leaving **P2** unchecked (simulating the back wheels hanging off the deck).
3. Increase weight.
4. **Result:** State machine refuses to enter `STABILISING`. Weight will not be captured until both beams are simultaneously blocked for at least 2 seconds.

---

## 6. Command Reference & CLI Cheat Sheet

### 🚀 Recommended Daily Startup Sequence (Hybrid Interactive Mode)

**Terminal 1 — Core Infrastructure (Postgres, MQTT, Site Daemon in Docker):**
```powershell
docker compose up -d postgres mosquitto site-daemon --build
```

**Terminal 2 — Cloud Web Platform (Next.js App):**
```powershell
npm run dev:web
```
*Access Web UI at `http://localhost:3010`.*

**Terminal 3 — Virtual Hardware Simulator GUI:**
```powershell
cd apps\hardware-simulator
python simulator.py --tcp-host 0.0.0.0
```

---

### 🛠️ Common Operational Commands

| Action | Command |
| :--- | :--- |
| **Trigger Camera Check-In** | `Invoke-RestMethod -Method Post -Uri http://localhost:8010/edge/check-in -ContentType "application/json" -Body '{"manual_plate":"AB 123 CD GP"}'` |
| **Driver Accept Load** | `Invoke-RestMethod -Method Post -Uri http://localhost:8010/edge/driver-decision -ContentType "application/json" -Body '{"decision": "ACCEPT"}'` |
| **Driver Request Reload** | `Invoke-RestMethod -Method Post -Uri http://localhost:8010/edge/driver-decision -ContentType "application/json" -Body '{"decision": "RELOAD"}'` |
| **Emergency Manual Gate Open** | `Invoke-RestMethod -Method Post -Uri http://localhost:8010/edge/manual-override -ContentType "application/json" -Body '{"command":{"action":"GATE_OPEN","target":"EXIT"},"operator_id":"op-1","reason":"Power failure manual exit override"}'` |
| **Check Edge Daemon Health** | `Invoke-RestMethod -Uri http://localhost:8010/health` |
| **Run 100% Automated Demo** | `npm run demo:auto` |
| **Wipe & Re-Seed Database** | `cd packages\database; node prisma-runner.js migrate reset --force; cd ..\..` |
| **Stop All Containers** | `docker compose down` |

---

## 7. Troubleshooting & Frequently Asked Questions

### Q1: The driver decision command returns `"No captured weight is awaiting a driver decision"`
* **Cause:** The scale has not locked in a stable weight yet.
* **Fix:** In the simulator, ensure:
  1. Both **P1** and **P2** are checked.
  2. The weight is greater than 500 kg.
  3. The status dropdown says **STABLE** continuously for at least 3 seconds.
  4. Look at the Operator Dashboard to confirm the live weight is displayed before sending the accept command.

### Q2: Site Daemon shows `"Hardware transport unavailable"` or cannot connect to simulator
* **Cause:** The simulator was started on `127.0.0.1`, which is inaccessible from inside Docker containers.
* **Fix:** Start the simulator with `--tcp-host 0.0.0.0`:
  ```powershell
  python simulator.py --tcp-host 0.0.0.0
  ```

### Q3: How do I access PostgreSQL directly to inspect tables?
* **Connection String:** `postgresql://weighbridge:weighbridge_dev_change_me@localhost:15432/weighbridge`
* You can connect using any standard SQL tool (DBeaver, pgAdmin, VS Code Database Client) on port **`15432`**.

### Q4: How does the system handle offline power/network outages?
* The local **Site Daemon** operates independently on edge hardware. All transactions and weight captures are stored in local SQLite (`/data/edge.db`).
* When internet connectivity is restored, the built-in **Sync Worker** securely replays and syncs pending records to cloud PostgreSQL with zero data loss.

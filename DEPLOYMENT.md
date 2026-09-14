# 🚀 Weighbridge System: Production Deployment & Field Installation Guide

This document is the definitive production deployment, field hardware installation, and operational guide for commissioning the **Weighbridge Management & Automated Weighment System**.

---

## 📑 Table of Contents
1. [Deployment Architecture](#1-deployment-architecture)
2. [Prerequisites & System Requirements](#2-prerequisites--system-requirements)
3. [Environment Configuration Reference](#3-environment-configuration-reference)
4. [Step-by-Step Cloud Server Deployment](#4-step-by-step-cloud-server-deployment)
5. [Step-by-Step Edge Weighbridge PC Deployment](#5-step-by-step-edge-weighbridge-pc-deployment)
6. [Physical Hardware Wiring & Sensor Integration](#6-physical-hardware-wiring--sensor-integration)
7. [ANPR Camera & RTSP Video Configuration](#7-anpr-camera--rtsp-video-configuration)
8. [Automated System Verification & Acceptance Testing](#8-automated-system-verification--acceptance-testing)
9. [Backup, Monitoring & Disaster Recovery](#9-backup-monitoring--disaster-recovery)

---

## 1. Deployment Architecture

The system operates on a hybrid **Cloud + Distributed Edge** architecture:

```
                      ┌──────────────────────────────────────────────┐
                      │             PUBLIC CLOUD SERVER              │
                      │Ubuntu 22.04 LTS / AWS / Azure / DigitalOcean)│
                      │                                              │
                      │   ┌──────────────────────────────────────┐   │
                      │   │       NGINX / Caddy (Reverse Proxy)  │   │
                      │   │       TLS SSL (HTTPS 443 / WSS 9001) │   │
                      │   └───────────────▲──────────────────────┘   │
                      │                   │                          │
                      │   ┌───────────────┴──────────────────────┐   │
                      │   │  Web App (Next.js 15 SSR / Port 3010)│   │
                      │   └───────▲──────────────────────▲───────┘   │
                      │           │ REST/WS              │ SQL       │
                      │   ┌───────▼──────────────┐ ┌─────▼───────┐   │
                      │   │ Mosquitto MQTT Broker│ │  PostgreSQL │   │
                      │   │ (1883 / 9001 WSS)    │ │  (15432)    │   │
                      │   └──────────────────────┘ └─────────────┘   │
                      └───────────────────▲──────────────────────────┘
                                          │ Encrypted MQTT & HTTPS
                                          ▼
     ┌────────────────────────────────────────────────────────────────────────┐
     │                ON-PREMISE PHYSICAL WEIGHBRIDGE SITE                    │
     │  (Industrial Edge PC / Fanless Windows or Linux Box at the Gatehouse)  │
     │                                                                        │
     │   ┌────────────────────────────────────────────────────────────────┐   │
     │   │                    FASTAPI SITE DAEMON                         │   │
     │   │  • Local SQLite Ledger (/data/edge.db)                         │   │
     │   │  • Dual-Lane State Machine (IDLE ➔ COMPLETE)                   │   │
     │   │  • ANPR OCR Engine (OpenCV + EasyOCR)                          │   │
     │   │  • Background Sync Worker (Auto-replay on reconnect)           │   │
     │   └────────────────▲───────────────────────────────▲───────────────┘   │
     │                    │ RS-232 / RS-485 / TCP         │ RTSP IP Stream    │
     │                    ▼                               ▼                   │
     │   ┌────────────────────────────────┐ ┌─────────────────────────────┐   │
     │   │      PIC18 / MCU Scale Unit    │ │       ANPR HD IP Camera     │   │
     │   │  • Digital Load Cell Interface │ │   (Hikvision / Dahua / Axis)│   │
     │   │  • P1 / P2 Infrared Beams      │ └─────────────────────────────┘   │
     │   │  • RFID Badge Reader           │                                   │
     │   │  • Boom Gates & Traffic Lights │                                   │
     │   └────────────────────────────────┘                                   │
     └────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Prerequisites & System Requirements

### Cloud Server (Minimum Specifications)
- **OS:** Ubuntu 22.04 LTS or 24.04 LTS (x86_64)
- **CPU / RAM:** 2 vCPU, 4 GB RAM (8 GB recommended with high ANPR traffic)
- **Disk:** 40 GB NVMe / SSD
- **Network:** Static Public IP, Ports `80` (HTTP), `443` (HTTPS), `1883` (MQTT over TLS), `9001` (WebSocket MQTT)
- **Installed Software:**
  - Docker & Docker Compose v2 (`docker compose version` >= 2.20)
  - Node.js 20 LTS (if running non-containerized)

### Edge Gatehouse PC (Minimum Specifications)
- **OS:** Ubuntu Linux 22.04 LTS / Debian 12 / Windows 10/11 Pro IoT
- **CPU / RAM:** Intel Core i3/i5 (8th gen+) or ARM64 (Raspberry Pi 4 8GB / 5), 4 GB RAM
- **Disk:** 32 GB SSD
- **Connectivity:** Ethernet LAN to IP Cameras, USB-to-RS232/485 adapter to scale indicator.
- **Installed Software:** Python 3.11 with `pip` and `virtualenv`, or Docker Engine.

---

## 3. Environment Configuration Reference

Create a `.env.production` file in your cloud deployment root:

```ini
# ==========================================
# CLOUD DATABASE (PostgreSQL)
# ==========================================
POSTGRES_DB=weighbridge_prod
POSTGRES_USER=weighbridge_admin
POSTGRES_PASSWORD=GENERATE_STRONG_RANDOM_PASSWORD_HERE
DATABASE_URL=postgresql://weighbridge_admin:GENERATE_STRONG_RANDOM_PASSWORD_HERE@postgres:5432/weighbridge_prod?schema=public

# ==========================================
# AUTHENTICATION & SECURITY
# ==========================================
# Generate using: openssl rand -hex 32
AUTH_SECRET=4f92d8e3b1c7a560123456789abcdef0123456789abcdef0123456789abcdef0
AUTH_TRUST_HOST=true
PASSWORD_PEPPER=8a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef
SITE_DAEMON_API_KEY=9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b1a0f9e8d

# ==========================================
# APPLICATION & NETWORKING
# ==========================================
NEXT_PUBLIC_APP_URL=https://weighbridge.yourcompany.com
NEXT_PUBLIC_SOCKET_URL=https://weighbridge.yourcompany.com
MQTT_URL=mqtt://mosquitto:1883

# ==========================================
# EMAIL NOTIFICATIONS (SMTP)
# ==========================================
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=SG.your_sendgrid_key_here
SMTP_FROM=Weighbridge Alert System <noreply@yourcompany.com>

# ==========================================
# SMS NOTIFICATIONS (Twilio Optional)
# ==========================================
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
```

---

## 4. Step-by-Step Cloud Server Deployment

### Step 1: Clone and Prepare Codebase
```bash
git clone https://github.com/YourOrg/weighbridge-system.git /opt/weighbridge-system
cd /opt/weighbridge-system
cp .env.example .env.production
# Edit .env.production with production passwords and secrets:
nano .env.production
```

### Step 2: Build & Start Containers
```bash
docker compose --env-file .env.production --profile cloud up -d --build
```

### Step 3: Run Database Migrations
```bash
docker compose --env-file .env.production exec web npm --workspace @weighbridge/database run migrate:deploy
docker compose --env-file .env.production exec web npm --workspace @weighbridge/database run seed
```

### Step 4: Configure NGINX Reverse Proxy with SSL
Install NGINX and Certbot:
```bash
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx
```

Configure `/etc/nginx/sites-available/weighbridge`:
```nginx
server {
    server_name weighbridge.yourcompany.com;

    location / {
        proxy_pass http://127.0.0.1:3010;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket & Socket.IO Support
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3010;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

Enable site and provision SSL certificate:
```bash
sudo ln -s /etc/nginx/sites-available/weighbridge /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d weighbridge.yourcompany.com
```

---

## 5. Step-by-Step Edge Weighbridge PC Deployment

On the local PC located at the physical weighbridge gatehouse:

### Step 1: Install Site Daemon Dependencies
```bash
cd /opt/weighbridge-daemon
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements-core.txt
pip install -r requirements-anpr.txt
```

### Step 2: Configure Site Settings (`config.yaml`)
Edit `apps/site-daemon/config.yaml`:
```yaml
site:
  id: "WOESTALLEEN"
  name: "Woestalleen Colliery"
  timezone: "Africa/Johannesburg"

weighbridge:
  max_capacity_kg: 80000
  stability_threshold_kg: 20
  stability_duration_seconds: 3
  empty_vehicle_max_kg: 18500
  loaded_vehicle_max_kg: 70000

transport:
  mode: "serial" # Use "serial" for physical hardware, "tcp" for simulator

serial:
  port: "/dev/ttyUSB0" # Linux or "COM3" on Windows
  baud_rate: 115200

anpr:
  confidence_threshold: 0.75
  camera_source: "rtsp://admin:CameraPass123@192.168.1.108:554/Streaming/Channels/101"

cloud:
  api_url: "https://weighbridge.yourcompany.com/api"
  site_api_key: "9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b1a0f9e8d"

storage:
  sqlite_path: "/data/edge.db"
  evidence_directory: "/data/evidence"
```

### Step 3: Configure Systemd Auto-Start Service
Create `/etc/systemd/system/weighbridge-daemon.service`:
```ini
[Unit]
Description=Weighbridge Edge Site Daemon
After=network.target

[Service]
Type=simple
User=weighbridge
WorkingDirectory=/opt/weighbridge-daemon
ExecStart=/opt/weighbridge-daemon/.venv/bin/python daemon.py
Restart=always
RestartSec=5
Environment=WB_CONFIG_PATH=/opt/weighbridge-daemon/config.yaml

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now weighbridge-daemon
sudo systemctl status weighbridge-daemon
```

---

## 6. Physical Hardware Wiring & Sensor Integration

The system communicates with standard industrial weighbridge controllers (e.g., Avery Weigh-Tronix, Rinstrum, Cardinal, Microchip PIC18F) using ASCII serial packets:

```
[Load Cell J-Box] ───Analog 4-20mA───► [Weight Indicator / Digitizer]
                                                 │
                                           RS-232 / RS-485
                                                 │
                                                 ▼
[P1 Entry Optical Beam] ──Digital NPN──► [Microcontroller / PLC]
[P2 Exit Optical Beam]  ──Digital NPN──►       │
[RFID Badge Reader]     ──Wiegand/UART─►       │
                                               │ USB/Serial (/dev/ttyUSB0)
                                               ▼
                                      [Edge PC Site Daemon]
                                               │
                                        Relay Driver Outputs
                                               │
                                 ┌─────────────┴─────────────┐
                                 ▼                           ▼
                        [Entry/Exit Boom Gates]      [Traffic Lights & Buzzer]
```

### Protocol Frame Format (100ms Telemetry Stream)
```text
#WT:052400;P1:1;P2:1;RF:DRV00421;ST:STABLE$\r\n
```
- `#WT:<kg>`: 6-digit weight reading in kilograms.
- `P1:<0|1>`: Entry position alignment beam (1 = blocked / truck present).
- `P2:<0|1>`: Exit position alignment beam (1 = blocked / truck present).
- `RF:<id>`: 8-character driver RFID card serial.
- `ST:<STABLE|UNSTABLE|FAULT>`: Digital weight filtering status.

---

## 7. ANPR Camera & RTSP Video Configuration

### Recommended Camera Positioning:
1. **Mounting Height:** 1.5m to 2.0m above road level.
2. **Angle:** Less than 25 degrees horizontal and vertical from the license plate.
3. **Shutter Speed:** 1/500s or faster to prevent motion blur.
4. **Lighting:** Integrated 850nm Infrared (IR) illuminator for night capture.

### Camera RTSP Stream Setup:
In `config.yaml`, provide the RTSP stream URL for high-resolution optical character recognition:
```yaml
anpr:
  camera_source: "rtsp://admin:SecurePassword123@192.168.1.100:554/h264Preview_01_main"
  confidence_threshold: 0.75
  max_retries: 3
```

---

## 8. Automated System Verification & Acceptance Testing

Before signing off on a new weighbridge deployment, execute the automated end-to-end acceptance suite:

```bash
# Run automated weighment testing across all scenario branches:
npm run demo:auto
```

### Verification Checklist:
- [x] **Zero Tare Drift:** Empty scale returns 0 ± 20 kg.
- [x] **Anti-Theft RFID Check:** Mismatched driver RFID halts entry gate with audible alarm.
- [x] **Overload Prevention:** Trucks exceeding statutory axle/GVW limits lock exit gate and trigger a supervisor incident.
- [x] **Offline Resilience:** Disconnecting internet allows edge weighing to continue uninterrupted; reconnecting automatically synchronizes records to the cloud.
- [x] **Cryptographic Audit Trail:** SHA-256 integrity hashes verify no database rows were tampered with post-weighment.

---

## 9. Backup, Monitoring & Disaster Recovery

### Cloud PostgreSQL Daily Backup Script
Add to server `crontab -e`:
```bash
0 2 * * * docker compose exec postgres pg_dump -U weighbridge weighbridge | gzip > /opt/backups/db_$(date +\%Y\%m\%d).sql.gz
```

### Edge SQLite Auto-Backup
The edge daemon automatically creates hourly point-in-time snapshots in `/data/backups/edge-backup-YYYYMMDD.db`.

### Restoring from Backup:
```bash
# Cloud Database Restore:
gunzip < /opt/backups/db_20260814.sql.gz | docker compose exec -T postgres psql -U weighbridge -d weighbridge
```

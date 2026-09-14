#!/usr/bin/env python3
"""
Weighbridge & Site Access Control Automation System
Comprehensive Software Diagrams & Architecture Specification PDF Generator.
Generates an executive-grade, multi-page vector PDF containing all software diagrams.
"""

import os
import subprocess
import sys
from pathlib import Path

# Color Palette Constants
BG_DARK = "#0f172a"
BG_CARD = "#ffffff"
PRIMARY = "#1e40af"
PRIMARY_LIGHT = "#3b82f6"
SECONDARY = "#0d9488"
ACCENT_GREEN = "#16a34a"
ACCENT_AMBER = "#d97706"
ACCENT_RED = "#dc2626"
ACCENT_PURPLE = "#7c3aed"
TEXT_DARK = "#0f172a"
TEXT_MUTED = "#64748b"
BORDER_COLOR = "#cbd5e1"
FILL_LIGHT = "#f8fafc"

def generate_html_content() -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Weighbridge System — Complete Software Diagrams Specification</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');

  @page {{
    size: A4 portrait;
    margin: 12mm 12mm 15mm 12mm;
    @bottom-right {{
      content: "Page " counter(page) " of " counter(pages);
      font-family: 'Inter', sans-serif;
      font-size: 8pt;
      color: #94a3b8;
    }}
    @bottom-left {{
      content: "Weighbridge Automation System — Software Architecture Specification";
      font-family: 'Inter', sans-serif;
      font-size: 8pt;
      color: #94a3b8;
    }}
  }}

  * {{
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }}

  body {{
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    color: #1e293b;
    background-color: #ffffff;
    line-height: 1.45;
    font-size: 9pt;
  }}

  .page-break {{
    page-break-before: always;
  }}

  .avoid-break {{
    page-break-inside: avoid;
  }}

  /* Cover Page */
  .cover-page {{
    height: 98vh;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 30px 20px 20px 20px;
    background: linear-gradient(145deg, #0f172a 0%, #1e293b 60%, #1e3a8a 100%);
    color: #ffffff;
    border-radius: 12px;
  }}

  .cover-header {{
    border-bottom: 2px solid rgba(255, 255, 255, 0.15);
    padding-bottom: 20px;
  }}

  .cover-badge {{
    display: inline-block;
    background: rgba(59, 130, 246, 0.25);
    border: 1px solid rgba(59, 130, 246, 0.5);
    color: #93c5fd;
    font-size: 9pt;
    font-weight: 600;
    padding: 4px 12px;
    border-radius: 20px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    margin-bottom: 15px;
  }}

  .cover-title {{
    font-size: 26pt;
    font-weight: 800;
    line-height: 1.15;
    color: #ffffff;
    margin-bottom: 10px;
    letter-spacing: -0.02em;
  }}

  .cover-subtitle {{
    font-size: 13pt;
    font-weight: 400;
    color: #94a3b8;
    line-height: 1.4;
    max-width: 650px;
  }}

  .cover-grid {{
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 15px;
    margin: 25px 0;
  }}

  .cover-card {{
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 14px;
  }}

  .cover-card h4 {{
    font-size: 10pt;
    color: #60a5fa;
    margin-bottom: 6px;
    font-weight: 600;
  }}

  .cover-card p {{
    font-size: 8.5pt;
    color: #cbd5e1;
    line-height: 1.35;
  }}

  .cover-footer {{
    border-top: 1px solid rgba(255, 255, 255, 0.15);
    padding-top: 15px;
    display: flex;
    justify-content: space-between;
    font-size: 8.5pt;
    color: #94a3b8;
  }}

  /* Section Styles */
  .section-header {{
    border-bottom: 2px solid #e2e8f0;
    padding-bottom: 8px;
    margin-bottom: 12px;
  }}

  .section-tag {{
    font-size: 7.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #2563eb;
    margin-bottom: 2px;
  }}

  .section-title {{
    font-size: 16pt;
    font-weight: 800;
    color: #0f172a;
    letter-spacing: -0.02em;
  }}

  .section-desc {{
    font-size: 8.5pt;
    color: #475569;
    margin-top: 2px;
    line-height: 1.4;
  }}

  /* Diagram Container */
  .diagram-wrapper {{
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 10px;
    margin-bottom: 10px;
    display: flex;
    justify-content: center;
    align-items: center;
  }}

  svg {{
    max-width: 100%;
    height: auto;
    display: block;
  }}

  /* Explanatory Cards */
  .info-grid {{
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin-top: 6px;
  }}

  .info-grid-2 {{
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    margin-top: 6px;
  }}

  .info-box {{
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-left: 3px solid #2563eb;
    border-radius: 4px;
    padding: 7px 10px;
  }}

  .info-box.green {{
    border-left-color: #16a34a;
  }}

  .info-box.amber {{
    border-left-color: #d97706;
  }}

  .info-box.purple {{
    border-left-color: #7c3aed;
  }}

  .info-box.red {{
    border-left-color: #dc2626;
  }}

  .info-box h5 {{
    font-size: 8.5pt;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 2px;
  }}

  .info-box p {{
    font-size: 7.5pt;
    color: #475569;
    line-height: 1.35;
  }}

  /* Tables */
  table.spec-table {{
    width: 100%;
    border-collapse: collapse;
    font-size: 7.5pt;
    margin-top: 6px;
  }}

  table.spec-table th, table.spec-table td {{
    padding: 5px 8px;
    border: 1px solid #e2e8f0;
    text-align: left;
  }}

  table.spec-table th {{
    background: #f1f5f9;
    font-weight: 700;
    color: #1e293b;
  }}

  table.spec-table tr:nth-child(even) {{
    background: #f8fafc;
  }}

  .code-badge {{
    font-family: 'JetBrains Mono', monospace;
    font-size: 7pt;
    background: #f1f5f9;
    border: 1px solid #cbd5e1;
    padding: 1px 4px;
    border-radius: 3px;
    color: #0f172a;
  }}
</style>
</head>
<body>

  <!-- COVER PAGE -->
  <div class="cover-page">
    <div class="cover-header">
      <div class="cover-badge">Engineering & Architecture Specification</div>
      <h1 class="cover-title">Weighbridge & Site Access Control Automation System</h1>
      <p class="cover-subtitle">Complete Software Engineering Diagrams, Data Models, State Lifecycles, and Multi-Tier Architectural Blueprint.</p>
    </div>

    <div class="cover-grid">
      <div class="cover-card">
        <h4>1. Context & Use Case Architecture</h4>
        <p>Comprehensive actor modeling across Transporters, Weighbridge Operators, Security Officers, Platform Administrators, Drivers, and Autonomous Edge Daemons.</p>
      </div>
      <div class="cover-card">
        <h4>2. Relational Data Model (ERD)</h4>
        <p>Complete multi-tenant entity-relationship schema encompassing 25+ database models, cryptographic audit chain tables, and edge SQLite schemas.</p>
      </div>
      <div class="cover-card">
        <h4>3. Behavioral & Sequence Lifecycles</h4>
        <p>End-to-end automated weighment transactions, offline store-and-forward sync, anti-fraud anomaly scoring, and overload interlock escalations.</p>
      </div>
      <div class="cover-card">
        <h4>4. State Machine & Hardware Protocols</h4>
        <p>Deterministic 7-stage edge safety state machine, dual optical beam interlocks, UART telemetry framing, and fail-safe relay actuation.</p>
      </div>
    </div>

    <div class="cover-footer">
      <div><strong>System Version:</strong> 1.0.0 Production Prototype</div>
      <div><strong>Security Classification:</strong> Confidential / Engineering Specification</div>
      <div><strong>Generated:</strong> August 2026</div>
    </div>
  </div>

  <!-- PAGE 1: SYSTEM CONTEXT & BLOCK ARCHITECTURE -->
  <div class="page-break">
    <div class="section-header">
      <div class="section-tag">Diagram 01 — System Architecture</div>
      <h2 class="section-title">High-Level System Context & Component Architecture</h2>
      <p class="section-desc">4-Tier physical-to-cloud topology connecting field hardware, edge controllers, real-time message brokers, and enterprise cloud APIs.</p>
    </div>

    <div class="diagram-wrapper">
      <svg viewBox="0 0 740 370" width="740" height="370" xmlns="http://www.w3.org/2000/svg">
        <!-- Background Grid / Containers -->
        <rect x="10" y="10" width="720" height="90" rx="8" fill="#eff6ff" stroke="#bfdbfe" stroke-width="1.5"/>
        <text x="25" y="30" font-family="Inter" font-size="10" font-weight="700" fill="#1e40af">CLOUD MASTER TIER (Next.js 14, Node.js 20, PostgreSQL 16)</text>

        <rect x="10" y="140" width="720" height="95" rx="8" fill="#f0fdf4" stroke="#bbf7d0" stroke-width="1.5"/>
        <text x="25" y="160" font-family="Inter" font-size="10" font-weight="700" fill="#166534">EDGE DAEMON TIER (FastAPI, SQLite WAL, FSM, ANPR Engine)</text>

        <rect x="10" y="270" width="720" height="90" rx="8" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5"/>
        <text x="25" y="290" font-family="Inter" font-size="10" font-weight="700" fill="#334155">PHYSICAL OT / FIRMWARE TIER (PIC18F45K22 MCU, Sensors, Barrier Relays)</text>

        <!-- Cloud Components -->
        <rect x="30" y="42" width="130" height="46" rx="5" fill="#ffffff" stroke="#3b82f6" stroke-width="1.2"/>
        <text x="95" y="60" font-family="Inter" font-size="8.5" font-weight="700" text-anchor="middle" fill="#1e293b">Next.js Web API</text>
        <text x="95" y="74" font-family="Inter" font-size="7" text-anchor="middle" fill="#64748b">App Router / NextAuth</text>

        <rect x="180" y="42" width="125" height="46" rx="5" fill="#ffffff" stroke="#3b82f6" stroke-width="1.2"/>
        <text x="242" y="60" font-family="Inter" font-size="8.5" font-weight="700" text-anchor="middle" fill="#1e293b">PostgreSQL 16</text>
        <text x="242" y="74" font-family="Inter" font-size="7" text-anchor="middle" fill="#64748b">Prisma Multi-Tenant DB</text>

        <rect x="325" y="42" width="135" height="46" rx="5" fill="#ffffff" stroke="#3b82f6" stroke-width="1.2"/>
        <text x="392" y="60" font-family="Inter" font-size="8.5" font-weight="700" text-anchor="middle" fill="#1e293b">Hash Ledger Engine</text>
        <text x="392" y="74" font-family="Inter" font-size="7" text-anchor="middle" fill="#64748b">SHA-256 Audit Chain</text>

        <rect x="480" y="42" width="115" height="46" rx="5" fill="#ffffff" stroke="#3b82f6" stroke-width="1.2"/>
        <text x="537" y="60" font-family="Inter" font-size="8.5" font-weight="700" text-anchor="middle" fill="#1e293b">Socket.IO Server</text>
        <text x="537" y="74" font-family="Inter" font-size="7" text-anchor="middle" fill="#64748b">Real-time WebSocket</text>

        <rect x="610" y="42" width="105" height="46" rx="5" fill="#ffffff" stroke="#3b82f6" stroke-width="1.2"/>
        <text x="662" y="60" font-family="Inter" font-size="8.5" font-weight="700" text-anchor="middle" fill="#1e293b">Fraud Detection</text>
        <text x="662" y="74" font-family="Inter" font-size="7" text-anchor="middle" fill="#64748b">Anomaly Scorer</text>

        <!-- Edge Components -->
        <rect x="30" y="172" width="130" height="50" rx="5" fill="#ffffff" stroke="#16a34a" stroke-width="1.2"/>
        <text x="95" y="191" font-family="Inter" font-size="8.5" font-weight="700" text-anchor="middle" fill="#1e293b">Weighing FSM</text>
        <text x="95" y="204" font-family="Inter" font-size="7" text-anchor="middle" fill="#64748b">7-Stage Safety Interlock</text>
        <text x="95" y="214" font-family="Inter" font-size="6.5" text-anchor="middle" fill="#15803d">Dual Beam + Stability</text>

        <rect x="180" y="172" width="125" height="50" rx="5" fill="#ffffff" stroke="#16a34a" stroke-width="1.2"/>
        <text x="242" y="191" font-family="Inter" font-size="8.5" font-weight="700" text-anchor="middle" fill="#1e293b">ANPR Vision Pipeline</text>
        <text x="242" y="204" font-family="Inter" font-size="7" text-anchor="middle" fill="#64748b">OpenCV + EasyOCR</text>
        <text x="242" y="214" font-family="Inter" font-size="6.5" text-anchor="middle" fill="#15803d">5-Frame Majority Vote</text>

        <rect x="325" y="172" width="135" height="50" rx="5" fill="#ffffff" stroke="#16a34a" stroke-width="1.2"/>
        <text x="392" y="191" font-family="Inter" font-size="8.5" font-weight="700" text-anchor="middle" fill="#1e293b">SQLite 3 WAL Ledger</text>
        <text x="392" y="204" font-family="Inter" font-size="7" text-anchor="middle" fill="#64748b">72h+ Store-and-Forward</text>
        <text x="392" y="214" font-family="Inter" font-size="6.5" text-anchor="middle" fill="#15803d">Hourly Auto-Backups</text>

        <rect x="480" y="172" width="115" height="50" rx="5" fill="#ffffff" stroke="#16a34a" stroke-width="1.2"/>
        <text x="537" y="191" font-family="Inter" font-size="8.5" font-weight="700" text-anchor="middle" fill="#1e293b">Sync Worker</text>
        <text x="537" y="204" font-family="Inter" font-size="7" text-anchor="middle" fill="#64748b">HTTPS Sync Queue</text>
        <text x="537" y="214" font-family="Inter" font-size="6.5" text-anchor="middle" fill="#15803d">Exponential Backoff</text>

        <rect x="610" y="172" width="105" height="50" rx="5" fill="#ffffff" stroke="#16a34a" stroke-width="1.2"/>
        <text x="662" y="191" font-family="Inter" font-size="8.5" font-weight="700" text-anchor="middle" fill="#1e293b">MQTT Client</text>
        <text x="662" y="204" font-family="Inter" font-size="7" text-anchor="middle" fill="#64748b">Telemetry Pub/Sub</text>
        <text x="662" y="214" font-family="Inter" font-size="6.5" text-anchor="middle" fill="#15803d">QoS 0/1 Buffering</text>

        <!-- Physical Hardware Components -->
        <rect x="30" y="302" width="125" height="46" rx="5" fill="#ffffff" stroke="#64748b" stroke-width="1.2"/>
        <text x="92" y="321" font-family="Inter" font-size="8.5" font-weight="700" text-anchor="middle" fill="#1e293b">Load Cell ADC (AN0)</text>
        <text x="92" y="335" font-family="Inter" font-size="7" text-anchor="middle" fill="#64748b">10-bit Weight mV Input</text>

        <rect x="170" y="302" width="125" height="46" rx="5" fill="#ffffff" stroke="#64748b" stroke-width="1.2"/>
        <text x="232" y="321" font-family="Inter" font-size="8.5" font-weight="700" text-anchor="middle" fill="#1e293b">Position Beams (P1, P2)</text>
        <text x="232" y="335" font-family="Inter" font-size="7" text-anchor="middle" fill="#64748b">Opto-Isolated Photogates</text>

        <rect x="310" y="302" width="125" height="46" rx="5" fill="#ffffff" stroke="#64748b" stroke-width="1.2"/>
        <text x="372" y="321" font-family="Inter" font-size="8.5" font-weight="700" text-anchor="middle" fill="#1e293b">RFID Scanner (UART2)</text>
        <text x="372" y="335" font-family="Inter" font-size="7" text-anchor="middle" fill="#64748b">EM-4100 Driver Cards</text>

        <rect x="450" y="302" width="135" height="46" rx="5" fill="#ffffff" stroke="#64748b" stroke-width="1.2"/>
        <text x="517" y="321" font-family="Inter" font-size="8.5" font-weight="700" text-anchor="middle" fill="#1e293b">Relay Board (LATB)</text>
        <text x="517" y="335" font-family="Inter" font-size="7" text-anchor="middle" fill="#64748b">Gates, Lights, Siren Buzzer</text>

        <rect x="600" y="302" width="115" height="46" rx="5" fill="#ffffff" stroke="#64748b" stroke-width="1.2"/>
        <text x="657" y="321" font-family="Inter" font-size="8.5" font-weight="700" text-anchor="middle" fill="#1e293b">Driver Kiosk Display</text>
        <text x="657" y="335" font-family="Inter" font-size="7" text-anchor="middle" fill="#64748b">Load Accept / Reload</text>

        <!-- Connecting Arrows -->
        <!-- Cloud <-> Edge -->
        <line x1="95" y1="88" x2="95" y2="172" stroke="#2563eb" stroke-width="1.5" stroke-dasharray="3,3"/>
        <polygon points="95,172 92,164 98,164" fill="#2563eb"/>
        <polygon points="95,88 92,96 98,96" fill="#2563eb"/>
        <text x="100" y="130" font-family="Inter" font-size="6.5" font-weight="600" fill="#1e40af">HTTPS / Sync API</text>

        <line x1="537" y1="88" x2="537" y2="172" stroke="#16a34a" stroke-width="1.5"/>
        <polygon points="537,88 534,96 540,96" fill="#16a34a"/>
        <text x="542" y="130" font-family="Inter" font-size="6.5" font-weight="600" fill="#166534">MQTT Telemetry / State</text>

        <!-- Edge <-> Physical -->
        <line x1="232" y1="222" x2="232" y2="302" stroke="#475569" stroke-width="1.5"/>
        <polygon points="232,222 229,230 235,230" fill="#475569"/>
        <text x="237" y="260" font-family="Inter" font-size="6.5" font-weight="600" fill="#334155">UART 115,200 Baud / #WT:..$ Frame</text>

        <line x1="517" y1="222" x2="517" y2="302" stroke="#dc2626" stroke-width="1.5"/>
        <polygon points="517,302 514,294 520,294" fill="#dc2626"/>
        <text x="522" y="260" font-family="Inter" font-size="6.5" font-weight="600" fill="#b91c1c">Actuation Commands (@CMD:..$)</text>
      </svg>
    </div>

    <div class="info-grid">
      <div class="info-box">
        <h5>Cloud Master Layer</h5>
        <p>Central identity authority, multi-tenant RBAC, permanent transaction ledger, and real-time Socket.IO notification broadcaster.</p>
      </div>
      <div class="info-box green">
        <h5>Edge Autonomous Daemon</h5>
        <p>FastAPI Python service running 7-stage FSM safety checks, local ANPR computer vision, and offline store-and-forward sync.</p>
      </div>
      <div class="info-box purple">
        <h5>Physical OT Controller</h5>
        <p>PIC18F45K22 bare-metal microcontroller executing 100ms framing, opto-isolated photogates, load cells, and fail-safe relay locks.</p>
      </div>
    </div>
  </div>

  <!-- PAGE 2: COMPLETE USE CASE DIAGRAM -->
  <div class="page-break">
    <div class="section-header">
      <div class="section-tag">Diagram 02 — Behavioral Modeling</div>
      <h2 class="section-title">Complete UML Use Case Diagram</h2>
      <p class="section-desc">Actors, core business functions, automated lane interactions, and cryptographic reconciliation workflows.</p>
    </div>

    <div class="diagram-wrapper">
      <svg viewBox="0 0 740 430" width="740" height="430" xmlns="http://www.w3.org/2000/svg">
        <!-- System Boundary -->
        <rect x="130" y="10" width="480" height="410" rx="8" fill="#ffffff" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4,4"/>
        <text x="145" y="28" font-family="Inter" font-size="9" font-weight="700" fill="#475569">Weighbridge & Access Control System Boundary</text>

        <!-- Left Actors -->
        <!-- Transporter Actor -->
        <circle cx="55" cy="65" r="12" fill="#dbeafe" stroke="#2563eb" stroke-width="1.5"/>
        <line x1="55" y1="77" x2="55" y2="105" stroke="#2563eb" stroke-width="1.5"/>
        <line x1="35" y1="87" x2="75" y2="87" stroke="#2563eb" stroke-width="1.5"/>
        <line x1="55" y1="105" x2="40" y2="125" stroke="#2563eb" stroke-width="1.5"/>
        <line x1="55" y1="105" x2="70" y2="125" stroke="#2563eb" stroke-width="1.5"/>
        <text x="55" y="140" font-family="Inter" font-size="8" font-weight="700" text-anchor="middle" fill="#1e293b">Transporter</text>

        <!-- Weighbridge Operator Actor -->
        <circle cx="55" cy="205" r="12" fill="#dcfce7" stroke="#16a34a" stroke-width="1.5"/>
        <line x1="55" y1="217" x2="55" y2="245" stroke="#16a34a" stroke-width="1.5"/>
        <line x1="35" y1="227" x2="75" y2="227" stroke="#16a34a" stroke-width="1.5"/>
        <line x1="55" y1="245" x2="40" y2="265" stroke="#16a34a" stroke-width="1.5"/>
        <line x1="55" y1="245" x2="70" y2="265" stroke="#16a34a" stroke-width="1.5"/>
        <text x="55" y="280" font-family="Inter" font-size="8" font-weight="700" text-anchor="middle" fill="#1e293b">Operator</text>

        <!-- Platform Admin Actor -->
        <circle cx="55" cy="335" r="12" fill="#f3e8ff" stroke="#7c3aed" stroke-width="1.5"/>
        <line x1="55" y1="347" x2="55" y2="375" stroke="#7c3aed" stroke-width="1.5"/>
        <line x1="35" y1="357" x2="75" y2="357" stroke="#7c3aed" stroke-width="1.5"/>
        <line x1="55" y1="375" x2="40" y2="395" stroke="#7c3aed" stroke-width="1.5"/>
        <line x1="55" y1="375" x2="70" y2="395" stroke="#7c3aed" stroke-width="1.5"/>
        <text x="55" y="410" font-family="Inter" font-size="8" font-weight="700" text-anchor="middle" fill="#1e293b">Platform Admin</text>

        <!-- Right Actors -->
        <!-- Driver Actor -->
        <circle cx="680" cy="85" r="12" fill="#fef3c7" stroke="#d97706" stroke-width="1.5"/>
        <line x1="680" y1="97" x2="680" y2="125" stroke="#d97706" stroke-width="1.5"/>
        <line x1="660" y1="107" x2="700" y2="107" stroke="#d97706" stroke-width="1.5"/>
        <line x1="680" y1="125" x2="665" y2="145" stroke="#d97706" stroke-width="1.5"/>
        <line x1="680" y1="125" x2="695" y2="145" stroke="#d97706" stroke-width="1.5"/>
        <text x="680" y="160" font-family="Inter" font-size="8" font-weight="700" text-anchor="middle" fill="#1e293b">Truck Driver</text>

        <!-- Edge Daemon (System Actor) -->
        <rect x="640" y="215" width="80" height="40" rx="4" fill="#fee2e2" stroke="#dc2626" stroke-width="1.5"/>
        <text x="680" y="233" font-family="Inter" font-size="7.5" font-weight="700" text-anchor="middle" fill="#991b1b">&lt;&lt;System&gt;&gt;</text>
        <text x="680" y="246" font-family="Inter" font-size="7.5" font-weight="700" text-anchor="middle" fill="#991b1b">Edge Daemon</text>

        <!-- Cloud Ledger Actor -->
        <rect x="640" y="325" width="80" height="40" rx="4" fill="#ede9fe" stroke="#6d28d9" stroke-width="1.5"/>
        <text x="680" y="343" font-family="Inter" font-size="7.5" font-weight="700" text-anchor="middle" fill="#5b21b6">&lt;&lt;Service&gt;&gt;</text>
        <text x="680" y="356" font-family="Inter" font-size="7.5" font-weight="700" text-anchor="middle" fill="#5b21b6">Cloud Master</text>

        <!-- Use Cases (Ellipses) -->
        <!-- Booking Subsystem -->
        <ellipse cx="230" cy="55" rx="75" ry="18" fill="#eff6ff" stroke="#3b82f6" stroke-width="1.2"/>
        <text x="230" y="58" font-family="Inter" font-size="7.5" font-weight="600" text-anchor="middle" fill="#1e3a8a">Create & Schedule Booking</text>

        <ellipse cx="230" cy="100" rx="70" ry="17" fill="#eff6ff" stroke="#3b82f6" stroke-width="1.2"/>
        <text x="230" y="103" font-family="Inter" font-size="7.5" font-weight="600" text-anchor="middle" fill="#1e3a8a">Manage Fleet & Drivers</text>

        <ellipse cx="400" cy="55" rx="70" ry="18" fill="#eff6ff" stroke="#3b82f6" stroke-width="1.2"/>
        <text x="400" y="58" font-family="Inter" font-size="7.5" font-weight="600" text-anchor="middle" fill="#1e3a8a">Issue Journey Token</text>

        <!-- Weighment Subsystem -->
        <ellipse cx="230" cy="165" rx="75" ry="18" fill="#f0fdf4" stroke="#16a34a" stroke-width="1.2"/>
        <text x="230" y="168" font-family="Inter" font-size="7.5" font-weight="600" text-anchor="middle" fill="#166534">ANPR Plate & RFID Auth</text>

        <ellipse cx="400" cy="140" rx="75" ry="18" fill="#f0fdf4" stroke="#16a34a" stroke-width="1.2"/>
        <text x="400" y="143" font-family="Inter" font-size="7.5" font-weight="600" text-anchor="middle" fill="#166534">Position & Stability Check</text>

        <ellipse cx="400" cy="195" rx="75" ry="18" fill="#f0fdf4" stroke="#16a34a" stroke-width="1.2"/>
        <text x="400" y="198" font-family="Inter" font-size="7.5" font-weight="600" text-anchor="middle" fill="#166534">Capture & Verify Weight</text>

        <ellipse cx="530" cy="110" rx="65" ry="17" fill="#fef3c7" stroke="#d97706" stroke-width="1.2"/>
        <text x="530" y="113" font-family="Inter" font-size="7.5" font-weight="600" text-anchor="middle" fill="#92400e">Confirm Kiosk Load</text>

        <!-- Security & Audit Subsystem -->
        <ellipse cx="230" cy="245" rx="75" ry="18" fill="#fee2e2" stroke="#dc2626" stroke-width="1.2"/>
        <text x="230" y="248" font-family="Inter" font-size="7.5" font-weight="600" text-anchor="middle" fill="#991b1b">Overload & Fraud Alerts</text>

        <ellipse cx="400" cy="255" rx="75" ry="18" fill="#fee2e2" stroke="#dc2626" stroke-width="1.2"/>
        <text x="400" y="258" font-family="Inter" font-size="7.5" font-weight="600" text-anchor="middle" fill="#991b1b">Manual Barrier Override</text>

        <ellipse cx="400" cy="315" rx="75" ry="18" fill="#ede9fe" stroke="#7c3aed" stroke-width="1.2"/>
        <text x="400" y="318" font-family="Inter" font-size="7.5" font-weight="600" text-anchor="middle" fill="#5b21b6">SHA-256 Hash Chain Sync</text>

        <ellipse cx="230" cy="335" rx="75" ry="18" fill="#f1f5f9" stroke="#64748b" stroke-width="1.2"/>
        <text x="230" y="338" font-family="Inter" font-size="7.5" font-weight="600" text-anchor="middle" fill="#334155">Print Thermal Waybill</text>

        <ellipse cx="230" cy="385" rx="75" ry="18" fill="#f3e8ff" stroke="#7c3aed" stroke-width="1.2"/>
        <text x="230" y="388" font-family="Inter" font-size="7.5" font-weight="600" text-anchor="middle" fill="#5b21b6">Configure RBAC & Policies</text>

        <!-- Association Lines -->
        <!-- Transporter Links -->
        <line x1="75" y1="85" x2="158" y2="60" stroke="#94a3b8" stroke-width="1.2"/>
        <line x1="75" y1="85" x2="162" y2="95" stroke="#94a3b8" stroke-width="1.2"/>

        <!-- Operator Links -->
        <line x1="75" y1="230" x2="158" y2="170" stroke="#94a3b8" stroke-width="1.2"/>
        <line x1="75" y1="230" x2="160" y2="240" stroke="#94a3b8" stroke-width="1.2"/>
        <line x1="75" y1="230" x2="330" y2="255" stroke="#94a3b8" stroke-width="1.2"/>
        <line x1="75" y1="230" x2="160" y2="330" stroke="#94a3b8" stroke-width="1.2"/>

        <!-- Admin Links -->
        <line x1="75" y1="365" x2="160" y2="380" stroke="#94a3b8" stroke-width="1.2"/>
        <line x1="75" y1="365" x2="165" y2="255" stroke="#94a3b8" stroke-width="1.2"/>

        <!-- Driver Links -->
        <line x1="660" y1="105" x2="472" y2="110" stroke="#94a3b8" stroke-width="1.2"/>
        <line x1="660" y1="105" x2="300" y2="160" stroke="#94a3b8" stroke-width="1.2"/>

        <!-- Edge Daemon Links -->
        <line x1="640" y1="235" x2="303" y2="170" stroke="#dc2626" stroke-width="1.2"/>
        <line x1="640" y1="235" x2="472" y2="145" stroke="#dc2626" stroke-width="1.2"/>
        <line x1="640" y1="235" x2="472" y2="195" stroke="#dc2626" stroke-width="1.2"/>
        <line x1="640" y1="235" x2="472" y2="310" stroke="#dc2626" stroke-width="1.2"/>

        <!-- Cloud Master Links -->
        <line x1="640" y1="345" x2="475" y2="320" stroke="#6d28d9" stroke-width="1.2"/>

        <!-- Include / Extend Relations (Dashed) -->
        <line x1="305" y1="55" x2="330" y2="55" stroke="#3b82f6" stroke-width="1" stroke-dasharray="2,2"/>
        <text x="318" y="50" font-family="Inter" font-size="6" text-anchor="middle" fill="#2563eb">&lt;&lt;include&gt;&gt;</text>

        <line x1="400" y1="158" x2="400" y2="177" stroke="#16a34a" stroke-width="1" stroke-dasharray="2,2"/>
        <text x="420" y="170" font-family="Inter" font-size="6" text-anchor="middle" fill="#16a34a">&lt;&lt;include&gt;&gt;</text>
      </svg>
    </div>

    <div class="info-grid-2">
      <div class="info-box">
        <h5>Key Operational Actors</h5>
        <p><strong>Transporter:</strong> Books truck journey tokens. <strong>Operator:</strong> Supervises live scale deck & resolves alerts. <strong>Driver:</strong> Verifies RFID & accepts load at kiosk.</p>
      </div>
      <div class="info-box purple">
        <h5>Autonomous System Actors</h5>
        <p><strong>Edge Daemon:</strong> Interlocks optical beams, executes ANPR OCR consensus, and drives relay outputs. <strong>Cloud Master:</strong> Verifies cryptographic hash chains and recalculates overloads.</p>
      </div>
    </div>
  </div>

  <!-- PAGE 3: ENTITY RELATIONSHIP DIAGRAM (ERD) -->
  <div class="page-break">
    <div class="section-header">
      <div class="section-tag">Diagram 03 — Data Architecture</div>
      <h2 class="section-title">Relational Entity Relationship Diagram (ERD)</h2>
      <p class="section-desc">Complete multi-tenant PostgreSQL schema (Prisma ORM) mapped to offline Edge SQLite ledger tables.</p>
    </div>

    <div class="diagram-wrapper">
      <svg viewBox="0 0 740 460" width="740" height="460" xmlns="http://www.w3.org/2000/svg">
        <!-- Entities Definition -->

        <!-- 1. ORGANISATION -->
        <g transform="translate(10, 10)">
          <rect width="135" height="105" rx="4" fill="#ffffff" stroke="#1e40af" stroke-width="1.2"/>
          <rect width="135" height="18" rx="4" fill="#1e40af"/>
          <text x="67" y="13" font-family="Inter" font-size="8" font-weight="700" fill="#ffffff" text-anchor="middle">Organisation</text>
          <text x="6" y="30" font-family="JetBrains Mono" font-size="6.5" font-weight="600" fill="#1e40af">PK id: UUID</text>
          <text x="6" y="42" font-family="JetBrains Mono" font-size="6.5" fill="#334155">name: String</text>
          <text x="6" y="54" font-family="JetBrains Mono" font-size="6.5" fill="#334155">code: String (UQ)</text>
          <text x="6" y="66" font-family="JetBrains Mono" font-size="6.5" fill="#334155">type: OrgType</text>
          <text x="6" y="78" font-family="JetBrains Mono" font-size="6.5" fill="#334155">status: ClientStatus</text>
          <text x="6" y="90" font-family="JetBrains Mono" font-size="6.5" fill="#334155">taxNumber: String</text>
          <text x="6" y="102" font-family="JetBrains Mono" font-size="6.5" fill="#334155">isActive: Boolean</text>
        </g>

        <!-- 2. USER -->
        <g transform="translate(160, 10)">
          <rect width="135" height="105" rx="4" fill="#ffffff" stroke="#1e40af" stroke-width="1.2"/>
          <rect width="135" height="18" rx="4" fill="#1e40af"/>
          <text x="67" y="13" font-family="Inter" font-size="8" font-weight="700" fill="#ffffff" text-anchor="middle">User</text>
          <text x="6" y="30" font-family="JetBrains Mono" font-size="6.5" font-weight="600" fill="#1e40af">PK id: UUID</text>
          <text x="6" y="42" font-family="JetBrains Mono" font-size="6.5" fill="#2563eb">FK organisationId</text>
          <text x="6" y="54" font-family="JetBrains Mono" font-size="6.5" fill="#334155">email: String (UQ)</text>
          <text x="6" y="66" font-family="JetBrains Mono" font-size="6.5" fill="#334155">passwordHash: String</text>
          <text x="6" y="78" font-family="JetBrains Mono" font-size="6.5" fill="#334155">role: UserRole</text>
          <text x="6" y="90" font-family="JetBrains Mono" font-size="6.5" fill="#334155">platformRole: String</text>
          <text x="6" y="102" font-family="JetBrains Mono" font-size="6.5" fill="#334155">status: UserStatus</text>
        </g>

        <!-- 3. ROLE & PERMISSION -->
        <g transform="translate(310, 10)">
          <rect width="135" height="95" rx="4" fill="#ffffff" stroke="#7c3aed" stroke-width="1.2"/>
          <rect width="135" height="18" rx="4" fill="#7c3aed"/>
          <text x="67" y="13" font-family="Inter" font-size="8" font-weight="700" fill="#ffffff" text-anchor="middle">Role / Permission</text>
          <text x="6" y="30" font-family="JetBrains Mono" font-size="6.5" font-weight="600" fill="#7c3aed">PK id: UUID</text>
          <text x="6" y="42" font-family="JetBrains Mono" font-size="6.5" fill="#334155">name: String</text>
          <text x="6" y="54" font-family="JetBrains Mono" font-size="6.5" fill="#334155">isBuiltIn: Boolean</text>
          <text x="6" y="66" font-family="JetBrains Mono" font-size="6.5" fill="#6d28d9">M:N RolePermission</text>
          <text x="6" y="78" font-family="JetBrains Mono" font-size="6.5" fill="#6d28d9">key: String (UQ)</text>
          <text x="6" y="90" font-family="JetBrains Mono" font-size="6.5" fill="#334155">category: String</text>
        </g>

        <!-- 4. SITE & SITECONFIG -->
        <g transform="translate(10, 140)">
          <rect width="135" height="120" rx="4" fill="#ffffff" stroke="#0d9488" stroke-width="1.2"/>
          <rect width="135" height="18" rx="4" fill="#0d9488"/>
          <text x="67" y="13" font-family="Inter" font-size="8" font-weight="700" fill="#ffffff" text-anchor="middle">Site & SiteConfig</text>
          <text x="6" y="30" font-family="JetBrains Mono" font-size="6.5" font-weight="600" fill="#0d9488">PK id: UUID</text>
          <text x="6" y="42" font-family="JetBrains Mono" font-size="6.5" fill="#2563eb">FK organisationId</text>
          <text x="6" y="54" font-family="JetBrains Mono" font-size="6.5" fill="#334155">code: String (UQ)</text>
          <text x="6" y="66" font-family="JetBrains Mono" font-size="6.5" fill="#334155">topology: Topology</text>
          <text x="6" y="78" font-family="JetBrains Mono" font-size="6.5" fill="#334155">maxCapacityKg: Int</text>
          <text x="6" y="90" font-family="JetBrains Mono" font-size="6.5" fill="#334155">stabilityThreshold: 20kg</text>
          <text x="6" y="102" font-family="JetBrains Mono" font-size="6.5" fill="#334155">overloadTolerance: 5%</text>
          <text x="6" y="114" font-family="JetBrains Mono" font-size="6.5" fill="#334155">holdSeconds: 2s</text>
        </g>

        <!-- 5. VEHICLE & TRAILER -->
        <g transform="translate(160, 140)">
          <rect width="135" height="120" rx="4" fill="#ffffff" stroke="#2563eb" stroke-width="1.2"/>
          <rect width="135" height="18" rx="4" fill="#2563eb"/>
          <text x="67" y="13" font-family="Inter" font-size="8" font-weight="700" fill="#ffffff" text-anchor="middle">Vehicle & Trailer</text>
          <text x="6" y="30" font-family="JetBrains Mono" font-size="6.5" font-weight="600" fill="#2563eb">PK id: UUID</text>
          <text x="6" y="42" font-family="JetBrains Mono" font-size="6.5" fill="#2563eb">FK organisationId</text>
          <text x="6" y="54" font-family="JetBrains Mono" font-size="6.5" fill="#334155">plate: String</text>
          <text x="6" y="66" font-family="JetBrains Mono" font-size="6.5" fill="#334155">plateNormalized (UQ)</text>
          <text x="6" y="78" font-family="JetBrains Mono" font-size="6.5" fill="#334155">tareWeightKg: Int</text>
          <text x="6" y="90" font-family="JetBrains Mono" font-size="6.5" fill="#334155">legalMaxGvwKg: Int</text>
          <text x="6" y="102" font-family="JetBrains Mono" font-size="6.5" fill="#334155">insuranceExpiry: Date</text>
          <text x="6" y="114" font-family="JetBrains Mono" font-size="6.5" fill="#334155">anomalyScore: Decimal</text>
        </g>

        <!-- 6. DRIVER -->
        <g transform="translate(310, 140)">
          <rect width="135" height="105" rx="4" fill="#ffffff" stroke="#2563eb" stroke-width="1.2"/>
          <rect width="135" height="18" rx="4" fill="#2563eb"/>
          <text x="67" y="13" font-family="Inter" font-size="8" font-weight="700" fill="#ffffff" text-anchor="middle">Driver</text>
          <text x="6" y="30" font-family="JetBrains Mono" font-size="6.5" font-weight="600" fill="#2563eb">PK id: UUID</text>
          <text x="6" y="42" font-family="JetBrains Mono" font-size="6.5" fill="#2563eb">FK organisationId</text>
          <text x="6" y="54" font-family="JetBrains Mono" font-size="6.5" fill="#334155">firstName, lastName</text>
          <text x="6" y="66" font-family="JetBrains Mono" font-size="6.5" fill="#334155">rfidTag: String (UQ)</text>
          <text x="6" y="78" font-family="JetBrains Mono" font-size="6.5" fill="#334155">licenceNumber: String</text>
          <text x="6" y="90" font-family="JetBrains Mono" font-size="6.5" fill="#334155">licenceExpiry: Date</text>
          <text x="6" y="102" font-family="JetBrains Mono" font-size="6.5" fill="#334155">blacklistStatus: Bool</text>
        </g>

        <!-- 7. BOOKING -->
        <g transform="translate(460, 10)">
          <rect width="135" height="135" rx="4" fill="#ffffff" stroke="#d97706" stroke-width="1.2"/>
          <rect width="135" height="18" rx="4" fill="#d97706"/>
          <text x="67" y="13" font-family="Inter" font-size="8" font-weight="700" fill="#ffffff" text-anchor="middle">Booking</text>
          <text x="6" y="30" font-family="JetBrains Mono" font-size="6.5" font-weight="600" fill="#d97706">PK id: UUID</text>
          <text x="6" y="42" font-family="JetBrains Mono" font-size="6.5" fill="#2563eb">FK siteId, vehicleId</text>
          <text x="6" y="54" font-family="JetBrains Mono" font-size="6.5" fill="#2563eb">FK driverId, trailerId</text>
          <text x="6" y="66" font-family="JetBrains Mono" font-size="6.5" fill="#334155">reference: String</text>
          <text x="6" y="78" font-family="JetBrains Mono" font-size="6.5" fill="#334155">journeyToken: String</text>
          <text x="6" y="90" font-family="JetBrains Mono" font-size="6.5" fill="#334155">commodity: String</text>
          <text x="6" y="102" font-family="JetBrains Mono" font-size="6.5" fill="#334155">targetTonnageKg: Int</text>
          <text x="6" y="114" font-family="JetBrains Mono" font-size="6.5" fill="#334155">windowStart, End</text>
          <text x="6" y="126" font-family="JetBrains Mono" font-size="6.5" fill="#334155">status: BookingStatus</text>
        </g>

        <!-- 8. WEIGHBRIDGE TRANSACTION (CORE LEDGER) -->
        <g transform="translate(460, 160)">
          <rect width="135" height="155" rx="4" fill="#ffffff" stroke="#16a34a" stroke-width="1.5"/>
          <rect width="135" height="18" rx="4" fill="#16a34a"/>
          <text x="67" y="13" font-family="Inter" font-size="8" font-weight="700" fill="#ffffff" text-anchor="middle">WeighbridgeTransaction</text>
          <text x="6" y="30" font-family="JetBrains Mono" font-size="6.5" font-weight="600" fill="#16a34a">PK id: UUID</text>
          <text x="6" y="42" font-family="JetBrains Mono" font-size="6.5" fill="#2563eb">FK bookingId, siteId</text>
          <text x="6" y="54" font-family="JetBrains Mono" font-size="6.5" fill="#2563eb">FK vehicleId, driverId</text>
          <text x="6" y="66" font-family="JetBrains Mono" font-size="6.5" fill="#334155">grossWeightKg: Int</text>
          <text x="6" y="78" font-family="JetBrains Mono" font-size="6.5" fill="#334155">tareWeightKg: Int</text>
          <text x="6" y="90" font-family="JetBrains Mono" font-size="6.5" fill="#334155">netWeightKg: Int</text>
          <text x="6" y="102" font-family="JetBrains Mono" font-size="6.5" fill="#334155">waybillNumber (UQ)</text>
          <text x="6" y="114" font-family="JetBrains Mono" font-size="6.5" font-weight="600" fill="#166534">previousHash: SHA256</text>
          <text x="6" y="126" font-family="JetBrains Mono" font-size="6.5" font-weight="600" fill="#166534">integrityHash (UQ)</text>
          <text x="6" y="138" font-family="JetBrains Mono" font-size="6.5" fill="#334155">confirmationHash</text>
          <text x="6" y="150" font-family="JetBrains Mono" font-size="6.5" fill="#334155">status, syncStatus</text>
        </g>

        <!-- 9. INCIDENT & FRAUD -->
        <g transform="translate(605, 10)">
          <rect width="125" height="120" rx="4" fill="#ffffff" stroke="#dc2626" stroke-width="1.2"/>
          <rect width="125" height="18" rx="4" fill="#dc2626"/>
          <text x="62" y="13" font-family="Inter" font-size="8" font-weight="700" fill="#ffffff" text-anchor="middle">Incident & Fraud</text>
          <text x="6" y="30" font-family="JetBrains Mono" font-size="6.5" font-weight="600" fill="#dc2626">PK id: UUID</text>
          <text x="6" y="42" font-family="JetBrains Mono" font-size="6.5" fill="#2563eb">FK siteId, transactionId</text>
          <text x="6" y="54" font-family="JetBrains Mono" font-size="6.5" fill="#334155">type: IncidentType</text>
          <text x="6" y="66" font-family="JetBrains Mono" font-size="6.5" fill="#334155">severity: Severity</text>
          <text x="6" y="78" font-family="JetBrains Mono" font-size="6.5" fill="#334155">anomalyScore: Float</text>
          <text x="6" y="90" font-family="JetBrains Mono" font-size="6.5" fill="#334155">evidenceUrls: Text[]</text>
          <text x="6" y="102" font-family="JetBrains Mono" font-size="6.5" fill="#334155">status: IncidentStatus</text>
          <text x="6" y="114" font-family="JetBrains Mono" font-size="6.5" fill="#334155">resolvedAt, By</text>
        </g>

        <!-- 10. HARDWARE & SERVICE ORDER -->
        <g transform="translate(605, 160)">
          <rect width="125" height="120" rx="4" fill="#ffffff" stroke="#475569" stroke-width="1.2"/>
          <rect width="125" height="18" rx="4" fill="#475569"/>
          <text x="62" y="13" font-family="Inter" font-size="8" font-weight="700" fill="#ffffff" text-anchor="middle">Hardware & Status</text>
          <text x="6" y="30" font-family="JetBrains Mono" font-size="6.5" font-weight="600" fill="#475569">PK id: UUID</text>
          <text x="6" y="42" font-family="JetBrains Mono" font-size="6.5" fill="#2563eb">FK siteId, laneId</text>
          <text x="6" y="54" font-family="JetBrains Mono" font-size="6.5" fill="#334155">deviceType: DeviceType</text>
          <text x="6" y="66" font-family="JetBrains Mono" font-size="6.5" fill="#334155">health: HealthStatus</text>
          <text x="6" y="78" font-family="JetBrains Mono" font-size="6.5" fill="#334155">sensorReadings: JSON</text>
          <text x="6" y="90" font-family="JetBrains Mono" font-size="6.5" fill="#334155">connectivity: JSON</text>
          <text x="6" y="102" font-family="JetBrains Mono" font-size="6.5" fill="#334155">calibrationExpiry</text>
          <text x="6" y="114" font-family="JetBrains Mono" font-size="6.5" fill="#334155">lastSeen: DateTime</text>
        </g>

        <!-- 11. EDGE SQLITE SCHEMA (OFFLINE MIRROR) -->
        <g transform="translate(10, 335)">
          <rect width="720" height="115" rx="6" fill="#f8fafc" stroke="#15803d" stroke-width="1.2" stroke-dasharray="3,3"/>
          <rect width="720" height="18" rx="4" fill="#15803d"/>
          <text x="360" y="13" font-family="Inter" font-size="8" font-weight="700" fill="#ffffff" text-anchor="middle">Edge SQLite Local Ledger & Store-and-Forward Tables (apps/site-daemon/database.py)</text>

          <rect x="25" y="28" width="150" height="75" rx="3" fill="#ffffff" stroke="#cbd5e1"/>
          <text x="100" y="40" font-family="Inter" font-size="7" font-weight="700" text-anchor="middle" fill="#166534">cached_bookings</text>
          <text x="32" y="52" font-family="JetBrains Mono" font-size="6" fill="#334155">PK id (UUID)</text>
          <text x="32" y="62" font-family="JetBrains Mono" font-size="6" fill="#334155">plate_normalized</text>
          <text x="32" y="72" font-family="JetBrains Mono" font-size="6" fill="#334155">window_start, end</text>
          <text x="32" y="82" font-family="JetBrains Mono" font-size="6" fill="#334155">payload_json (TEXT)</text>
          <text x="32" y="92" font-family="JetBrains Mono" font-size="6" fill="#334155">cached_at (ISO)</text>

          <rect x="190" y="28" width="165" height="75" rx="3" fill="#ffffff" stroke="#cbd5e1"/>
          <text x="272" y="40" font-family="Inter" font-size="7" font-weight="700" text-anchor="middle" fill="#166534">transactions (Local Ledger)</text>
          <text x="197" y="52" font-family="JetBrains Mono" font-size="6" fill="#334155">PK edge_transaction_id</text>
          <text x="197" y="62" font-family="JetBrains Mono" font-size="6" fill="#334155">gross, tare, net_kg</text>
          <text x="197" y="72" font-family="JetBrains Mono" font-size="6" fill="#334155">waybill_number (UQ)</text>
          <text x="197" y="82" font-family="JetBrains Mono" font-size="6" font-weight="600" fill="#15803d">previous_hash, integrity_hash</text>
          <text x="197" y="92" font-family="JetBrains Mono" font-size="6" fill="#334155">sync_status: pending|synced</text>

          <rect x="370" y="28" width="165" height="75" rx="3" fill="#ffffff" stroke="#cbd5e1"/>
          <text x="452" y="40" font-family="Inter" font-size="7" font-weight="700" text-anchor="middle" fill="#166534">sync_queue (Idempotent)</text>
          <text x="377" y="52" font-family="JetBrains Mono" font-size="6" fill="#334155">PK id (AUTOINCREMENT)</text>
          <text x="377" y="62" font-family="JetBrains Mono" font-size="6" fill="#334155">operation: reconcile|upload</text>
          <text x="377" y="72" font-family="JetBrains Mono" font-size="6" font-weight="600" fill="#15803d">idempotency_key (UQ)</text>
          <text x="377" y="82" font-family="JetBrains Mono" font-size="6" fill="#334155">payload_json, retry_count</text>
          <text x="377" y="92" font-family="JetBrains Mono" font-size="6" fill="#334155">next_retry_at (Backoff)</text>

          <rect x="550" y="28" width="145" height="75" rx="3" fill="#ffffff" stroke="#cbd5e1"/>
          <text x="622" y="40" font-family="Inter" font-size="7" font-weight="700" text-anchor="middle" fill="#166534">metadata & sessions</text>
          <text x="557" y="52" font-family="JetBrains Mono" font-size="6" fill="#334155">key: 'last_hash' (Genesis)</text>
          <text x="557" y="62" font-family="JetBrains Mono" font-size="6" fill="#334155">key: 'waybill_sequence'</text>
          <text x="557" y="72" font-family="JetBrains Mono" font-size="6" fill="#334155">incomplete_sessions</text>
          <text x="557" y="82" font-family="JetBrains Mono" font-size="6" fill="#334155">context_json, state</text>
          <text x="557" y="92" font-family="JetBrains Mono" font-size="6" fill="#334155">PRAGMA journal_mode=WAL</text>
        </g>

        <!-- Cardinality Lines -->
        <!-- Org -> User (1:N) -->
        <path d="M 145 40 L 160 40" stroke="#94a3b8" stroke-width="1.2"/>
        <!-- Org -> Site (1:N) -->
        <path d="M 77 115 L 77 140" stroke="#94a3b8" stroke-width="1.2"/>
        <!-- Org -> Vehicle (1:N) -->
        <path d="M 145 70 L 152 70 L 152 180 L 160 180" stroke="#94a3b8" stroke-width="1.2" fill="none"/>
        <!-- Site -> Booking (1:N) -->
        <path d="M 145 190 L 460 70" stroke="#94a3b8" stroke-width="1.2" stroke-dasharray="2,2"/>
        <!-- Booking -> Transaction (1:1) -->
        <path d="M 527 145 L 527 160" stroke="#16a34a" stroke-width="1.5"/>
        <!-- Transaction -> Incident (1:N) -->
        <path d="M 595 200 L 605 80" stroke="#dc2626" stroke-width="1.2"/>
      </svg>
    </div>

    <div class="info-grid">
      <div class="info-box">
        <h5>Multi-Tenant Isolation</h5>
        <p>All vehicles, bookings, orders, and roles partition by <code>organisationId</code> with strict client role policies.</p>
      </div>
      <div class="info-box green">
        <h5>SHA-256 Tamper Evidence</h5>
        <p><code>WeighbridgeTransaction</code> enforces an unbroken cryptographic chain linking <code>previousHash</code> to current hash.</p>
      </div>
      <div class="info-box amber">
        <h5>Store-and-Forward Sync</h5>
        <p>SQLite <code>sync_queue</code> enforces unique idempotency keys, eliminating duplicate reconciliation on network recovery.</p>
      </div>
    </div>
  </div>

  <!-- PAGE 4: CLASS DIAGRAM -->
  <div class="page-break">
    <div class="section-header">
      <div class="section-tag">Diagram 04 — Object-Oriented Architecture</div>
      <h2 class="section-title">Core Backend UML Class Diagram</h2>
      <p class="section-desc">Class hierarchies, interface definitions, service contracts, and edge daemon controller components.</p>
    </div>

    <div class="diagram-wrapper">
      <svg viewBox="0 0 740 440" width="740" height="440" xmlns="http://www.w3.org/2000/svg">
        <!-- Edge Daemon Package -->
        <rect x="10" y="10" width="470" height="420" rx="8" fill="#ffffff" stroke="#15803d" stroke-width="1.5"/>
        <text x="25" y="28" font-family="Inter" font-size="9" font-weight="700" fill="#15803d">PACKAGE apps.site_daemon (Python / AsyncIO)</text>

        <!-- WeighingStateMachine Class -->
        <g transform="translate(25, 40)">
          <rect width="210" height="180" rx="4" fill="#ffffff" stroke="#16a34a" stroke-width="1.2"/>
          <rect width="210" height="18" rx="4" fill="#16a34a"/>
          <text x="105" y="13" font-family="Inter" font-size="8" font-weight="700" fill="#ffffff" text-anchor="middle">WeighingStateMachine</text>
          <text x="6" y="30" font-family="JetBrains Mono" font-size="6.5" fill="#334155">+ state: WeighingState</text>
          <text x="6" y="42" font-family="JetBrains Mono" font-size="6.5" fill="#334155">+ booking: ActiveBooking</text>
          <text x="6" y="54" font-family="JetBrains Mono" font-size="6.5" fill="#334155">+ weight_window: deque[tuple]</text>
          <text x="6" y="66" font-family="JetBrains Mono" font-size="6.5" fill="#334155">+ pending_gross_weight: int</text>
          <line x1="0" y1="74" x2="210" y2="74" stroke="#e2e8f0"/>
          <text x="6" y="86" font-family="JetBrains Mono" font-size="6.5" fill="#1e293b">+ process(frame: TelemetryFrame)</text>
          <text x="6" y="98" font-family="JetBrains Mono" font-size="6.5" fill="#1e293b">+ authorise(booking, anpr)</text>
          <text x="6" y="110" font-family="JetBrains Mono" font-size="6.5" fill="#1e293b">+ _is_stable(now: datetime): bool</text>
          <text x="6" y="122" font-family="JetBrains Mono" font-size="6.5" fill="#1e293b">+ _process_captured_weight(gross)</text>
          <text x="6" y="134" font-family="JetBrains Mono" font-size="6.5" fill="#1e293b">+ accept_load(): EdgeTransaction</text>
          <text x="6" y="146" font-family="JetBrains Mono" font-size="6.5" fill="#1e293b">+ request_reload(): void</text>
          <text x="6" y="158" font-family="JetBrains Mono" font-size="6.5" fill="#1e293b">+ _driver_mismatch(rfid)</text>
          <text x="6" y="170" font-family="JetBrains Mono" font-size="6.5" fill="#1e293b">+ reset(): void</text>
        </g>

        <!-- EdgeDatabase Class -->
        <g transform="translate(250, 40)">
          <rect width="215" height="180" rx="4" fill="#ffffff" stroke="#16a34a" stroke-width="1.2"/>
          <rect width="215" height="18" rx="4" fill="#16a34a"/>
          <text x="107" y="13" font-family="Inter" font-size="8" font-weight="700" fill="#ffffff" text-anchor="middle">EdgeDatabase</text>
          <text x="6" y="30" font-family="JetBrains Mono" font-size="6.5" fill="#334155">- path: Path</text>
          <text x="6" y="42" font-family="JetBrains Mono" font-size="6.5" fill="#334155">- backup_directory: Path</text>
          <text x="6" y="54" font-family="JetBrains Mono" font-size="6.5" fill="#334155">- _write_lock: RLock</text>
          <line x1="0" y1="62" x2="215" y2="62" stroke="#e2e8f0"/>
          <text x="6" y="74" font-family="JetBrains Mono" font-size="6.5" fill="#1e293b">+ create_transaction(...): EdgeTx</text>
          <text x="6" y="86" font-family="JetBrains Mono" font-size="6.5" fill="#1e293b">+ bootstrap_chain_head(hash): bool</text>
          <text x="6" y="98" font-family="JetBrains Mono" font-size="6.5" fill="#1e293b">+ cache_booking(booking)</text>
          <text x="6" y="110" font-family="JetBrains Mono" font-size="6.5" fill="#1e293b">+ find_active_booking(plate, site)</text>
          <text x="6" y="122" font-family="JetBrains Mono" font-size="6.5" fill="#1e293b">+ list_due_sync_items(limit)</text>
          <text x="6" y="134" font-family="JetBrains Mono" font-size="6.5" fill="#1e293b">+ mark_synced(item_id, conf_hash)</text>
          <text x="6" y="146" font-family="JetBrains Mono" font-size="6.5" fill="#1e293b">+ backup(): Path</text>
          <text x="6" y="158" font-family="JetBrains Mono" font-size="6.5" fill="#1e293b">+ incomplete_sessions(): list</text>
          <text x="6" y="170" font-family="JetBrains Mono" font-size="6.5" fill="#1e293b">+ store_incident(payload)</text>
        </g>

        <!-- AnprEngine Class -->
        <g transform="translate(25, 235)">
          <rect width="210" height="90" rx="4" fill="#ffffff" stroke="#16a34a" stroke-width="1.2"/>
          <rect width="210" height="18" rx="4" fill="#16a34a"/>
          <text x="105" y="13" font-family="Inter" font-size="8" font-weight="700" fill="#ffffff" text-anchor="middle">AnprEngine</text>
          <text x="6" y="30" font-family="JetBrains Mono" font-size="6.5" fill="#334155">- _reader: easyocr.Reader</text>
          <line x1="0" y1="36" x2="210" y2="36" stroke="#e2e8f0"/>
          <text x="6" y="48" font-family="JetBrains Mono" font-size="6.5" fill="#1e293b">+ preprocess(image): (thresh, edges)</text>
          <text x="6" y="60" font-family="JetBrains Mono" font-size="6.5" fill="#1e293b">+ plate_candidates(image): list</text>
          <text x="6" y="72" font-family="JetBrains Mono" font-size="6.5" fill="#1e293b">+ read_frame(image): (text, conf)</text>
          <text x="6" y="84" font-family="JetBrains Mono" font-size="6.5" fill="#1e293b">+ recognise(source): AnprResult</text>
        </g>

        <!-- SyncWorker & MqttService Class -->
        <g transform="translate(250, 235)">
          <rect width="215" height="90" rx="4" fill="#ffffff" stroke="#16a34a" stroke-width="1.2"/>
          <rect width="215" height="18" rx="4" fill="#16a34a"/>
          <text x="107" y="13" font-family="Inter" font-size="8" font-weight="700" fill="#ffffff" text-anchor="middle">SyncWorker & MqttService</text>
          <text x="6" y="30" font-family="JetBrains Mono" font-size="6.5" fill="#334155">+ cloud_online: bool</text>
          <text x="6" y="42" font-family="JetBrains Mono" font-size="6.5" fill="#334155">+ buffer: deque[tuple]</text>
          <line x1="0" y1="48" x2="215" y2="48" stroke="#e2e8f0"/>
          <text x="6" y="60" font-family="JetBrains Mono" font-size="6.5" fill="#1e293b">+ sync_once(client: httpx.Client)</text>
          <text x="6" y="72" font-family="JetBrains Mono" font-size="6.5" fill="#1e293b">+ publish(suffix, payload, qos)</text>
          <text x="6" y="84" font-family="JetBrains Mono" font-size="6.5" fill="#1e293b">+ handle_mqtt_command(payload)</text>
        </g>

        <!-- TelemetryParser -->
        <g transform="translate(25, 340)">
          <rect width="440" height="75" rx="4" fill="#ffffff" stroke="#16a34a" stroke-width="1.2"/>
          <rect width="440" height="18" rx="4" fill="#16a34a"/>
          <text x="220" y="13" font-family="Inter" font-size="8" font-weight="700" fill="#ffffff" text-anchor="middle">TelemetryParser & Protocol (protocol.py)</text>
          <text x="6" y="32" font-family="JetBrains Mono" font-size="6.5" fill="#334155">+ corrupt_frame_count: int | - _buffer: bytearray</text>
          <text x="6" y="46" font-family="JetBrains Mono" font-size="6.5" fill="#1e293b">+ feed(data: bytes): list[TelemetryFrame] | + parse_telemetry_frame(text: str): TelemetryFrame</text>
          <text x="6" y="60" font-family="JetBrains Mono" font-size="6.5" fill="#1e293b">+ build_command(action: str, target: str, value: str): bytes -> "@CMD:GATE_OPEN;TGT:ENTRY$\\r\\n"</text>
        </g>

        <!-- Cloud Services Package -->
        <rect x="495" y="10" width="235" height="420" rx="8" fill="#ffffff" stroke="#1e40af" stroke-width="1.5"/>
        <text x="510" y="28" font-family="Inter" font-size="9" font-weight="700" fill="#1e40af">PACKAGE apps.web.lib (TypeScript)</text>

        <!-- ReconciliationEngine -->
        <g transform="translate(505, 40)">
          <rect width="215" height="120" rx="4" fill="#ffffff" stroke="#2563eb" stroke-width="1.2"/>
          <rect width="215" height="18" rx="4" fill="#2563eb"/>
          <text x="107" y="13" font-family="Inter" font-size="8" font-weight="700" fill="#ffffff" text-anchor="middle">&lt;&lt;Service&gt;&gt; Reconciliation</text>
          <text x="6" y="32" font-family="JetBrains Mono" font-size="6.5" fill="#1e293b">+ computeEdgeIntegrityHash(input)</text>
          <text x="6" y="44" font-family="JetBrains Mono" font-size="6.5" fill="#1e293b">+ reconcileTransaction(input)</text>
          <text x="6" y="56" font-family="JetBrains Mono" font-size="6.5" fill="#1e293b">+ runSerializable(operation)</text>
          <text x="6" y="68" font-family="JetBrains Mono" font-size="6.5" fill="#64748b">// Enforces prior hash equality</text>
          <text x="6" y="80" font-family="JetBrains Mono" font-size="6.5" fill="#64748b">// Gross - Tare == Net verification</text>
          <text x="6" y="92" font-family="JetBrains Mono" font-size="6.5" fill="#64748b">// Overload variance calculation</text>
          <text x="6" y="104" font-family="JetBrains Mono" font-size="6.5" fill="#64748b">// Creates Incident on discrepancy</text>
        </g>

        <!-- FraudDetectionService -->
        <g transform="translate(505, 175)">
          <rect width="215" height="110" rx="4" fill="#ffffff" stroke="#dc2626" stroke-width="1.2"/>
          <rect width="215" height="18" rx="4" fill="#dc2626"/>
          <text x="107" y="13" font-family="Inter" font-size="8" font-weight="700" fill="#ffffff" text-anchor="middle">&lt;&lt;Service&gt;&gt; FraudDetection</text>
          <text x="6" y="32" font-family="JetBrains Mono" font-size="6.5" fill="#1e293b">+ runFraudChecks(transactionId)</text>
          <text x="6" y="44" font-family="JetBrains Mono" font-size="6.5" fill="#991b1b">- checkTareDrift(&gt;500kg)</text>
          <text x="6" y="56" font-family="JetBrains Mono" font-size="6.5" fill="#991b1b">- checkClonedPlate(travel &lt; 20m)</text>
          <text x="6" y="68" font-family="JetBrains Mono" font-size="6.5" fill="#991b1b">- checkRouteDeviation(&gt;24h)</text>
          <text x="6" y="80" font-family="JetBrains Mono" font-size="6.5" fill="#991b1b">- checkCrossSiteVariance(&gt;500kg)</text>
          <text x="6" y="92" font-family="JetBrains Mono" font-size="6.5" fill="#334155">+ incrementAnomalyScore(driver, veh)</text>
        </g>

        <!-- RBAC & Access Engine -->
        <g transform="translate(505, 300)">
          <rect width="215" height="115" rx="4" fill="#ffffff" stroke="#7c3aed" stroke-width="1.2"/>
          <rect width="215" height="18" rx="4" fill="#7c3aed"/>
          <text x="107" y="13" font-family="Inter" font-size="8" font-weight="700" fill="#ffffff" text-anchor="middle">&lt;&lt;Security&gt;&gt; Access & RBAC</text>
          <text x="6" y="32" font-family="JetBrains Mono" font-size="6.5" fill="#1e293b">+ requireRole(roles: UserRole[])</text>
          <text x="6" y="44" font-family="JetBrains Mono" font-size="6.5" fill="#1e293b">+ requirePermission(permKey: string)</text>
          <text x="6" y="56" font-family="JetBrains Mono" font-size="6.5" fill="#1e293b">+ requireSiteOrRole(request, roles)</text>
          <text x="6" y="68" font-family="JetBrains Mono" font-size="6.5" fill="#1e293b">+ isPlatformSuperAdmin(user): bool</text>
          <text x="6" y="80" font-family="JetBrains Mono" font-size="6.5" fill="#1e293b">+ assertOrganisationActive(org)</text>
          <text x="6" y="92" font-family="JetBrains Mono" font-size="6.5" fill="#1e293b">+ encryptSensitive / decryptSensitive</text>
          <text x="6" y="104" font-family="JetBrains Mono" font-size="6.5" fill="#1e293b">+ stableStringify(payload): string</text>
        </g>
      </svg>
    </div>

    <div class="info-grid">
      <div class="info-box green">
        <h5>State Machine Pattern</h5>
        <p>Edge daemon encapsulates state transitions, stability smoothing, and relay actuation inside deterministic classes.</p>
      </div>
      <div class="info-box">
        <h5>Transactional Isolation</h5>
        <p><code>Reconciliation</code> leverages Prisma serializable isolation and crypto hashes to ensure strictly monotonic audit chains.</p>
      </div>
      <div class="info-box red">
        <h5>Automated Anomaly Scoring</h5>
        <p><code>FraudDetection</code> updates real-time risk scores on vehicles and drivers upon detecting impossible inter-site velocities.</p>
      </div>
    </div>
  </div>

  <!-- PAGE 5: SEQUENCE DIAGRAM — NORMAL WEIGHMENT -->
  <div class="page-break">
    <div class="section-header">
      <div class="section-tag">Diagram 05 — Interaction Modeling</div>
      <h2 class="section-title">UML Sequence Diagram 1: Automated Normal Weighment Lifecycle</h2>
      <p class="section-desc">End-to-end event sequence: Vehicle entry, ANPR capture, optical beam hold, load cell capture, kiosk confirmation, and cloud hash reconciliation.</p>
    </div>

    <div class="diagram-wrapper">
      <svg viewBox="0 0 740 430" width="740" height="430" xmlns="http://www.w3.org/2000/svg">
        <!-- Lifelines Definition -->
        <!-- 1. Truck Driver -->
        <rect x="20" y="10" width="70" height="22" rx="3" fill="#fef3c7" stroke="#d97706" stroke-width="1.2"/>
        <text x="55" y="24" font-family="Inter" font-size="7.5" font-weight="700" text-anchor="middle" fill="#92400e">Driver/Truck</text>
        <line x1="55" y1="32" x2="55" y2="420" stroke="#d97706" stroke-width="1" stroke-dasharray="3,3"/>

        <!-- 2. Hardware / Sensors / MCU -->
        <rect x="110" y="10" width="80" height="22" rx="3" fill="#f1f5f9" stroke="#475569" stroke-width="1.2"/>
        <text x="150" y="24" font-family="Inter" font-size="7.5" font-weight="700" text-anchor="middle" fill="#334155">Sensors & MCU</text>
        <line x1="150" y1="32" x2="150" y2="420" stroke="#475569" stroke-width="1" stroke-dasharray="3,3"/>

        <!-- 3. ANPR Vision -->
        <rect x="210" y="10" width="75" height="22" rx="3" fill="#f0fdf4" stroke="#16a34a" stroke-width="1.2"/>
        <text x="247" y="24" font-family="Inter" font-size="7.5" font-weight="700" text-anchor="middle" fill="#166534">ANPR Engine</text>
        <line x1="247" y1="32" x2="247" y2="420" stroke="#16a34a" stroke-width="1" stroke-dasharray="3,3"/>

        <!-- 4. Edge State Machine -->
        <rect x="305" y="10" width="85" height="22" rx="3" fill="#f0fdf4" stroke="#16a34a" stroke-width="1.2"/>
        <text x="347" y="24" font-family="Inter" font-size="7.5" font-weight="700" text-anchor="middle" fill="#166534">Edge FSM</text>
        <line x1="347" y1="32" x2="347" y2="420" stroke="#16a34a" stroke-width="1" stroke-dasharray="3,3"/>

        <!-- 5. Edge SQLite -->
        <rect x="410" y="10" width="70" height="22" rx="3" fill="#f0fdf4" stroke="#16a34a" stroke-width="1.2"/>
        <text x="445" y="24" font-family="Inter" font-size="7.5" font-weight="700" text-anchor="middle" fill="#166534">Edge SQLite</text>
        <line x1="445" y1="32" x2="445" y2="420" stroke="#16a34a" stroke-width="1" stroke-dasharray="3,3"/>

        <!-- 6. Driver Kiosk -->
        <rect x="500" y="10" width="65" height="22" rx="3" fill="#fef3c7" stroke="#d97706" stroke-width="1.2"/>
        <text x="532" y="24" font-family="Inter" font-size="7.5" font-weight="700" text-anchor="middle" fill="#92400e">Kiosk UI</text>
        <line x1="532" y1="32" x2="532" y2="420" stroke="#d97706" stroke-width="1" stroke-dasharray="3,3"/>

        <!-- 7. Cloud Reconcile API -->
        <rect x="585" y="10" width="75" height="22" rx="3" fill="#eff6ff" stroke="#2563eb" stroke-width="1.2"/>
        <text x="622" y="24" font-family="Inter" font-size="7.5" font-weight="700" text-anchor="middle" fill="#1e3a8a">Cloud API</text>
        <line x1="622" y1="32" x2="622" y2="420" stroke="#2563eb" stroke-width="1" stroke-dasharray="3,3"/>

        <!-- 8. Web Dashboard -->
        <rect x="675" y="10" width="60" height="22" rx="3" fill="#eff6ff" stroke="#2563eb" stroke-width="1.2"/>
        <text x="705" y="24" font-family="Inter" font-size="7.5" font-weight="700" text-anchor="middle" fill="#1e3a8a">Operator</text>
        <line x1="705" y1="32" x2="705" y2="420" stroke="#2563eb" stroke-width="1" stroke-dasharray="3,3"/>

        <!-- Message Flow -->
        <!-- 1. Approach -->
        <line x1="55" y1="48" x2="150" y2="48" stroke="#334155" stroke-width="1.2"/>
        <polygon points="150,48 144,45 144,51" fill="#334155"/>
        <text x="102" y="44" font-family="Inter" font-size="6.5" font-weight="600" text-anchor="middle" fill="#1e293b">1. Beam 1 Blocked (P1=1)</text>

        <!-- 2. ANPR Trigger -->
        <line x1="150" y1="65" x2="247" y2="65" stroke="#16a34a" stroke-width="1.2"/>
        <polygon points="247,65 241,62 241,68" fill="#16a34a"/>
        <text x="198" y="61" font-family="Inter" font-size="6.5" font-weight="600" text-anchor="middle" fill="#166534">2. Capture Frame & OCR</text>

        <!-- 3. ANPR Result -->
        <line x1="247" y1="82" x2="347" y2="82" stroke="#16a34a" stroke-width="1.2"/>
        <polygon points="347,82 341,79 341,85" fill="#16a34a"/>
        <text x="297" y="78" font-family="Inter" font-size="6.5" font-weight="600" text-anchor="middle" fill="#166534">3. Plate: "AB 123 CD GP" (92%)</text>

        <!-- 4. Lookup Booking -->
        <line x1="347" y1="99" x2="445" y2="99" stroke="#16a34a" stroke-width="1.2"/>
        <polygon points="445,99 439,96 439,102" fill="#16a34a"/>
        <text x="396" y="95" font-family="Inter" font-size="6.5" font-weight="600" text-anchor="middle" fill="#166534">4. Query Active Booking</text>

        <!-- 5. RFID Scan -->
        <line x1="55" y1="120" x2="150" y2="120" stroke="#d97706" stroke-width="1.2"/>
        <polygon points="150,120 144,117 144,123" fill="#d97706"/>
        <text x="102" y="116" font-family="Inter" font-size="6.5" font-weight="600" text-anchor="middle" fill="#92400e">5. Driver Taps RFID Card</text>

        <line x1="150" y1="135" x2="347" y2="135" stroke="#334155" stroke-width="1.2"/>
        <polygon points="347,135 341,132 341,138" fill="#334155"/>
        <text x="248" y="131" font-family="Inter" font-size="6.5" font-weight="600" text-anchor="middle" fill="#1e293b">6. #WT:0;P1:1;RF:DRV00421;ST:STABLE$</text>

        <!-- 7. Authorise & Open Entry Gate -->
        <line x1="347" y1="155" x2="150" y2="155" stroke="#16a34a" stroke-width="1.2"/>
        <polygon points="150,155 156,152 156,158" fill="#16a34a"/>
        <text x="248" y="151" font-family="Inter" font-size="6.5" font-weight="600" text-anchor="middle" fill="#166534">7. @CMD:GATE_OPEN;TGT:ENTRY$ + LIGHT:GREEN</text>

        <!-- 8. Positioning hold -->
        <rect x="40" y="172" width="220" height="20" rx="3" fill="#f1f5f9" stroke="#cbd5e1"/>
        <text x="150" y="185" font-family="Inter" font-size="6.5" text-anchor="middle" fill="#334155">Vehicle positions: P1=1 AND P2=1 held for >= 2.0s</text>

        <!-- 9. Close Entry Gate & Stabilise -->
        <line x1="347" y1="202" x2="150" y2="202" stroke="#dc2626" stroke-width="1.2"/>
        <polygon points="150,202 156,199 156,205" fill="#dc2626"/>
        <text x="248" y="198" font-family="Inter" font-size="6.5" font-weight="600" text-anchor="middle" fill="#991b1b">8. @CMD:GATE_CLOSE;TGT:ENTRY$ + LIGHT:RED</text>

        <!-- 10. Stability Capture -->
        <rect x="250" y="215" width="200" height="20" rx="3" fill="#dcfce7" stroke="#86efac"/>
        <text x="350" y="228" font-family="Inter" font-size="6.5" font-weight="700" text-anchor="middle" fill="#166534">Weight stable (delta &lt;= 20kg over 3.0s) -> 52,400 kg</text>

        <!-- 11. Kiosk Prompt -->
        <line x1="347" y1="245" x2="532" y2="245" stroke="#d97706" stroke-width="1.2"/>
        <polygon points="532,245 526,242 526,248" fill="#d97706"/>
        <text x="440" y="241" font-family="Inter" font-size="6.5" font-weight="600" text-anchor="middle" fill="#92400e">9. Display Net Weight: 34,200 kg</text>

        <!-- 12. Driver Accept -->
        <line x1="55" y1="262" x2="532" y2="262" stroke="#d97706" stroke-width="1.2"/>
        <polygon points="532,262 526,259 526,265" fill="#d97706"/>
        <text x="293" y="258" font-family="Inter" font-size="6.5" font-weight="600" text-anchor="middle" fill="#92400e">10. Driver Clicks "Accept Load"</text>

        <line x1="532" y1="278" x2="347" y2="278" stroke="#d97706" stroke-width="1.2"/>
        <polygon points="347,278 353,275 353,281" fill="#d97706"/>
        <text x="440" y="274" font-family="Inter" font-size="6.5" font-weight="600" text-anchor="middle" fill="#92400e">11. POST /edge/driver-decision (ACCEPT)</text>

        <!-- 13. Local SHA-256 Hash Chain & Release Exit Gate -->
        <line x1="347" y1="298" x2="445" y2="298" stroke="#16a34a" stroke-width="1.2"/>
        <polygon points="445,298 439,295 439,301" fill="#16a34a"/>
        <text x="396" y="294" font-family="Inter" font-size="6.5" font-weight="600" text-anchor="middle" fill="#166534">12. Store Local Tx + Hash Chain</text>

        <line x1="347" y1="318" x2="150" y2="318" stroke="#16a34a" stroke-width="1.2"/>
        <polygon points="150,318 156,315 156,321" fill="#16a34a"/>
        <text x="248" y="314" font-family="Inter" font-size="6.5" font-weight="600" text-anchor="middle" fill="#166534">13. @CMD:GATE_OPEN;TGT:EXIT$ + LIGHT:GREEN</text>

        <!-- 14. Async Cloud Reconcile -->
        <line x1="445" y1="340" x2="622" y2="340" stroke="#2563eb" stroke-width="1.2"/>
        <polygon points="622,340 616,337 616,343" fill="#2563eb"/>
        <text x="533" y="336" font-family="Inter" font-size="6.5" font-weight="600" text-anchor="middle" fill="#1e40af">14. POST /api/transactions/reconcile</text>

        <line x1="622" y1="360" x2="445" y2="360" stroke="#2563eb" stroke-width="1.2"/>
        <polygon points="445,360 451,357 451,363" fill="#2563eb"/>
        <text x="533" y="356" font-family="Inter" font-size="6.5" font-weight="600" text-anchor="middle" fill="#1e40af">15. HTTP 201 Created (confirmation_hash)</text>

        <!-- 16. Socket.IO Live Broadcast -->
        <line x1="622" y1="380" x2="705" y2="380" stroke="#7c3aed" stroke-width="1.2"/>
        <polygon points="705,380 699,377 699,383" fill="#7c3aed"/>
        <text x="663" y="376" font-family="Inter" font-size="6.5" font-weight="600" text-anchor="middle" fill="#6d28d9">16. io.emit("transaction")</text>

        <!-- 17. Vehicle Exits & Scale Reset -->
        <line x1="55" y1="402" x2="150" y2="402" stroke="#334155" stroke-width="1.2"/>
        <polygon points="150,402 144,399 144,405" fill="#334155"/>
        <text x="102" y="398" font-family="Inter" font-size="6.5" font-weight="600" text-anchor="middle" fill="#1e293b">17. Vehicle Clears Deck</text>

        <line x1="347" y1="415" x2="150" y2="415" stroke="#dc2626" stroke-width="1.2"/>
        <polygon points="150,415 156,412 156,418" fill="#dc2626"/>
        <text x="248" y="411" font-family="Inter" font-size="6.5" font-weight="600" text-anchor="middle" fill="#991b1b">18. @CMD:GATE_CLOSE;TGT:EXIT$ -> State: IDLE</text>
      </svg>
    </div>

    <div class="info-grid">
      <div class="info-box green">
        <h5>Dual Interlock Verification</h5>
        <p>Entry gate only opens after matching ANPR plate AND driver RFID tag. Exit gate only opens after stable load capture & driver kiosk sign-off.</p>
      </div>
      <div class="info-box">
        <h5>Cryptographic Integrity</h5>
        <p>Transaction is signed into the local SHA-256 chain prior to gate release. Cloud verifies prior hash before updating Postgres.</p>
      </div>
      <div class="info-box purple">
        <h5>Real-time Telemetry Broadcast</h5>
        <p>MQTT and Socket.IO pipe 10Hz scale weights and state changes to remote operator dashboards with sub-100ms latency.</p>
      </div>
    </div>
  </div>

  <!-- PAGE 6: SEQUENCE DIAGRAM — OFFLINE SYNC -->
  <div class="page-break">
    <div class="section-header">
      <div class="section-tag">Diagram 06 — Resiliency & Fault Tolerance</div>
      <h2 class="section-title">UML Sequence Diagram 2: Offline Store-and-Forward Sync & Recovery</h2>
      <p class="section-desc">72-Hour network outage handling, local SQLite queue buffering, idempotent retry backoff, and hash chain reconciliation.</p>
    </div>

    <div class="diagram-wrapper">
      <svg viewBox="0 0 740 430" width="740" height="430" xmlns="http://www.w3.org/2000/svg">
        <!-- Lifelines -->
        <rect x="40" y="10" width="90" height="22" rx="3" fill="#f0fdf4" stroke="#16a34a" stroke-width="1.2"/>
        <text x="85" y="24" font-family="Inter" font-size="7.5" font-weight="700" text-anchor="middle" fill="#166534">Edge State Machine</text>
        <line x1="85" y1="32" x2="85" y2="420" stroke="#16a34a" stroke-width="1" stroke-dasharray="3,3"/>

        <rect x="180" y="10" width="90" height="22" rx="3" fill="#f0fdf4" stroke="#16a34a" stroke-width="1.2"/>
        <text x="225" y="24" font-family="Inter" font-size="7.5" font-weight="700" text-anchor="middle" fill="#166534">SQLite sync_queue</text>
        <line x1="225" y1="32" x2="225" y2="420" stroke="#16a34a" stroke-width="1" stroke-dasharray="3,3"/>

        <rect x="320" y="10" width="90" height="22" rx="3" fill="#f0fdf4" stroke="#16a34a" stroke-width="1.2"/>
        <text x="365" y="24" font-family="Inter" font-size="7.5" font-weight="700" text-anchor="middle" fill="#166534">SyncWorker Loop</text>
        <line x1="365" y1="32" x2="365" y2="420" stroke="#16a34a" stroke-width="1" stroke-dasharray="3,3"/>

        <rect x="470" y="10" width="100" height="22" rx="3" fill="#eff6ff" stroke="#2563eb" stroke-width="1.2"/>
        <text x="520" y="24" font-family="Inter" font-size="7.5" font-weight="700" text-anchor="middle" fill="#1e3a8a">Cloud Reconcile API</text>
        <line x1="520" y1="32" x2="520" y2="420" stroke="#2563eb" stroke-width="1" stroke-dasharray="3,3"/>

        <rect x="620" y="10" width="90" height="22" rx="3" fill="#eff6ff" stroke="#2563eb" stroke-width="1.2"/>
        <text x="665" y="24" font-family="Inter" font-size="7.5" font-weight="700" text-anchor="middle" fill="#1e3a8a">Cloud PostgreSQL</text>
        <line x1="665" y1="32" x2="665" y2="420" stroke="#2563eb" stroke-width="1" stroke-dasharray="3,3"/>

        <!-- Phase 1: Local Transaction during Outage -->
        <rect x="30" y="45" width="680" height="22" fill="#fee2e2" stroke="#fca5a5" rx="3"/>
        <text x="370" y="59" font-family="Inter" font-size="7.5" font-weight="700" text-anchor="middle" fill="#991b1b">SCENARIO A: CLOUD CONNECTIVITY OUTAGE (Edge operates 100% autonomously)</text>

        <line x1="85" y1="80" x2="225" y2="80" stroke="#16a34a" stroke-width="1.2"/>
        <polygon points="225,80 219,77 219,83" fill="#16a34a"/>
        <text x="155" y="76" font-family="Inter" font-size="6.5" font-weight="600" text-anchor="middle" fill="#166534">1. Store Transaction (Tx #142) + Hash</text>

        <line x1="85" y1="98" x2="225" y2="98" stroke="#16a34a" stroke-width="1.2"/>
        <polygon points="225,98 219,95 219,101" fill="#16a34a"/>
        <text x="155" y="94" font-family="Inter" font-size="6.5" font-weight="600" text-anchor="middle" fill="#166534">2. Enqueue in sync_queue (status='pending')</text>

        <line x1="365" y1="118" x2="225" y2="118" stroke="#334155" stroke-width="1.2"/>
        <polygon points="225,118 231,115 231,121" fill="#334155"/>
        <text x="295" y="114" font-family="Inter" font-size="6.5" font-weight="600" text-anchor="middle" fill="#334155">3. list_due_sync_items() -> [Tx #142]</text>

        <line x1="365" y1="138" x2="520" y2="138" stroke="#dc2626" stroke-width="1.2"/>
        <polygon points="520,138 514,135 514,141" fill="#dc2626"/>
        <text x="442" y="134" font-family="Inter" font-size="6.5" font-weight="600" text-anchor="middle" fill="#dc2626">4. POST /transactions/reconcile (TIMEOUT)</text>

        <!-- Network Break Symbol -->
        <text x="442" y="152" font-family="Inter" font-size="9" font-weight="800" text-anchor="middle" fill="#dc2626">⚡ NETWORK UNREACHABLE ⚡</text>

        <line x1="365" y1="165" x2="225" y2="165" stroke="#d97706" stroke-width="1.2"/>
        <polygon points="225,165 231,162 231,168" fill="#d97706"/>
        <text x="295" y="161" font-family="Inter" font-size="6.5" font-weight="600" text-anchor="middle" fill="#92400e">5. mark_sync_failed(retry_count=1, next_retry=now+5s)</text>

        <!-- Phase 2: Recovery -->
        <rect x="30" y="185" width="680" height="22" fill="#dcfce7" stroke="#86efac" rx="3"/>
        <text x="370" y="199" font-family="Inter" font-size="7.5" font-weight="700" text-anchor="middle" fill="#166534">SCENARIO B: NETWORK RESTORED (Automatic Re-synchronization & Chain Verification)</text>

        <line x1="365" y1="220" x2="520" y2="220" stroke="#16a34a" stroke-width="1.2"/>
        <polygon points="520,220 514,217 514,223" fill="#16a34a"/>
        <text x="442" y="216" font-family="Inter" font-size="6.5" font-weight="600" text-anchor="middle" fill="#166534">6. GET /health -> 200 OK (Cloud Online)</text>

        <line x1="365" y1="240" x2="225" y2="240" stroke="#334155" stroke-width="1.2"/>
        <polygon points="225,240 231,237 231,243" fill="#334155"/>
        <text x="295" y="236" font-family="Inter" font-size="6.5" font-weight="600" text-anchor="middle" fill="#334155">7. Fetch Due Items: [Tx #142, Tx #143, Tx #144]</text>

        <line x1="365" y1="260" x2="520" y2="260" stroke="#2563eb" stroke-width="1.2"/>
        <polygon points="520,260 514,257 514,263" fill="#2563eb"/>
        <text x="442" y="256" font-family="Inter" font-size="6.5" font-weight="600" text-anchor="middle" fill="#1e40af">8. POST Tx #142 (Idempotency-Key: hash_142)</text>

        <!-- Cloud Validation Steps -->
        <line x1="520" y1="278" x2="665" y2="278" stroke="#2563eb" stroke-width="1.2"/>
        <polygon points="665,278 659,275 659,281" fill="#2563eb"/>
        <text x="592" y="274" font-family="Inter" font-size="6.5" font-weight="600" text-anchor="middle" fill="#1e40af">9. Check Prior Hash == Tx#141.hash</text>

        <line x1="520" y1="295" x2="665" y2="295" stroke="#2563eb" stroke-width="1.2"/>
        <polygon points="665,295 659,292 659,298" fill="#2563eb"/>
        <text x="592" y="291" font-family="Inter" font-size="6.5" font-weight="600" text-anchor="middle" fill="#1e40af">10. Recalculate Gross - Tare == Net & GVW</text>

        <line x1="520" y1="312" x2="665" y2="312" stroke="#2563eb" stroke-width="1.2"/>
        <polygon points="665,312 659,309 659,315" fill="#2563eb"/>
        <text x="592" y="308" font-family="Inter" font-size="6.5" font-weight="600" text-anchor="middle" fill="#1e40af">11. Commit Transaction in Serializable Isolation</text>

        <line x1="520" y1="332" x2="365" y2="332" stroke="#16a34a" stroke-width="1.2"/>
        <polygon points="365,332 371,329 371,335" fill="#16a34a"/>
        <text x="442" y="328" font-family="Inter" font-size="6.5" font-weight="600" text-anchor="middle" fill="#166534">12. HTTP 201 Created (confirmation_hash: sha_conf)</text>

        <line x1="365" y1="352" x2="225" y2="352" stroke="#16a34a" stroke-width="1.2"/>
        <polygon points="225,352 231,349 231,355" fill="#16a34a"/>
        <text x="295" y="348" font-family="Inter" font-size="6.5" font-weight="600" text-anchor="middle" fill="#166534">13. mark_synced(Tx #142, status='synced', sha_conf)</text>

        <!-- Phase 3: Idempotent Duplicate Handling -->
        <rect x="30" y="372" width="680" height="20" fill="#fef3c7" stroke="#fcd34d" rx="3"/>
        <text x="370" y="385" font-family="Inter" font-size="7.5" font-weight="700" text-anchor="middle" fill="#92400e">IDEMPOTENCY HANDLING: If Cloud already received Tx, responds HTTP 409 + conf_hash; edge marks synced without failure.</text>
      </svg>
    </div>

    <div class="info-grid">
      <div class="info-box green">
        <h5>Exponential Retry Backoff</h5>
        <p>Sync worker retries failed requests at 5s, 10s, 20s, 40s, and 60s intervals to prevent network flood upon reconnection.</p>
      </div>
      <div class="info-box amber">
        <h5>Idempotent Queue Ledger</h5>
        <p>Every payload is tagged with <code>idempotency_key = integrity_hash</code>. Retried packets can never produce double transactions in Postgres.</p>
      </div>
      <div class="info-box red">
        <h5>Divergence Alerting</h5>
        <p>If a 409 error occurs without a confirmation hash (e.g. hash chain broken), a CRITICAL incident is raised for manual auditor inspection.</p>
      </div>
    </div>
  </div>

  <!-- PAGE 7: SEQUENCE DIAGRAM — FRAUD & OVERLOAD ESCALATION -->
  <div class="page-break">
    <div class="section-header">
      <div class="section-tag">Diagram 07 — Security & Anomaly Detection</div>
      <h2 class="section-title">UML Sequence Diagram 3: Multi-Layer Fraud & Overload Escalation</h2>
      <p class="section-desc">Real-time fraud triggers: Overload violation, driver RFID mismatch, tare weight drift, and impossible inter-site travel speed.</p>
    </div>

    <div class="diagram-wrapper">
      <svg viewBox="0 0 740 430" width="740" height="430" xmlns="http://www.w3.org/2000/svg">
        <!-- Lifelines -->
        <rect x="25" y="10" width="85" height="22" rx="3" fill="#fef3c7" stroke="#d97706" stroke-width="1.2"/>
        <text x="67" y="24" font-family="Inter" font-size="7.5" font-weight="700" text-anchor="middle" fill="#92400e">Load Cell / RFID</text>
        <line x1="67" y1="32" x2="67" y2="420" stroke="#d97706" stroke-width="1" stroke-dasharray="3,3"/>

        <rect x="140" y="10" width="95" height="22" rx="3" fill="#f0fdf4" stroke="#16a34a" stroke-width="1.2"/>
        <text x="187" y="24" font-family="Inter" font-size="7.5" font-weight="700" text-anchor="middle" fill="#166534">Edge State Machine</text>
        <line x1="187" y1="32" x2="187" y2="420" stroke="#16a34a" stroke-width="1" stroke-dasharray="3,3"/>

        <rect x="265" y="10" width="90" height="22" rx="3" fill="#fee2e2" stroke="#dc2626" stroke-width="1.2"/>
        <text x="310" y="24" font-family="Inter" font-size="7.5" font-weight="700" text-anchor="middle" fill="#991b1b">Relays & Siren</text>
        <line x1="310" y1="32" x2="310" y2="420" stroke="#dc2626" stroke-width="1" stroke-dasharray="3,3"/>

        <rect x="385" y="10" width="95" height="22" rx="3" fill="#f0fdf4" stroke="#16a34a" stroke-width="1.2"/>
        <text x="432" y="24" font-family="Inter" font-size="7.5" font-weight="700" text-anchor="middle" fill="#166534">MQTT Alerts Topic</text>
        <line x1="432" y1="32" x2="432" y2="420" stroke="#16a34a" stroke-width="1" stroke-dasharray="3,3"/>

        <rect x="510" y="10" width="105" height="22" rx="3" fill="#eff6ff" stroke="#2563eb" stroke-width="1.2"/>
        <text x="562" y="24" font-family="Inter" font-size="7.5" font-weight="700" text-anchor="middle" fill="#1e3a8a">Cloud Fraud Engine</text>
        <line x1="562" y1="32" x2="562" y2="420" stroke="#2563eb" stroke-width="1" stroke-dasharray="3,3"/>

        <rect x="640" y="10" width="80" height="22" rx="3" fill="#eff6ff" stroke="#2563eb" stroke-width="1.2"/>
        <text x="680" y="24" font-family="Inter" font-size="7.5" font-weight="700" text-anchor="middle" fill="#1e3a8a">Admin Console</text>
        <line x1="680" y1="32" x2="680" y2="420" stroke="#2563eb" stroke-width="1" stroke-dasharray="3,3"/>

        <!-- Event 1: Driver Mismatch -->
        <rect x="30" y="45" width="680" height="20" fill="#fee2e2" stroke="#fca5a5" rx="3"/>
        <text x="370" y="58" font-family="Inter" font-size="7.5" font-weight="700" text-anchor="middle" fill="#991b1b">TRIGGER 1: DRIVER RFID MISMATCH (Booking expects RFID DRV00421; Reader reads DRV00999)</text>

        <line x1="67" y1="78" x2="187" y2="78" stroke="#334155" stroke-width="1.2"/>
        <polygon points="187,78 181,75 181,81" fill="#334155"/>
        <text x="127" y="74" font-family="Inter" font-size="6.5" font-weight="600" text-anchor="middle" fill="#1e293b">RF:DRV00999 (Actual)</text>

        <line x1="187" y1="95" x2="310" y2="95" stroke="#dc2626" stroke-width="1.2"/>
        <polygon points="310,95 304,92 304,98" fill="#dc2626"/>
        <text x="248" y="91" font-family="Inter" font-size="6.5" font-weight="600" text-anchor="middle" fill="#991b1b">@CMD:GATE_CLOSE;ENTRY$ + BUZZER:ON</text>

        <line x1="187" y1="112" x2="432" y2="112" stroke="#dc2626" stroke-width="1.2"/>
        <polygon points="432,112 426,109 426,115" fill="#dc2626"/>
        <text x="309" y="108" font-family="Inter" font-size="6.5" font-weight="600" text-anchor="middle" fill="#991b1b">Publish Alert (type=DRIVER_MISMATCH, severity=CRITICAL)</text>

        <!-- Event 2: Physical Overload Violation -->
        <rect x="30" y="132" width="680" height="20" fill="#fee2e2" stroke="#fca5a5" rx="3"/>
        <text x="370" y="145" font-family="Inter" font-size="7.5" font-weight="700" text-anchor="middle" fill="#991b1b">TRIGGER 2: GROSS OVERLOAD DETECTED (Scale reading: 62,500 kg &gt; Legal Max GVW: 56,000 kg)</text>

        <line x1="67" y1="165" x2="187" y2="165" stroke="#334155" stroke-width="1.2"/>
        <polygon points="187,165 181,162 181,168" fill="#334155"/>
        <text x="127" y="161" font-family="Inter" font-size="6.5" font-weight="600" text-anchor="middle" fill="#1e293b">Captured Gross Weight: 62,500 kg</text>

        <line x1="187" y1="182" x2="310" y2="182" stroke="#dc2626" stroke-width="1.2"/>
        <polygon points="310,182 304,179 304,185" fill="#dc2626"/>
        <text x="248" y="178" font-family="Inter" font-size="6.5" font-weight="600" text-anchor="middle" fill="#991b1b">Lock Exit Gate: @CMD:GATE_CLOSE;EXIT$ + BUZZER:ON</text>

        <line x1="187" y1="200" x2="432" y2="200" stroke="#dc2626" stroke-width="1.2"/>
        <polygon points="432,200 426,197 426,203" fill="#dc2626"/>
        <text x="309" y="196" font-family="Inter" font-size="6.5" font-weight="600" text-anchor="middle" fill="#991b1b">Hold Transaction + Alert (OVERLOAD, variance=6,500kg)</text>

        <!-- Event 3: Cloud Cross-Site Fraud Analysis -->
        <rect x="30" y="222" width="680" height="20" fill="#fef3c7" stroke="#fcd34d" rx="3"/>
        <text x="370" y="235" font-family="Inter" font-size="7.5" font-weight="700" text-anchor="middle" fill="#92400e">TRIGGER 3: CLOUD ANOMALY DETECTION (Tare Drift &amp; Cloned Plate Velocity Analysis)</text>

        <line x1="432" y1="255" x2="562" y2="255" stroke="#2563eb" stroke-width="1.2"/>
        <polygon points="562,255 556,252 556,258" fill="#2563eb"/>
        <text x="497" y="251" font-family="Inter" font-size="6.5" font-weight="600" text-anchor="middle" fill="#1e40af">runFraudChecks(transactionId)</text>

        <!-- Fraud Engine Calculations -->
        <rect x="490" y="270" width="145" height="60" rx="3" fill="#ffffff" stroke="#dc2626" stroke-width="1.2"/>
        <text x="562" y="283" font-family="Inter" font-size="6.5" font-weight="700" text-anchor="middle" fill="#991b1b">Anomaly Rules Evaluated:</text>
        <text x="496" y="295" font-family="JetBrains Mono" font-size="6" fill="#334155">1. Tare Drift: |Tare - Baseline| &gt; 500kg</text>
        <text x="496" y="306" font-family="JetBrains Mono" font-size="6" fill="#334155">2. Clone Plate: Inter-site travel &lt; 20m</text>
        <text x="496" y="317" font-family="JetBrains Mono" font-size="6" fill="#334155">3. Route Delay: Travel &gt; 24 hours</text>
        <text x="496" y="328" font-family="JetBrains Mono" font-size="6" fill="#334155">4. Weight Variance: Diff &gt; 500kg</text>

        <line x1="562" y1="345" x2="680" y2="345" stroke="#dc2626" stroke-width="1.2"/>
        <polygon points="680,345 674,342 674,348" fill="#dc2626"/>
        <text x="621" y="341" font-family="Inter" font-size="6.5" font-weight="600" text-anchor="middle" fill="#991b1b">Emit High-Severity Fraud Incident</text>

        <line x1="562" y1="365" x2="562" y2="390" stroke="#7c3aed" stroke-width="1.2"/>
        <line x1="562" y1="390" x2="530" y2="390" stroke="#7c3aed" stroke-width="1.2"/>
        <polygon points="530,390 536,387 536,393" fill="#7c3aed"/>
        <text x="590" y="380" font-family="Inter" font-size="6.5" font-weight="600" text-anchor="middle" fill="#6d28d9">Increment Anomaly Score (+30)</text>

        <line x1="562" y1="405" x2="680" y2="405" stroke="#7c3aed" stroke-width="1.2"/>
        <polygon points="680,405 674,402 674,408" fill="#7c3aed"/>
        <text x="621" y="401" font-family="Inter" font-size="6.5" font-weight="600" text-anchor="middle" fill="#6d28d9">Update Fraud Dashboard &amp; Fleet Risk</text>
      </svg>
    </div>

    <div class="info-grid">
      <div class="info-box red">
        <h5>Physical Safety Interlock</h5>
        <p>When overload or driver mismatch is detected, the exit boom gate is physically locked and the on-site siren sounds immediately.</p>
      </div>
      <div class="info-box amber">
        <h5>Velocity Anomaly Checking</h5>
        <p>Detects fraudulent cloned plates by computing transit speed between remote mining sites. Travel times &lt; 20 min trigger critical alarms.</p>
      </div>
      <div class="info-box purple">
        <h5>Dynamic Risk Profiling</h5>
        <p>Vehicles and drivers accumulate anomaly scores over time. High-risk assets are automatically flagged for manual physical audits.</p>
      </div>
    </div>
  </div>

  <!-- PAGE 8: ACTIVITY / FLOWCHART DIAGRAM -->
  <div class="page-break">
    <div class="section-header">
      <div class="section-tag">Diagram 08 — Process Flow & Logic</div>
      <h2 class="section-title">UML Activity Diagram: Weighbridge Decision Tree</h2>
      <p class="section-desc">Deterministic branching logic governing vehicle ingress, sensor validation, stability sampling, overload calculation, and egress.</p>
    </div>

    <div class="diagram-wrapper">
      <svg viewBox="0 0 740 450" width="740" height="450" xmlns="http://www.w3.org/2000/svg">
        <!-- Start Node -->
        <circle cx="370" cy="20" r="10" fill="#0f172a"/>

        <!-- Step 1: Vehicle Approach -->
        <rect x="290" y="45" width="160" height="26" rx="4" fill="#ffffff" stroke="#2563eb" stroke-width="1.2"/>
        <text x="370" y="61" font-family="Inter" font-size="7.5" font-weight="600" text-anchor="middle" fill="#1e293b">Vehicle Approaches (Beam 1)</text>

        <line x1="370" y1="30" x2="370" y2="45" stroke="#334155" stroke-width="1.2"/>
        <polygon points="370,45 367,39 373,39" fill="#334155"/>

        <!-- Step 2: ANPR Capture -->
        <rect x="290" y="85" width="160" height="26" rx="4" fill="#ffffff" stroke="#16a34a" stroke-width="1.2"/>
        <text x="370" y="101" font-family="Inter" font-size="7.5" font-weight="600" text-anchor="middle" fill="#1e293b">ANPR Reads License Plate</text>

        <line x1="370" y1="71" x2="370" y2="85" stroke="#334155" stroke-width="1.2"/>
        <polygon points="370,85 367,79 373,79" fill="#334155"/>

        <!-- Decision 1: Active Booking? -->
        <polygon points="370,125 430,145 370,165 310,145" fill="#fef3c7" stroke="#d97706" stroke-width="1.2"/>
        <text x="370" y="148" font-family="Inter" font-size="7" font-weight="700" text-anchor="middle" fill="#92400e">Booking Valid?</text>

        <line x1="370" y1="111" x2="370" y2="125" stroke="#334155" stroke-width="1.2"/>
        <polygon points="370,125 367,119 373,119" fill="#334155"/>

        <!-- No Booking -> Reject -->
        <line x1="310" y1="145" x2="160" y2="145" stroke="#dc2626" stroke-width="1.2"/>
        <polygon points="160,145 166,142 166,148" fill="#dc2626"/>
        <text x="235" y="140" font-family="Inter" font-size="6.5" font-weight="700" fill="#dc2626">[No] Unauthorised</text>

        <rect x="60" y="132" width="100" height="26" rx="4" fill="#fee2e2" stroke="#dc2626" stroke-width="1.2"/>
        <text x="110" y="148" font-family="Inter" font-size="7" font-weight="600" text-anchor="middle" fill="#991b1b">Raise Alert &amp; Lock</text>

        <!-- Yes -> Check RFID -->
        <line x1="370" y1="165" x2="370" y2="185" stroke="#16a34a" stroke-width="1.2"/>
        <polygon points="370,185 367,179 373,179" fill="#16a34a"/>
        <text x="378" y="177" font-family="Inter" font-size="6.5" font-weight="700" fill="#16a34a">[Yes]</text>

        <polygon points="370,185 430,205 370,225 310,205" fill="#fef3c7" stroke="#d97706" stroke-width="1.2"/>
        <text x="370" y="208" font-family="Inter" font-size="7" font-weight="700" text-anchor="middle" fill="#92400e">Driver RFID Match?</text>

        <!-- No RFID -> Mismatch -->
        <line x1="310" y1="205" x2="160" y2="205" stroke="#dc2626" stroke-width="1.2"/>
        <polygon points="160,205 166,202 166,208" fill="#dc2626"/>
        <text x="235" y="200" font-family="Inter" font-size="6.5" font-weight="700" fill="#dc2626">[No] Mismatch</text>

        <rect x="60" y="192" width="100" height="26" rx="4" fill="#fee2e2" stroke="#dc2626" stroke-width="1.2"/>
        <text x="110" y="208" font-family="Inter" font-size="7" font-weight="600" text-anchor="middle" fill="#991b1b">Driver Mismatch Alert</text>

        <!-- Yes -> Open Entry Gate -->
        <line x1="370" y1="225" x2="370" y2="245" stroke="#16a34a" stroke-width="1.2"/>
        <polygon points="370,245 367,239 373,239" fill="#16a34a"/>
        <text x="378" y="237" font-family="Inter" font-size="6.5" font-weight="700" fill="#16a34a">[Yes]</text>

        <rect x="290" y="245" width="160" height="26" rx="4" fill="#ffffff" stroke="#16a34a" stroke-width="1.2"/>
        <text x="370" y="261" font-family="Inter" font-size="7.5" font-weight="600" text-anchor="middle" fill="#1e293b">Open Entry Gate / Light Green</text>

        <!-- Step 3: Positioning -->
        <line x1="370" y1="271" x2="370" y2="285" stroke="#334155" stroke-width="1.2"/>
        <polygon points="370,285 367,279 373,279" fill="#334155"/>

        <polygon points="370,285 430,305 370,325 310,305" fill="#fef3c7" stroke="#d97706" stroke-width="1.2"/>
        <text x="370" y="308" font-family="Inter" font-size="7" font-weight="700" text-anchor="middle" fill="#92400e">P1 &amp; P2 Held &gt;= 2s?</text>

        <!-- Positioning retry loop -->
        <line x1="310" y1="305" x2="260" y2="305" stroke="#d97706" stroke-width="1.2"/>
        <line x1="260" y1="305" x2="260" y2="258" stroke="#d97706" stroke-width="1.2"/>
        <line x1="260" y1="258" x2="290" y2="258" stroke="#d97706" stroke-width="1.2"/>
        <polygon points="290,258 284,255 284,261" fill="#d97706"/>
        <text x="248" y="285" font-family="Inter" font-size="6" font-weight="700" fill="#92400e">Reposition</text>

        <!-- Yes -> Stability -->
        <line x1="370" y1="325" x2="370" y2="345" stroke="#16a34a" stroke-width="1.2"/>
        <polygon points="370,345 367,339 373,339" fill="#16a34a"/>
        <text x="378" y="337" font-family="Inter" font-size="6.5" font-weight="700" fill="#16a34a">[Yes]</text>

        <rect x="290" y="345" width="160" height="26" rx="4" fill="#ffffff" stroke="#16a34a" stroke-width="1.2"/>
        <text x="370" y="361" font-family="Inter" font-size="7.5" font-weight="600" text-anchor="middle" fill="#1e293b">Sample Stability (&lt;= 20kg, 3s)</text>

        <!-- Decision 3: Overload Check -->
        <line x1="370" y1="371" x2="370" y2="385" stroke="#334155" stroke-width="1.2"/>
        <polygon points="370,385 367,379 373,379" fill="#334155"/>

        <polygon points="370,385 430,405 370,425 310,405" fill="#fef3c7" stroke="#d97706" stroke-width="1.2"/>
        <text x="370" y="408" font-family="Inter" font-size="7" font-weight="700" text-anchor="middle" fill="#92400e">Overload / Fault?</text>

        <!-- Overload -> Hold -->
        <line x1="310" y1="405" x2="160" y2="405" stroke="#dc2626" stroke-width="1.2"/>
        <polygon points="160,405 166,402 166,408" fill="#dc2626"/>
        <text x="235" y="400" font-family="Inter" font-size="6.5" font-weight="700" fill="#dc2626">[Yes] Overload</text>

        <rect x="60" y="392" width="100" height="26" rx="4" fill="#fee2e2" stroke="#dc2626" stroke-width="1.2"/>
        <text x="110" y="408" font-family="Inter" font-size="7" font-weight="600" text-anchor="middle" fill="#991b1b">Hold Tx &amp; Siren On</text>

        <!-- No Overload -> Kiosk Sign-off & Exit -->
        <line x1="430" y1="405" x2="570" y2="405" stroke="#16a34a" stroke-width="1.2"/>
        <polygon points="570,405 564,402 564,408" fill="#16a34a"/>
        <text x="500" y="400" font-family="Inter" font-size="6.5" font-weight="700" fill="#16a34a">[Normal Weight]</text>

        <rect x="570" y="392" width="140" height="26" rx="4" fill="#dcfce7" stroke="#16a34a" stroke-width="1.2"/>
        <text x="640" y="408" font-family="Inter" font-size="7" font-weight="700" text-anchor="middle" fill="#166534">Driver Accepts on Kiosk</text>

        <!-- Final Gate & Hash Chain -->
        <line x1="640" y1="392" x2="640" y2="350" stroke="#16a34a" stroke-width="1.2"/>
        <polygon points="640,350 637,356 643,356" fill="#16a34a"/>

        <rect x="560" y="324" width="160" height="26" rx="4" fill="#ffffff" stroke="#16a34a" stroke-width="1.2"/>
        <text x="640" y="340" font-family="Inter" font-size="7" font-weight="600" text-anchor="middle" fill="#1e293b">SHA-256 Hash Chain &amp; Exit Open</text>

        <!-- End Node -->
        <circle cx="640" cy="290" r="10" fill="#ffffff" stroke="#0f172a" stroke-width="2"/>
        <circle cx="640" cy="290" r="6" fill="#0f172a"/>
        <line x1="640" y1="324" x2="640" y2="300" stroke="#334155" stroke-width="1.2"/>
      </svg>
    </div>

    <div class="info-grid">
      <div class="info-box green">
        <h5>Automated Normal Flow</h5>
        <p>Vehicles with valid bookings, verified RFID cards, and stable legal weights complete weighment and exit in &lt; 45 seconds.</p>
      </div>
      <div class="info-box amber">
        <h5>Positioning Interlock</h5>
        <p>If a driver parks with axles hanging off the scale deck, the state machine refuses to capture and loops back to positioning.</p>
      </div>
      <div class="info-box red">
        <h5>Overload Barrier Locking</h5>
        <p>Overloaded trucks cannot exit autonomously. The system requires supervisor manual review and offloading before barrier release.</p>
      </div>
    </div>
  </div>

  <!-- PAGE 9: STATE MACHINE DIAGRAM -->
  <div class="page-break">
    <div class="section-header">
      <div class="section-tag">Diagram 09 — Statechart Lifecycle</div>
      <h2 class="section-title">UML State Machine Diagram: 7-Stage Edge Safety Interlocks</h2>
      <p class="section-desc">Deterministic state transitions, entry actions, exit guards, and fail-safe recovery paths in <code>apps/site-daemon/state_machine.py</code>.</p>
    </div>

    <div class="diagram-wrapper">
      <svg viewBox="0 0 740 430" width="740" height="430" xmlns="http://www.w3.org/2000/svg">
        <!-- States -->
        <!-- IDLE -->
        <rect x="30" y="30" width="130" height="65" rx="6" fill="#f8fafc" stroke="#334155" stroke-width="1.5"/>
        <rect x="30" y="30" width="130" height="18" rx="6" fill="#334155"/>
        <text x="95" y="43" font-family="Inter" font-size="8" font-weight="700" fill="#ffffff" text-anchor="middle">1. IDLE</text>
        <text x="36" y="60" font-family="JetBrains Mono" font-size="6" fill="#334155">entry / clear_session()</text>
        <text x="36" y="72" font-family="JetBrains Mono" font-size="6" fill="#334155">entry / Light: Entry RED</text>
        <text x="36" y="84" font-family="JetBrains Mono" font-size="6" fill="#334155">entry / Gate: Closed</text>

        <!-- VEHICLE_APPROACHING -->
        <rect x="210" y="30" width="150" height="65" rx="6" fill="#f8fafc" stroke="#2563eb" stroke-width="1.5"/>
        <rect x="210" y="30" width="150" height="18" rx="6" fill="#2563eb"/>
        <text x="285" y="43" font-family="Inter" font-size="8" font-weight="700" fill="#ffffff" text-anchor="middle">2. VEHICLE_APPROACHING</text>
        <text x="216" y="60" font-family="JetBrains Mono" font-size="6" fill="#334155">entry / save_session()</text>
        <text x="216" y="72" font-family="JetBrains Mono" font-size="6" fill="#334155">do / Trigger ANPR Camera</text>
        <text x="216" y="84" font-family="JetBrains Mono" font-size="6" fill="#334155">do / Await Driver RFID Card</text>

        <!-- POSITIONING -->
        <rect x="410" y="30" width="150" height="65" rx="6" fill="#f8fafc" stroke="#d97706" stroke-width="1.5"/>
        <rect x="410" y="30" width="150" height="18" rx="6" fill="#d97706"/>
        <text x="485" y="43" font-family="Inter" font-size="8" font-weight="700" fill="#ffffff" text-anchor="middle">3. POSITIONING</text>
        <text x="416" y="60" font-family="JetBrains Mono" font-size="6" fill="#334155">entry / Open Entry Gate</text>
        <text x="416" y="72" font-family="JetBrains Mono" font-size="6" fill="#334155">entry / Light: Entry GREEN</text>
        <text x="416" y="84" font-family="JetBrains Mono" font-size="6" fill="#334155">do / Monitor Beams P1 &amp; P2</text>

        <!-- STABILISING -->
        <rect x="580" y="30" width="140" height="65" rx="6" fill="#f8fafc" stroke="#d97706" stroke-width="1.5"/>
        <rect x="580" y="30" width="140" height="18" rx="6" fill="#d97706"/>
        <text x="650" y="43" font-family="Inter" font-size="8" font-weight="700" fill="#ffffff" text-anchor="middle">4. STABILISING</text>
        <text x="586" y="60" font-family="JetBrains Mono" font-size="6" fill="#334155">entry / Close Entry Gate</text>
        <text x="586" y="72" font-family="JetBrains Mono" font-size="6" fill="#334155">do / Sample Rolling Weight</text>
        <text x="586" y="84" font-family="JetBrains Mono" font-size="6" fill="#334155">guard / delta &lt;= 20kg</text>

        <!-- CAPTURED & PROCESSING -->
        <rect x="580" y="160" width="140" height="65" rx="6" fill="#f8fafc" stroke="#16a34a" stroke-width="1.5"/>
        <rect x="580" y="160" width="140" height="18" rx="6" fill="#16a34a"/>
        <text x="650" y="173" font-family="Inter" font-size="8" font-weight="700" fill="#ffffff" text-anchor="middle">5. CAPTURED / PROCESS</text>
        <text x="586" y="190" font-family="JetBrains Mono" font-size="6" fill="#334155">entry / Lock Gross Weight</text>
        <text x="586" y="202" font-family="JetBrains Mono" font-size="6" fill="#334155">do / Net = Gross - Tare</text>
        <text x="586" y="214" font-family="JetBrains Mono" font-size="6" fill="#334155">do / Overload Policy Check</text>

        <!-- AWAITING_DRIVER_DECISION -->
        <rect x="380" y="160" width="160" height="65" rx="6" fill="#f8fafc" stroke="#16a34a" stroke-width="1.5"/>
        <rect x="380" y="160" width="160" height="18" rx="6" fill="#16a34a"/>
        <text x="460" y="173" font-family="Inter" font-size="8" font-weight="700" fill="#ffffff" text-anchor="middle">6. AWAIT_DECISION</text>
        <text x="386" y="190" font-family="JetBrains Mono" font-size="6" fill="#334155">entry / Display Weight on Kiosk</text>
        <text x="386" y="202" font-family="JetBrains Mono" font-size="6" fill="#334155">event / Driver: ACCEPT</text>
        <text x="386" y="214" font-family="JetBrains Mono" font-size="6" fill="#334155">event / Driver: RELOAD</text>

        <!-- COMPLETE -->
        <rect x="180" y="160" width="150" height="65" rx="6" fill="#f8fafc" stroke="#16a34a" stroke-width="1.5"/>
        <rect x="180" y="160" width="150" height="18" rx="6" fill="#16a34a"/>
        <text x="255" y="173" font-family="Inter" font-size="8" font-weight="700" fill="#ffffff" text-anchor="middle">7. COMPLETE</text>
        <text x="186" y="190" font-family="JetBrains Mono" font-size="6" fill="#334155">entry / Compute SHA256 Hash</text>
        <text x="186" y="202" font-family="JetBrains Mono" font-size="6" fill="#334155">entry / Open Exit Gate</text>
        <text x="186" y="214" font-family="JetBrains Mono" font-size="6" fill="#334155">do / Queue Sync to Cloud</text>

        <!-- FAULT & MANUAL MODE -->
        <rect x="30" y="280" width="300" height="75" rx="6" fill="#fee2e2" stroke="#dc2626" stroke-width="1.5"/>
        <rect x="30" y="280" width="300" height="18" rx="6" fill="#dc2626"/>
        <text x="180" y="293" font-family="Inter" font-size="8" font-weight="700" fill="#ffffff" text-anchor="middle">FAULT &amp; MANUAL_OVERRIDE STATES</text>
        <text x="36" y="310" font-family="JetBrains Mono" font-size="6" fill="#991b1b">entry / All Gates LOCKED CLOSED | All Lights RED</text>
        <text x="36" y="322" font-family="JetBrains Mono" font-size="6" fill="#991b1b">entry / Sound Buzzer Siren | Raise HIGH Alert to Dashboard</text>
        <text x="36" y="334" font-family="JetBrains Mono" font-size="6" fill="#991b1b">trigger / Scale Fault OR Serial Disconnect &gt; 30s OR Overload Violation</text>
        <text x="36" y="346" font-family="JetBrains Mono" font-size="6" fill="#991b1b">exit / Requires Verified Operator Override with >= 10 Char Reason</text>

        <!-- Transitions (Arrows) -->
        <!-- 1 -> 2 -->
        <line x1="160" y1="62" x2="210" y2="62" stroke="#2563eb" stroke-width="1.2"/>
        <polygon points="210,62 204,59 204,65" fill="#2563eb"/>
        <text x="185" y="55" font-family="Inter" font-size="6" font-weight="600" text-anchor="middle" fill="#1e40af">P1=1</text>

        <!-- 2 -> 3 -->
        <line x1="360" y1="62" x2="410" y2="62" stroke="#16a34a" stroke-width="1.2"/>
        <polygon points="410,62 404,59 404,65" fill="#16a34a"/>
        <text x="385" y="55" font-family="Inter" font-size="6" font-weight="600" text-anchor="middle" fill="#166534">Auth OK</text>

        <!-- 3 -> 4 -->
        <line x1="560" y1="62" x2="580" y2="62" stroke="#16a34a" stroke-width="1.2"/>
        <polygon points="580,62 574,59 574,65" fill="#16a34a"/>
        <text x="570" y="55" font-family="Inter" font-size="6" font-weight="600" text-anchor="middle" fill="#166534">P1&amp;P2&gt;=2s</text>

        <!-- 4 -> 5 -->
        <line x1="650" y1="95" x2="650" y2="160" stroke="#16a34a" stroke-width="1.2"/>
        <polygon points="650,160 647,154 653,154" fill="#16a34a"/>
        <text x="655" y="130" font-family="Inter" font-size="6" font-weight="600" fill="#166534">Stable</text>

        <!-- 5 -> 6 -->
        <line x1="580" y1="192" x2="540" y2="192" stroke="#16a34a" stroke-width="1.2"/>
        <polygon points="540,192 546,189 546,195" fill="#16a34a"/>
        <text x="560" y="186" font-family="Inter" font-size="6" font-weight="600" text-anchor="middle" fill="#166534">Legal</text>

        <!-- 6 -> 7 -->
        <line x1="380" y1="192" x2="330" y2="192" stroke="#16a34a" stroke-width="1.2"/>
        <polygon points="330,192 336,189 336,195" fill="#16a34a"/>
        <text x="355" y="186" font-family="Inter" font-size="6" font-weight="600" text-anchor="middle" fill="#166534">Accept</text>

        <!-- 7 -> 1 (Loop back) -->
        <line x1="180" y1="192" x2="95" y2="192" stroke="#334155" stroke-width="1.2"/>
        <line x1="95" y1="192" x2="95" y2="95" stroke="#334155" stroke-width="1.2"/>
        <polygon points="95,95 92,101 98,101" fill="#334155"/>
        <text x="135" y="186" font-family="Inter" font-size="6" font-weight="600" text-anchor="middle" fill="#334155">Scale Clear (W &lt;= 500kg)</text>

        <!-- Fault / Overload Triggers -->
        <line x1="650" y1="225" x2="650" y2="317" stroke="#dc2626" stroke-width="1.2" stroke-dasharray="2,2"/>
        <line x1="650" y1="317" x2="330" y2="317" stroke="#dc2626" stroke-width="1.2" stroke-dasharray="2,2"/>
        <polygon points="330,317 336,314 336,320" fill="#dc2626"/>
        <text x="500" y="312" font-family="Inter" font-size="6" font-weight="700" text-anchor="middle" fill="#dc2626">Overload Detected -> Transition to HELD / FAULT</text>

        <!-- Reload Path (6 -> 3) -->
        <path d="M 460 160 C 460 120, 485 120, 485 95" stroke="#d97706" stroke-width="1.2" fill="none" stroke-dasharray="2,2"/>
        <polygon points="485,95 482,101 488,101" fill="#d97706"/>
        <text x="490" y="130" font-family="Inter" font-size="6" font-weight="600" fill="#d97706">Reload</text>
      </svg>
    </div>

    <div class="info-grid">
      <div class="info-box green">
        <h5>Fail-Safe Defaults</h5>
        <p>In <code>FAULT</code> or <code>MANUAL_MODE</code>, all relays de-energize to force barriers closed and signals red.</p>
      </div>
      <div class="info-box amber">
        <h5>Dynamic Kiosk Hold</h5>
        <p>Truck cannot exit immediately upon stable weight; driver must review tare/gross and confirm at the kiosk.</p>
      </div>
      <div class="info-box purple">
        <h5>Session Recovery</h5>
        <p>Interrupted sessions caused by power loss are saved to SQLite and trigger operator recovery on boot.</p>
      </div>
    </div>
  </div>

  <!-- PAGE 10: DEPLOYMENT & NETWORK TOPOLOGY -->
  <div class="page-break">
    <div class="section-header">
      <div class="section-tag">Diagram 10 — Physical & Network Infrastructure</div>
      <h2 class="section-title">Deployment & Network Infrastructure Architecture</h2>
      <p class="section-desc">Physical fieldbus wiring, opto-isolated industrial relays, on-site edge gateway, and cloud VPC interconnects.</p>
    </div>

    <div class="diagram-wrapper">
      <svg viewBox="0 0 740 430" width="740" height="430" xmlns="http://www.w3.org/2000/svg">
        <!-- Cloud VPC Container -->
        <rect x="10" y="10" width="350" height="410" rx="8" fill="#eff6ff" stroke="#3b82f6" stroke-width="1.5"/>
        <text x="25" y="30" font-family="Inter" font-size="9" font-weight="700" fill="#1e40af">CLOUD INFRASTRUCTURE (Managed Cloud VPC / Kubernetes)</text>

        <!-- Cloud Nodes -->
        <rect x="30" y="45" width="310" height="60" rx="5" fill="#ffffff" stroke="#2563eb" stroke-width="1.2"/>
        <text x="40" y="62" font-family="Inter" font-size="8" font-weight="700" fill="#1e293b">Next.js 14 Web / API Cluster (Node.js 20)</text>
        <text x="40" y="76" font-family="Inter" font-size="7" fill="#64748b">Port 3000 / HTTPS · NextAuth Session Handler · REST APIs</text>
        <text x="40" y="90" font-family="Inter" font-size="7" fill="#64748b">Socket.IO Server Bridge · PDF Report Engine</text>

        <rect x="30" y="120" width="310" height="60" rx="5" fill="#ffffff" stroke="#2563eb" stroke-width="1.2"/>
        <text x="40" y="137" font-family="Inter" font-size="8" font-weight="700" fill="#1e293b">PostgreSQL 16 Managed Database</text>
        <text x="40" y="151" font-family="Inter" font-size="7" fill="#64748b">Port 5432 · High Availability Replica · Point-in-Time Recovery</text>
        <text x="40" y="165" font-family="Inter" font-size="7" fill="#64748b">Prisma Schema · Serializable Isolation Transactions</text>

        <rect x="30" y="195" width="310" height="60" rx="5" fill="#ffffff" stroke="#2563eb" stroke-width="1.2"/>
        <text x="40" y="212" font-family="Inter" font-size="8" font-weight="700" fill="#1e293b">Mosquitto / EMQX MQTT Broker Cluster</text>
        <text x="40" y="226" font-family="Inter" font-size="7" fill="#64748b">Port 8883 (MQTTS / TLS 1.3) · Port 9001 (Secure WebSockets)</text>
        <text x="40" y="240" font-family="Inter" font-size="7" fill="#64748b">Per-site Topic ACLs · QoS 1 Guaranteed Delivery</text>

        <rect x="30" y="270" width="310" height="60" rx="5" fill="#ffffff" stroke="#2563eb" stroke-width="1.2"/>
        <text x="40" y="287" font-family="Inter" font-size="8" font-weight="700" fill="#1e293b">S3-Compatible Object Storage</text>
        <text x="40" y="301" font-family="Inter" font-size="7" fill="#64748b">ANPR Evidence JPEGs · Driver Kiosk Signatures</text>
        <text x="40" y="315" font-family="Inter" font-size="7" fill="#64748b">Calibration Certificates & Audit Documents</text>

        <rect x="30" y="345" width="310" height="60" rx="5" fill="#ffffff" stroke="#2563eb" stroke-width="1.2"/>
        <text x="40" y="362" font-family="Inter" font-size="8" font-weight="700" fill="#1e293b">Monitoring & Log Aggregator</text>
        <text x="40" y="376" font-family="Inter" font-size="7" fill="#64748b">JSON Structured Logs · Prometheus Metrics</text>
        <text x="40" y="390" font-family="Inter" font-size="7" fill="#64748b">Grafana Dashboards · PagerDuty Incident Alerts</text>

        <!-- On-Premises Edge & OT Container -->
        <rect x="380" y="10" width="350" height="410" rx="8" fill="#f0fdf4" stroke="#16a34a" stroke-width="1.5"/>
        <text x="395" y="30" font-family="Inter" font-size="9" font-weight="700" fill="#166534">ON-PREMISES SITE EDGE &amp; OT FIELDBUS</text>

        <!-- Edge Controller -->
        <rect x="400" y="45" width="310" height="95" rx="5" fill="#ffffff" stroke="#16a34a" stroke-width="1.2"/>
        <text x="410" y="62" font-family="Inter" font-size="8" font-weight="700" fill="#1e293b">Industrial Edge Gateway (RPI 5 / x86 Industrial PC)</text>
        <text x="410" y="76" font-family="Inter" font-size="7" fill="#64748b">Ubuntu Core / Linux · systemd service: weighbridge-daemon</text>
        <text x="410" y="90" font-family="Inter" font-size="7" fill="#64748b">FastAPI Local Server (Port 8000) · SQLite 3 WAL Database</text>
        <text x="410" y="104" font-family="Inter" font-size="7" fill="#64748b">EasyOCR / OpenCV ANPR · USB-to-RS485 Serial Interface</text>
        <text x="410" y="118" font-family="Inter" font-size="7" font-weight="600" fill="#166534">Uninterruptible Power Supply (UPS) Backed</text>

        <!-- Field Devices -->
        <rect x="400" y="155" width="145" height="70" rx="5" fill="#ffffff" stroke="#475569" stroke-width="1.2"/>
        <text x="472" y="172" font-family="Inter" font-size="7.5" font-weight="700" text-anchor="middle" fill="#1e293b">IP ANPR Cameras</text>
        <text x="472" y="186" font-family="Inter" font-size="6.5" text-anchor="middle" fill="#64748b">RTSP Stream (H.264)</text>
        <text x="472" y="198" font-family="Inter" font-size="6.5" text-anchor="middle" fill="#64748b">PoE Gigabit Switch</text>
        <text x="472" y="210" font-family="Inter" font-size="6.5" text-anchor="middle" fill="#15803d">Lane Ingress / Scale Deck</text>

        <rect x="565" y="155" width="145" height="70" rx="5" fill="#ffffff" stroke="#475569" stroke-width="1.2"/>
        <text x="637" y="172" font-family="Inter" font-size="7.5" font-weight="700" text-anchor="middle" fill="#1e293b">Driver Kiosk Unit</text>
        <text x="637" y="186" font-family="Inter" font-size="6.5" text-anchor="middle" fill="#64748b">Touchscreen Display</text>
        <text x="637" y="198" font-family="Inter" font-size="6.5" text-anchor="middle" fill="#64748b">Thermal Waybill Printer</text>
        <text x="637" y="210" font-family="Inter" font-size="6.5" text-anchor="middle" fill="#15803d">Direct Edge LAN Client</text>

        <!-- PIC18 MCU & Hardware Relays -->
        <rect x="400" y="240" width="310" height="165" rx="5" fill="#ffffff" stroke="#334155" stroke-width="1.5"/>
        <rect x="400" y="240" width="310" height="18" rx="5" fill="#334155"/>
        <text x="555" y="253" font-family="Inter" font-size="8" font-weight="700" fill="#ffffff" text-anchor="middle">PIC18F45K22 Microcontroller &amp; Field IO (XC8 C Firmware)</text>

        <rect x="415" y="268" width="135" height="55" rx="3" fill="#f8fafc" stroke="#cbd5e1"/>
        <text x="482" y="282" font-family="Inter" font-size="7" font-weight="700" text-anchor="middle" fill="#0f172a">Load Cell Junction Box</text>
        <text x="482" y="295" font-family="Inter" font-size="6.5" text-anchor="middle" fill="#64748b">Wheatstone Strain Gauges</text>
        <text x="482" y="308" font-family="Inter" font-size="6.5" text-anchor="middle" fill="#64748b">Analog Input to ADC (AN0)</text>

        <rect x="565" y="268" width="135" height="55" rx="3" fill="#f8fafc" stroke="#cbd5e1"/>
        <text x="632" y="282" font-family="Inter" font-size="7" font-weight="700" text-anchor="middle" fill="#0f172a">Optical Position Beams</text>
        <text x="632" y="295" font-family="Inter" font-size="6.5" text-anchor="middle" fill="#64748b">IR Transmitters &amp; Receivers</text>
        <text x="632" y="308" font-family="Inter" font-size="6.5" text-anchor="middle" fill="#64748b">Opto-isolated Inputs P1, P2</text>

        <rect x="415" y="335" width="135" height="55" rx="3" fill="#f8fafc" stroke="#cbd5e1"/>
        <text x="482" y="349" font-family="Inter" font-size="7" font-weight="700" text-anchor="middle" fill="#0f172a">RFID Card Reader</text>
        <text x="482" y="362" font-family="Inter" font-size="6.5" text-anchor="middle" fill="#64748b">EM-4100 Proximity Reader</text>
        <text x="482" y="375" font-family="Inter" font-size="6.5" text-anchor="middle" fill="#64748b">UART2 RX (Port RD7)</text>

        <rect x="565" y="335" width="135" height="55" rx="3" fill="#f8fafc" stroke="#cbd5e1"/>
        <text x="632" y="349" font-family="Inter" font-size="7" font-weight="700" text-anchor="middle" fill="#0f172a">Actuator Relays (LATB)</text>
        <text x="632" y="362" font-family="Inter" font-size="6.5" text-anchor="middle" fill="#64748b">Entry/Exit Boom Gates</text>
        <text x="632" y="375" font-family="Inter" font-size="6.5" text-anchor="middle" fill="#64748b">Red/Green Signals &amp; Siren</text>

        <!-- Connecting Link -->
        <line x1="340" y1="75" x2="400" y2="75" stroke="#2563eb" stroke-width="2" stroke-dasharray="4,4"/>
        <text x="370" y="68" font-family="Inter" font-size="6.5" font-weight="700" text-anchor="middle" fill="#1e40af">TLS / LTE</text>
      </svg>
    </div>

    <div class="info-grid">
      <div class="info-box">
        <h5>Cloud Resilience</h5>
        <p>PostgreSQL replicas with PITR backups and TLS 1.3 MQTT brokers guarantee high data availability and security.</p>
      </div>
      <div class="info-box green">
        <h5>Edge Hardware Isolation</h5>
        <p>Industrial gateway runs on isolated OT VLAN with battery-backed UPS, immune to site network outages.</p>
      </div>
      <div class="info-box purple">
        <h5>Microcontroller Reliability</h5>
        <p>Opto-isolated PIC18 microcontroller protects logic electronics from inductive relay spikes and lightning ground loops.</p>
      </div>
    </div>
  </div>

</body>
</html>
"""

def main():
    print("=" * 70)
    print("Generating Weighbridge Software Diagrams Specification PDF...")
    print("=" * 70)

    workspace_dir = Path(__file__).parent.resolve()
    presentation_dir = workspace_dir / "presentation-materials"
    docs_dir = workspace_dir / "docs"
    presentation_dir.mkdir(parents=True, exist_ok=True)
    docs_dir.mkdir(parents=True, exist_ok=True)

    html_file = presentation_dir / "Weighbridge_Software_Diagrams_Specification.html"
    pdf_presentation_file = presentation_dir / "Weighbridge_Software_Diagrams_Specification.pdf"
    pdf_docs_file = docs_dir / "Weighbridge_Software_Diagrams.pdf"

    html_content = generate_html_content()
    html_file.write_text(html_content, encoding="utf-8")
    print(f"[*] HTML source written to: {html_file}")

    # Browser Candidates for PDF generation
    browsers = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    ]
    
    browser_bin = None
    for candidate in browsers:
        if os.path.exists(candidate):
            browser_bin = candidate
            break

    if not browser_bin:
        print("[!] No Chrome or Edge executable found. Falling back to HTML.")
        return

    print(f"[*] Compiling PDF using headless engine: {browser_bin}")
    cmd = [
        browser_bin,
        "--headless=new",
        "--disable-gpu",
        "--no-pdf-header-footer",
        f"--print-to-pdf={pdf_presentation_file}",
        str(html_file),
    ]

    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode == 0 and pdf_presentation_file.exists():
        size_kb = pdf_presentation_file.stat().st_size / 1024
        print(f"[OK] Successfully generated Presentation PDF: {pdf_presentation_file} ({size_kb:.1f} KB)")
        
        # Copy to docs
        import shutil
        shutil.copy2(pdf_presentation_file, pdf_docs_file)
        print(f"[OK] Successfully copied to Docs directory: {pdf_docs_file}")
    else:
        print(f"[!] PDF generation failed with code {res.returncode}: {res.stderr}")

if __name__ == "__main__":
    main()

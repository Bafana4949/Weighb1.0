# 🔑 Weighbridge Management System: User Credentials & Role Directory

This document contains the complete directory of default login credentials, roles, organisations, and access scopes for the **Weighbridge & Access Control Management System**.

---

## 🔐 Universal Password

> **All demo accounts use the standard password:**  
> **`Password123!`**

---

## 👥 Primary Actor Logins

| Role / Persona | Email Address | Password | Organisation | Scope & Responsibilities |
| :--- | :--- | :--- | :--- | :--- |
| **👑 Platform Super Admin** | `admin@weighbridge.local` | `Password123!` | Platform-wide | Full cross-tenant control, client onboarding, global hardware provisioning, system audit logs, and consolidated reports. |
| **🏢 Mining Company Admin** | `mine-admin@weighbridge.local` | `Password123!` | Seriti Resources | Manages mine sites, bulk tonnage contracts, orders, haulier assignments, pit sources, and custom user role permissions. |
| **🖥️ Weighbridge Operator** | `operator@weighbridge.local` | `Password123!` | Seriti Resources | Operates live scale deck, monitors weight gauge, infrared beams (P1/P2), gate controls, zero scale, and reprints waybills. |
| **👮 Security Officer** | `security@weighbridge.local` | `Password123!` | Seriti Resources | Gate barrier monitoring, physical truck inspections, manual ANPR camera override, and security copy waybills. |
| **🚛 Transporter Admin** | `transporter@weighbridge.local` | `Password123!` | SG Coal | Manages fleet roster (trucks, trailers, drivers, RFID badges), slot bookings, trip waybill slips, and CSV reports. |
| **👔 Yard Supervisor** | `supervisor@weighbridge.local` | `Password123!` | Seriti Resources | Approves/rejects slot bookings, authorizes overload violation exceptions, and monitors shift operations. |
| **🏢 Tenant B Admin** | `clientb-admin@weighbridge.local` | `Password123!` | Glencore SA | Multi-tenant isolation testing for an independent mining house. |
| **👁️ Read-Only Viewer** | `viewer@weighbridge.local` | `Password123!` | Seriti Resources | Auditor account with read-only visibility into waybill history, reports, and orders without editing rights. |

---

## 🚛 Transporter / Haulier Logins (Multi-Tenant)

Use these accounts to test independent haulier fleet rosters, truck bookings, trip history, and report exports:

| Haulier Organisation | Email Address | Password | Fleet Scope |
| :--- | :--- | :--- | :--- |
| **SG Coal** | `transporter@weighbridge.local` | `Password123!` | Primary demo fleet (`AB 123 CD GP`, `CD 456 EF MP`, driver Sipho Mahlangu `DRV00421`) |
| **Reinhardt Transport Group** | `transporter@reinhardt.local` | `Password123!` | Secondary haulier fleet (`REI 100 GP` series, RFID `TAGREINHARDT0`) |
| **Comotrans Bulk Transport** | `transporter@comotransbulktransport.local` | `Password123!` | Independent bulk haulier fleet (`COM 100 GP` series) |
| **Chrome Carriers** | `transporter@chromecarriers.local` | `Password123!` | Specialized mineral carrier fleet (`CHR 100 GP` series) |
| **GKOK Transport** | `transporter@gkoktransport.local` | `Password123!` | Regional logistics fleet (`GKO 100 GP` series) |
| **Wessels Vervoer** | `transporter@wesselsvervoer.local` | `Password123!` | Agricultural & mining haulier fleet (`WES 100 GP` series) |
| **Rustgold Transport** | `transporter@rustgoldtransport.local` | `Password123!` | Bulk chrome/coal haulier fleet (`RUS 100 GP` series) |

---

## 🏢 Mining Company Administrator Logins (Multi-Tenant)

Use these accounts to test multi-client isolation, distinct mineral products, pit sources, and contract orders:

| Mining Company | Email Address | Password | Product Scope |
| :--- | :--- | :--- | :--- |
| **Seriti Resources** | `mine-admin@weighbridge.local` | `Password123!` | RB1 Export Coal, Eskom Grade Coal |
| **Glencore Operations SA** | `clientb-admin@weighbridge.local` | `Password123!` | Thermal Coal & Export Chrome |
| **Exxaro Resources** | `admin@exxaroresources.local` | `Password123!` | Lephalale & Mpumalanga Coal |
| **Anglo Inyosi Coal** | `admin@angloinyosicoal.local` | `Password123!` | High-grade domestic & export coal |
| **South Witbank Colliery** | `admin@southwitbankcolliery.local` | `Password123!` | Washed coal products |
| **Sibanye-Stillwater** | `admin@sibanyestillwater.local` | `Password123!` | Platinum group metals & gold ores |
| **Harmony Gold** | `admin@harmonygold.local` | `Password123!` | Gold reef & processing plant feeds |

---

## 🆔 Demo Driver RFID Badges (For Hardware Simulator)

| Driver Name | Transport Company | Assigned Vehicle | RFID Badge ID |
| :--- | :--- | :--- | :--- |
| **Sipho Mahlangu** | SG Coal | `AB 123 CD GP` | `DRV00421` |
| **Lerato Molefe** | SG Coal | `CD 456 EF MP` | `DRV00422` |
| **Musa Khumalo** | SG Coal | `EF 789 GH GP` | `DRV00423` |
| **Palesa Mokoena** | SG Coal | `GH 234 JK NW` | `DRV00424` |
| **John Doe** | Glencore | `BB 123 BB GP` | `DRVB01` |
| **Reinhardt Driver 0** | Reinhardt Transport | `REI 100 GP` | `TAGREINHARDT0` |

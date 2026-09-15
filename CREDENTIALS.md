# 🔑 Weighbridge Management System: User Credentials & Role Directory

This document contains the complete directory of default login credentials, roles, organisations, and access scopes for the **Weighbridge & Access Control Management System**.

---

## 🔐 Universal Password

> **All demo accounts use the standard password:**  
> **`Password123!`**

---

## 🚀 Live Production & Verified Administrative Logins

| Persona / Name | Email Address | Password | Role & Organisation | Scope & Responsibilities |
| :--- | :--- | :--- | :--- | :--- |
| **👑 Platform Super Admin (Bafana Bhuda)** | `superadmin@weighbridge.co.za` | `SuperAdmin2026!` | Platform-wide (No Org Restriction) | Full cross-tenant control, client onboarding, global hardware provisioning, audit logs, consolidated reports. |
| **🏢 Client / Company Admin (Grant Howell)** | `grant@treadstone.co.za` | `Grant@2026!` | Mining Company Admin (**Coal In Motion**) | Scoped strictly to Coal In Motion sites, contracts, orders, haulier assignments, and user permissions. |
| **🏢 Mining Admin (Sipho Dlamini)** | `admin@seriti.co.za` | `Admin2026!` | Mining Company Admin (**Seriti Coal Operations**) | Manages Seriti Coal sites, orders, hauliers, and site configs. |
| **🖥️ Weighbridge Operator (John Moyo)** | `operator@seriti.co.za` | `Operator2026!` | Weighbridge Operator (**Seriti Coal Operations**) | Live scale deck operation, physical indicator weighing, waybill generation. |
| **🚛 Transporter Admin (Irfan Zad)** | `irfan@treadstone.co.za` | `Transporter2026!` | Transporter Admin (**Thaba Logistics Test**) | Haulier fleet management, driver badges, truck bookings. |

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

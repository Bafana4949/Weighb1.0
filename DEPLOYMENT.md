# 🚀 Manual Weighbridge Management System: Vercel & Supabase Deployment Guide

This document is the official deployment and operational guide for the **Manual Weighbridge Management System**, powered by **Next.js**, **Supabase PostgreSQL**, and **Vercel**.

---

## 📑 Table of Contents
1. [Architecture Overview](#1-architecture-overview)
2. [Database Setup (Supabase)](#2-database-setup-supabase)
3. [Cloud Application Deployment (Vercel)](#3-cloud-application-deployment-vercel)
4. [Environment Variables Reference](#4-environment-variables-reference)
5. [End-to-End Operational Workflow](#5-end-to-end-operational-workflow)
6. [Troubleshooting & Verification](#6-troubleshooting--verification)

---

## 1. Architecture Overview

The system is designed as a **serverless, fully manual weighbridge application**:
- **Hosting**: Vercel (Serverless Edge & Node.js functions)
- **Database**: Supabase Managed PostgreSQL
- **Data Flow**:
  1. System Administrator creates Orders (Dispatch or Receipt).
  2. System Administrator / Transporter creates Bookings against Orders (Truck Plate, Driver, Target Tonnage).
  3. Approved truck automatically enters the **Operator Arrival Queue**.
  4. Truck arrives on the weighbridge (Empty). Operator inputs the physical scale reading (**1st Weighment / Tare**).
  5. Truck loads inside yard.
  6. Truck returns to weighbridge. Operator inputs physical scale reading (**2nd Weighment / Gross**).
  7. System automatically computes:
     $$\text{Net Weight} = \text{Gross Weight} - \text{Tare Weight}$$
  8. A tamper-evident cryptographic waybill is generated and printed.

No hardware daemons, COM ports, RFID readers, boom gates, or IoT brokers are required.

---

## 2. Database Setup (Supabase)

### Step 1: Create a Project
1. Visit [supabase.com](https://supabase.com) and create a new project.
2. Choose your region (e.g. `af-south-1` Cape Town or closest).

### Step 2: Apply the Database Schema
You can apply the database schema directly in the Supabase Dashboard:
1. Navigate to **SQL Editor**.
2. Copy and paste the contents of:
   `supabase/migrations/20260914000001_manual_weighbridge_schema.sql`
3. Click **RUN**.

### Step 3: Seed Initial Administrator & Test Site
In your development environment, run:
```bash
npm run db:seed
```

Default credentials created:
- **Administrator**: `admin@weighbridge.co.za` (Password: `AdminPass123!`)
- **Weighbridge Operator**: `operator@weighbridge.co.za` (Password: `OperatorPass123!`)
- **Transporter**: `transporter@weighbridge.co.za` (Password: `TransporterPass123!`)

---

## 3. Cloud Application Deployment (Vercel)

### Option A: Via GitHub Integration (Recommended)
1. Push your repository to GitHub:
   `https://github.com/Bafana4949/Weighb1.0.git`
2. Go to [vercel.com/new](https://vercel.com/new).
3. Import `Bafana4949/Weighb1.0`.
4. Vercel will automatically detect `vercel.json` and Next.js.
5. In **Environment Variables**, configure the variables listed in Section 4.
6. Click **Deploy**.

### Option B: Via Vercel CLI
```bash
npm install -g vercel
vercel login
vercel --prod
```

---

## 4. Environment Variables Reference

Configure the following variables in **Vercel Project Settings > Environment Variables**:

| Variable | Description | Example |
| :--- | :--- | :--- |
| `DATABASE_URL` | Supabase Pooler Connection String | `postgresql://postgres.[ID]:[PASS]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true` |
| `DIRECT_URL` | Supabase Direct Connection String | `postgresql://postgres.[ID]:[PASS]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL | `https://[PROJECT_ID].supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`| Supabase Public Anon Key | `eyJh...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role Key | `eyJh...` |
| `AUTH_SECRET` | NextAuth Secret (32+ chars) | `openssl rand -base64 32` |
| `AUTH_TRUST_HOST` | Trust Vercel Host Header | `true` |
| `NEXT_PUBLIC_APP_URL` | Production Domain URL | `https://weighb1.vercel.app` |
| `PASSWORD_PEPPER` | Password Encryption Salt | `weighbridge-secret-pepper` |

---

## 5. End-to-End Operational Workflow

### 1. Order Creation (System Administrator)
- Navigate to `/admin/orders`.
- Click **New Dispatch Order** or **New Receipt Order**.
- Enter Product (e.g., RB1 Export Coal), Target Mass (e.g., 5,000 Tons), Source, Destination, and Customer/Supplier.

### 2. Fleet Assignment / Booking (Administrator or Transporter)
- In `/admin/orders`, click **Assign Fleet** on any active order.
- Select Transporter Carrier, Vehicle Plate, and Driver.
- Click **Submit Assignment**.
- The booking is created with status `APPROVED`.

### 3. Arrival Queue & 1st Weighment (Weighbridge Operator)
- Navigate to `/operator`.
- The assigned truck automatically appears in the **Arrival Queue · Ready for 1st Weight**.
- Truck pulls onto the physical weighbridge.
- Operator enters the scale reading shown on the digital indicator (e.g., `14,500 kg`).
- Click **1st Weigh (Weigh-In)**.
- The 1st weight is captured; truck status moves to yard entry.

### 4. In Yard & 2nd Weighment (Weighbridge Operator)
- The vehicle is displayed in the **In Yard · Awaiting 2nd Weight** section with its tare weight and time in yard.
- The truck completes loading cargo in the pit/stockpile.
- Truck pulls back onto the weighbridge.
- Operator clicks **Weigh Out (2nd Weight)**.
- Operator enters the loaded scale reading (e.g., `48,500 kg`).
- Net cargo weight is automatically computed ($48,500 - 14,500 = 34,000\text{ kg}$).
- Click **Finalize Weighment & Issue Waybill**.

### 5. Waybill Issuance
- Official tamper-evident waybill is generated with SHA-256 integrity hash.
- Operator prints:
  - Client / Office Copy (A4 PDF)
  - Driver Copy (A4 PDF)
  - 80mm Thermal Receipt Slip
- Public verification available at `/verify/[hash]`.

---

## 6. Troubleshooting & Verification

- **Prisma Schema Generation**: Run `npm run db:generate` to regenerate the Prisma client.
- **Local Dev Server**: Run `npm run dev:web` to launch on `http://localhost:3010`.
- **Database Status**: Check table records directly in Supabase Table Editor.

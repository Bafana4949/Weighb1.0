# 🤖 Weighbridge Management System: Claude Code AI Peer Audit & Deployment Prompt

> **Instructions for Claude Code AI**:  
> You are acting as an expert systems architect and cybersecurity code auditor for the **Weighbridge & Access Control Management System**. Review the codebase, audit multi-tenant data boundaries, inspect the hardware scale indicator integration, and verify production deployment readiness.

---

## 🏛️ System Architecture Context

- **Framework**: Next.js 15 (App Router), React 19, TypeScript.
- **Database & ORM**: PostgreSQL (Supabase) via Prisma ORM 6.
- **Authentication**: NextAuth v5 + JWT tokens with RBAC and multi-tenancy.
- **Hardware Integration**:
  - Web Serial API directly connecting the browser to physical weighbridge indicators (Mettler Toledo IND560/IND570/IND780, Toledo 8142, and Avery Weigh-Tronix).
  - Serial framing: 9600 / 4800 baud, supporting both `8-N-1` (8 data bits, no parity) and `7-E-1` (7 data bits, even parity with parity bit masking).
- **Cryptographic Waybill Integrity**: Each completed transaction is cryptographically chained via SHA-256 (`previousHash`, `integrityHash`, `confirmationHash`).

---

## 👥 Verified Actor Hierarchy & Credentials

| Role / Persona | User Identity | Email Address | Assigned Organisation | Access Scope |
| :--- | :--- | :--- | :--- | :--- |
| **👑 Platform Super Admin** | **Bafana Bhuda** | `superadmin@weighbridge.co.za` | Platform-wide (`organisationId: null`) | Full cross-tenant control, client onboarding, global site provisioning, audit logs, consolidated reports. |
| **🏢 Client / Company Admin** | **Grant Howell** | `grant@treadstone.co.za` | **Coal In Motion** (`COALINMOTI`) | Scoped strictly to Coal In Motion sites, contracts, orders, haulier assignments, and user permissions. |
| **🏢 Mining Company Admin** | **Sipho Dlamini** | `admin@seriti.co.za` | **Seriti Coal Operations** (`SERITICOAL`) | Scoped strictly to Seriti sites, orders, and weighments. |
| **🖥️ Weighbridge Operator** | **John Moyo** | `operator@seriti.co.za` | **Seriti Coal Operations** (`SERITICOAL`) | Operates live scale deck, captures weighments from indicator, generates waybills. |
| **🚛 Transporter Admin** | **Irfan Zad** | `irfan@treadstone.co.za` | **Thaba Logistics Test** (`THABALOGIS`) | Manages fleet roster (trucks, trailers, drivers), books slots, views trip waybills. |

---

## 🔒 Multi-Tenant Boundary Checklist for Claude Code AI

Please inspect and verify the following security boundaries:
1. **Transaction Isolation**:
   - `apps/web/src/app/api/transactions/route.ts`: Non-transporter, non-superadmin users MUST filter by `site: mineScope(user.organisationId)`.
   - `apps/web/src/app/api/transactions/stats/route.ts`: Aggregated stats must be scoped by the tenant's sites.
2. **Fleet & Driver Isolation**:
   - `apps/web/src/app/api/drivers/route.ts`: Only Platform Super Admin can query cross-organisation drivers (`?org=...`). All other users are locked to their own organisation.
   - `apps/web/src/app/api/vehicles/route.ts` & `apps/web/src/app/api/trailers/route.ts`: Scoped to the caller's organisation.
3. **Manual Weighment Access**:
   - `apps/web/src/app/api/transactions/manual/route.ts`: Operators can only record weighments for sites owned by their organisation. Platform Super Admin can operate across all sites.

---

## ⚖️ Weighbridge Hardware Indicator Checklist

1. **Protocol Implementation** (`apps/web/src/components/live-operator-dashboard.tsx`):
   - **Toledo Continuous Protocol**:
     - Format: `STX <SWA><SWB><SWC><6 chars indicated weight><6 chars tare><CR>`
     - Extracted digits must correctly handle leading zeros and spaces (e.g. ` 2200` or `002200` &rarr; `2200 kg`).
   - **Parity Masking**:
     - When receiving in 7-E-1 (7 data bits, even parity), bytes must be masked with `0x7F` to prevent UTF-8 corruption and ensure reliable ASCII number parsing.
   - **MT-SICS Compatibility**:
     - Supports `S S <weight> kg`, `ST,GS,+ <weight> kg`, `Net <weight> kg`.
2. **Operator Interface**:
   - Live stream diagnostic feed displays real-time frame packets.
   - Selectors for Baud (9600, 4800, 2400) and Framing (`8-N-1`, `7-E-1`, `7-O-1`).

---

## 🚀 Execution & Verification Commands

```bash
# 1. Typecheck and Next.js production build verification
npm run build

# 2. Test database connectivity & users
node scripts/apply-users-update.mjs

# 3. Check Git remote synchronization
git status
git remote -v
```

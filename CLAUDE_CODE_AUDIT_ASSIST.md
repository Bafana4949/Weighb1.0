# 🤖 Weighbridge Management System: Architecture & Solution Consultation with Claude Code

> **Objective for Claude Code AI**:  
> The team has verified your audit findings against the source code. Every primary finding you highlighted (fail-open multi-tenancy, independent 20 kg rounding, decorative hash chain, concurrent waybill numbering, manual weighment bypass, and committed secrets) is confirmed.  
> 
> Before we start modifying production code, we want your input, architectural critique, and recommended implementation patterns for the following core challenges.

---

### 1. ⚖️ Weight Precision & Total Elimination of Rounding
* **User Directive**:  
  *"I don't want the system to have independent 20 kg rounding. I want the system to get the exact weight from the indicator connected to the computer, or written manually. The system must NOT round up anything."*
* **Current Code Problem**:  
  `apps/web/src/lib/utils.ts:26`: `formatKg(val)` runs `Math.round(val / 20) * 20` independently on gross, tare, and net, causing legal and commercial contradictions (`Gross - Tare ≠ Net`).
* **Questions for Claude**:
  1. What is your recommended pattern for `formatKg(value: number): string` to display exact recorded kilograms (e.g. `14,532 kg` or exact integer/decimal) without any quantization?
  2. How should we guarantee across all 4 touchpoints (Waybill PDF, Thermal Slip, Kiosk screen, Public `/verify/[hash]` page) that `Net` is strictly computed as `Gross - Tare` with zero rounding drift?
  3. In the database schema, should weight fields remain `Int` (whole kg) or `Float`/`Decimal` if precision indicators output 0.5 kg or 0.1 kg increments?

---

### 2. 🏢 Fail-Closed Multi-Tenancy Architecture
* **Current Code Problem**:  
  - `User.organisationId` is nullable.
  - `permissions.ts:13` treats any admin with `organisationId === null` as a platform super admin.
  - `access.ts:16` returns `{}` when `organisationId` is null, causing Prisma queries to return cross-tenant data.
  - `/api/admin/users/[id]/role` allows any tenant admin to elevate users across any tenant.
* **Target Personas**:
  - **Bafana Bhuda** (`superadmin@weighbridge.co.za`): **Platform Super Admin** (`platformRole: "PLATFORM_SUPER_ADMIN"`).
  - **Grant Howell** (`grant@treadstone.co.za`): **Client / Company Admin** (`role: "ADMIN"`, strictly scoped to **Coal In Motion** `COALINMOTI`).
* **Questions for Claude**:
  1. What is the safest fail-closed pattern for `mineScope(orgId?: string | null)`? (e.g., throwing an `UnauthorizedError` or returning `{ id: "__DENY_NO_TENANT__" }` unless the session has an explicit verified `isSuperAdmin === true` flag).
  2. How should we restructure `/api/admin/users/[id]/role` to ensure:
     - Platform Super Admin can manage all roles globally.
     - Tenant Admins can ONLY manage roles for users within their own organisation, and CANNOT promote anyone to `ADMIN` or `PLATFORM_SUPER_ADMIN`?
  3. For the remaining unscoped routes (`vehicles/[id]`, `drivers/[id]/blacklist`, `orders/[id]` GET), what is the cleanest guard pattern to apply consistently across all Next.js App Router API handlers?

---

### 3. 🔌 Hardware Indicator Continuous Protocol & Stability
* **Current Code Problem**:  
  - Indicator parsing had fallback regexes that could grab random noise as weight.
  - "STABLE" bit was not strictly gated.
  - Direct entry defaulted to pre-filled weights (`14500` / `48500`) in `live-operator-dashboard.tsx:381`.
* **Questions for Claude**:
  1. For Toledo Continuous Protocol (`STX <SWA><SWB><SWC><6 chars weight><6 chars tare><CR>`), how should we parse Status Word B (SWB) to check the motion/stability bit before allowing capture?
  2. What is your recommended UI safety pattern when direct manual entry is used (e.g. requiring an explicit "Manual Scale Override" checkbox + operator reason log)?

---

### 4. 🔗 Hash Chain Verification & Cryptographic Integrity
* **Current Code Problem**:  
  `/verify/[hash]/page.tsx` simply looks up the record by `integrityHash` and declares it authentic without recomputing the SHA-256 hash.
* **Questions for Claude**:
  1. What canonical fields should compose the SHA-256 `integrityHash` (e.g., `ticketNumber`, `siteId`, `vehicleReg`, `grossKg`, `tareKg`, `netKg`, `timestamp`, `previousHash`)?
  2. How should the `/verify/[hash]` page and background verification worker recompute and compare the hash, and what tamper alerting should be triggered if a discrepancy is detected?

---

### 5. 🏷️ Waybill Numbering & Site Binding
* **Current Code Problem**:  
  - Waybill numbers are minted with `count() + 1`, which collides on concurrent weigh-outs.
  - Weigh-out is not bound to the originating `siteId`.
* **Questions for Claude**:
  1. What is the most robust way in Prisma / Postgres to generate sequential waybill numbers (e.g. `WB-SITE-YYYY-00001`) without race conditions or deadlocks?
  2. Should weigh-out be strictly locked to the same `siteId` as weigh-in, or should cross-site weighments (e.g., weigh-in at Mine A, weigh-out at Port B) be explicitly permitted with separate `weighInSiteId` and `weighOutSiteId` audit fields?

---

### 6. 🧹 Secret Hygiene & Cleanup Plan
* **Proposed Actions**:
  - Add `.env` and `apps/web/.env` to `.vercelignore`.
  - In `packages/database/seed.ts`, remove password overwrite for existing super admin.
  - Delete unauthenticated debug endpoints: `/api/debug`, `/api/debug-roles`, `/api/debug/auth-test`, `/api/seed-rbac`.
* **Question for Claude**:
  Are there any other operational vectors or script paths in the repository that should be retired before going live?

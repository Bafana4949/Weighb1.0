# E2E Verification Brief — Weighbridge System (post-commit 4268525)

**Target Audience:** QA Engineers, Security Auditors, Deployment Team  
**System State:** Multi-Tenant Isolation Enforced, Zero-Rounding Formatter, Super-Admin Lockout Resolved  

---

## ⚠️ Environment & Safety Instructions (Read First)

> [!CAUTION]
> **DO NOT RUN WEIGHMENT TESTS AGAINST PRODUCTION.**  
> Weighments are immutable, cryptographic hash-chained records. A test weighment permanently writes to the site's chain and increments tonnage in billing and reports with no void mechanism currently available.  
> 
> **Environment Rules:**
> 1. Run all write tests (Orders, Bookings, Weighments) against a **Preview / Staging deployment** connected to an isolated Supabase test project.
> 2. If testing against **Production**, restrict testing strictly to:
>    - Read-only page visits across all three personas.
>    - Negative isolation probes (confirming HTTP 403 / 404 on cross-tenant entity IDs).
>    - Deployment surface checks (security headers, deleted endpoints 404, health check).

### Evidence to Capture for Every Step
* **Browser:** Chrome with DevTools open (Console and Network tabs).
* **Console:** Any JavaScript or CSP violation errors.
* **Network:** Status codes (confirming 200 on allowed, 403/404 on isolated).
* **Headers:** Verify security headers on the document response (`Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`).
* **Screenshots:** Attach full viewport captures for each section.

---

## Section A: Platform Super Admin (Bafana Bhuda)
**Persona:** `platformRole: "PLATFORM_SUPER_ADMIN"`, `organisationId: null`

1. **Pre-flight Database Check:**
   Confirm `platform_role` is set on the live user row:
   ```sql
   SELECT id, email, role, platform_role, organisation_id FROM users WHERE platform_role IS NOT NULL;
   ```
2. **Page Load Sweep (HTTP 200 & Real Content):**
   Navigate to each route and confirm it renders real data and does **not** trigger `error.tsx` (the access-denied boundary):
   - `/admin` (Platform overview)
   - `/admin/users`
   - `/admin/sites`
   - `/admin/orders`
   - `/admin/products`
   - `/admin/sources`
   - `/admin/destinations`
   - `/admin/reports`
   - `/admin/raw-data`
   - `/admin/billing`
   - `/admin/bookings`
   - `/admin/incidents`
   - `/admin/fraud`
   - `/admin/fleet`
   - `/admin/companies`
   - `/admin/transporters`
   - `/admin/roles`
   - `/admin/service-orders`
   - `/admin/audit-log`
3. **Tenant & Entity Creation:**
   - Create a new Client Organisation (e.g. `Test Mining Corp`).
   - Create a Site under that organisation.
   - Create a Tenant Admin user under that organisation (record generated credentials).
   - Create a Product, Source, and Destination under the new site.
4. **Order Lifecycle:**
   - Create an Order against the new site.
   - Assign trucks/transporters to the order.
5. **Multi-Filter Verification on Raw Data:**
   - On `/admin/raw-data`, apply two simultaneous filters (e.g., `Order No` + `Supplier`, or `Source` + `Destination`).
   - Confirm both filters remain applied (previously dropped all but the last filter).
6. **Cross-Tenant Oversight:**
   - Confirm Bafana sees aggregated records from multiple tenants on `/admin` and `/admin/raw-data`.

---

## Section B: New Tenant Admin (Isolation Probes)
**Persona:** The Tenant Admin created in Step A3 (e.g. `Test Mining Corp Admin`)  
*Run this session in an incognito window or separate Chrome profile alongside Session A.*

1. **Autonomous Boundary Check:**
   - Confirm this admin sees **only** their own organisation's sites, orders, fleet, and reports.
2. **Negative Isolation Probes (Must return 403 or 404, never data):**
   Using entity IDs belonging to another tenant (e.g. Coal In Motion) obtained from Session A, test each endpoint:
   - `GET /api/orders/<other_org_order_id>` $\rightarrow$ `404 Not Found`
   - `GET /api/bookings/<other_org_booking_id>` $\rightarrow$ `404 Not Found`
   - `POST /api/bookings/<other_org_booking_id>/approve` $\rightarrow$ `403 Forbidden` / `404 Not Found`
   - `GET /api/sites/<other_org_site_id>` $\rightarrow$ `404 Not Found`
   - `GET /api/sites/<other_org_site_id>/hardware` $\rightarrow$ `404 Not Found`
   - `GET /api/vehicles/<other_org_vehicle_id>` $\rightarrow$ `404 Not Found`
   - `GET /api/vehicles/<other_org_vehicle_id>/history` $\rightarrow$ `404 Not Found`
   - `GET /api/drivers/<other_org_driver_id>` $\rightarrow$ `404 Not Found`
   - `PUT /api/drivers/<other_org_driver_id>/blacklist` $\rightarrow$ `403 Forbidden` / `404 Not Found`
   - `GET /api/service-orders/<other_org_service_order_id>` $\rightarrow$ `404 Not Found`
   - `GET /waybills/<other_org_transaction_id>` $\rightarrow$ Access Denied / 404
3. **Privilege Escalation Probes:**
   - `PUT /api/admin/users/<other_user_id>/role` $\rightarrow$ Refused / 403 Forbidden.
   - Attempt to pass `platformRole: "PLATFORM_SUPER_ADMIN"` through user update $\rightarrow$ Refused / Stripped.
4. **Bulk CSV Spoofing Probe:**
   - Submit `POST /api/vehicles/bulk` and `POST /api/drivers/bulk` with CSV rows specifying another tenant's `organisationId`.
   - Confirm records are either rejected or attributed strictly to the caller's `organisationId`.
5. **Metric Isolation:**
   - Confirm `/api/transactions/stats` and `/api/reports/daily-summary` return solely the caller's tonnage and count.

---

## Section C: Transporter Verification
**Persona:** Transporter / Haulier User

1. **Portal Boundary:**
   - Fleet, bookings, trip history, and the 4 `/api/transporter/reports/*` endpoints must be restricted to their own organisation.
2. **Aggregations:**
   - Confirm `/api/transactions/stats` and `/api/reports/daily-summary` show only trips for their assigned vehicles/bookings, not platform-wide numbers.

---

## Section D: Operator Dashboard & Weighment (Staging Only)
*Driven manually or via virtual COM port (e.g. `com0com` / serial framing script).*

1. **Indicator Connection & Stability Word:**
   - Connect scale via Web Serial.
   - Confirm live streaming telemetry updates in real-time.
   - Confirm status badge transitions dynamically between `[STABLE]` and `[MOTION]` according to the Toledo framing status word.
2. **Stability Interlock:**
   - Confirm the weighment capture button is disabled/blocked while the indicator reports `MOTION`.
   - Confirm capture is enabled only when status is `STABLE`.
3. **Watchdog Disconnect Test:**
   - Disconnect the serial connection mid-stream.
   - Confirm the 2.5-second watchdog flags the scale as `STALE / OFFLINE` rather than locking the last weight indefinitely.
4. **Manual Weight Fallback:**
   - Open manual weight dialog.
   - Confirm input starts empty (no default 14,500 kg / 48,500 kg pre-fill).
   - Test invalid entries: reject decimals (`14250.5`), negative numbers, zero, and strings.
5. **Exact Integer Precision & Invariant Verification:**
   - Finalise a weighment.
   - Verify printed waybill renders exact integer kilograms:
     $$\text{Gross} - \text{Tare} = \text{Net}$$
   - Confirm the exact numbers match the database record and `/verify/<hash>`.
6. **Hash-Chain Tamper Detection:**
   - On staging, alter a transaction weight directly in the database.
   - Reload `/verify/<hash>`.
   - Confirm the system flags the record as **TAMPERED / FAILED VERIFICATION**.

---

## Section E: Known-Defect Probes (Document, Do Not Fix)
These items are documented for QA tracking and justify subsequent roadmap sprints:

1. **Waybill Concurrency Race:**
   - Open two tabs at the same site.
   - Finalise two weighments simultaneously.
   - Expected behavior: Duplicate number collision / 500 error under `max + 1` logic.
2. **Session Invalidation Lag:**
   - Log in as a tenant admin.
   - In another browser as Super Admin, revoke their role or deactivate their account.
   - Expected behavior: Existing JWT continues to operate until token expiration (up to 8 hours).

---

## Section F: Deployment & Security Perimeter
1. **Deleted Backdoor Endpoints (Must return 404):**
   - `GET /api/debug` $\rightarrow$ `404`
   - `GET /api/debug-roles` $\rightarrow$ `404`
   - `GET /api/seed-rbac` $\rightarrow$ `404`
   - `GET /api/debug/auth-test` $\rightarrow$ `404`
   - `GET /api/admin/debug/seed` $\rightarrow$ `404`
   - `POST /api/auth/login` $\rightarrow$ `404`
2. **Security Headers on First Document Load:**
   - `Content-Security-Policy`
   - `Strict-Transport-Security`
   - `X-Frame-Options: DENY`
   - `X-Content-Type-Options: nosniff`
   - `Referrer-Policy: strict-origin-when-cross-origin`
3. **Console Hygiene:**
   - Confirm **0 CSP violations** logged in DevTools console across both the Operator Dashboard and Admin Console.
4. **Health Endpoint:**
   - `GET /api/health` returns status without leaking internal database host or connection string.

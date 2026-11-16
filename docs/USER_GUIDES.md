# User guides

Task-oriented guides for each role. What a user sees depends on two things: their role, and which company and sites they are scoped to (`docs/SECURITY.md`, section 3).

| Persona | How the system knows | Main screens |
|---|---|---|
| Platform Super Admin | `platformRole = PLATFORM_SUPER_ADMIN` | Everything, all companies |
| Company Admin | Role ADMIN, no site assignments | Administration of one company, all its sites |
| Site Admin | Role ADMIN with one or more site assignments | Administration limited to assigned sites |
| Operator | Role OPERATOR | Weighbridge Station, Incidents |
| Security | Role SECURITY | Weighbridge Station, Incidents |
| Transporter | Role TRANSPORTER in a haulier organisation | Fleet, Waybills, Reports |

The label under your name in the sidebar shows which persona you are signed in as. All screens work on tablets and phones ([26-tablet-hardware-health.png](screenshots/26-tablet-hardware-health.png), [27-phone-operator.png](screenshots/27-phone-operator.png), [28-phone-menu.png](screenshots/28-phone-menu.png)).

## Signing in

1. Open the platform URL and sign in with your email and password ([01-login.png](screenshots/01-login.png)).
2. After 10 failed attempts on one account within 15 minutes, sign-in is blocked for the rest of that window. Wait, or ask an administrator to reset your password.
3. **Forgot password** emails a single-use link valid for one hour (requires SMTP to be configured).
4. Sessions last up to 8 hours.

---

## 1. Platform Super Admin

### 1.1 Overview

**Overview** shows platform-wide activity across companies ([02-super-admin-dashboard.png](screenshots/02-super-admin-dashboard.png)).

### 1.2 Register a company

1. **Platform Admin → Companies** ([03-company-management.png](screenshots/03-company-management.png)).
2. **Create Client**: enter the company details and the first administrator's name, email and password. The company and its Company Admin login are created together.
3. From the same list you can reset a user's password, **Suspend**, **Archive**, **Activate** or **Delete** a company. Suspending a company locks out all its users on their next request.

### 1.3 Set a company's licence tier

New companies are licensed for **Manual**. On **Platform Admin → Companies**, change the **Licence** selector in the *Sites / licence* column (or `PUT /api/admin/companies/{id}` with `{"licensedTier": "SEMI_AUTOMATIC"}`).

A downgrade is refused while an active site of that company runs above the new licence. The change is recorded as `COMPANY_LICENCE_CHANGED`. Details: `docs/TIERS.md`, section 6.

### 1.4 Create a site with the wizard

1. **Platform Admin → Site setup wizard** ([10-site-wizard-company.png](screenshots/10-site-wizard-company.png), [11-site-wizard-tier.png](screenshots/11-site-wizard-tier.png)).
2. Work through Company, Site, Tier, Weighbridges, Hardware, Workflows, Review, then **Create**. The site is created inactive.
3. Follow the checklist: complete device settings in the hardware centre, add products, create users and assign site access, review roles.
4. Press **Validate & activate site**. Activation succeeds only when there are no readiness blockers.

Full reference: `docs/HARDWARE_CONFIGURATION.md`, section 12.

### 1.5 Configure hardware

**Hardware → Configuration** ([05-hardware-config-fully-automatic.png](screenshots/05-hardware-config-fully-automatic.png), [06-hardware-config-devices.png](screenshots/06-hardware-config-devices.png), [07-hardware-device-editor.png](screenshots/07-hardware-device-editor.png), [08-hardware-config-manual-tier.png](screenshots/08-hardware-config-manual-tier.png)):

1. Choose company, site and lane.
2. Set the operating tier and permitted workflows; **Save tier settings**.
3. Apply a hardware template, then open each device and fill in addresses, ports and channels.
4. Run **Check configuration & status** on each device, and the live read for Web Serial scales and NFC readers.

### 1.6 Issue an edge key

In the **Edge controller** card press **Issue key** (or **Rotate key**), copy the key at once, and give it to the technician installing the edge (`WB_SITE_API_KEY`). It is shown only once. **Revoke** locks the edge out immediately. See `docs/EDGE_DEPLOYMENT.md`.

### 1.7 Monitor hardware

**Hardware → Hardware health** ([09-hardware-health.png](screenshots/09-hardware-health.png)) shows every active site: edge status, last heartbeat, MQTT, pending sync and each device's state. It refreshes every 15 seconds. Devices are shown Offline after three missed heartbeats.

**Hardware → RFID / NFC tags** issues cards and tags to drivers and trucks; **Installations** records weighbridge installations.

### 1.8 Platform report

**Analytics & Data → Platform report** ([12-platform-report.png](screenshots/12-platform-report.png)) consolidates activity across all companies. Only the super admin can open it.

### 1.9 Audit log

**Audit log** ([13-audit-log.png](screenshots/13-audit-log.png)) lists every audited action across the platform with the actor, role, site, reason and before/after data.

### 1.10 Transporters

**Transporters** lists haulier organisations. Hauliers can apply through the public `/apply` page; approve or reject their applications here.

---

## 2. Company Admin

A Company Admin is an ADMIN user of a company with no site assignments. They see every site of their own company and nothing of other companies.

### 2.1 Dashboard

**Overview** summarises the company's activity ([14-company-admin-dashboard.png](screenshots/14-company-admin-dashboard.png)).

### 2.2 Sites

**Master Data → Sites** lists the company's sites ([04-site-management.png](screenshots/04-site-management.png)). New sites are created by the platform super admin. Open **View Details** on a site to set its **Weighing options**, including the optional *weigh loaded once* and *weigh empty once* modes ([29-site-weighing-options.png](screenshots/29-site-weighing-options.png)); see section 4.7. **Hardware → Configuration** is read-only for Company Admins; **Hardware → Hardware health** shows their sites ([18-hardware-health-company.png](screenshots/18-hardware-health-company.png)). Device tests (read-only) can be run.

### 2.3 Users and site access

**Access Control → Users**:

1. Create Operator and Security users for the company. **Only the platform super admin can create Administrator accounts**, or change a user to or from Administrator.
2. To restrict a user to particular sites, add **site access** rows. A user with no site access works at every company site. An ADMIN with site access becomes a **Site Admin**.
3. Reset passwords and suspend users as needed.

**Access Control → Roles** creates company roles from the permission catalogue and assigns them to users. A user with custom role assignments gets only the permissions of those roles. Assign the built-in **SUPERVISOR** role to staff who may type weights at Fully Automatic sites (`transaction.override`).

### 2.4 Products

**Master Data → Products**: the products the company weighs. The operator console offers these in its product picker for walk-in weighments. Sources and destinations are maintained on the neighbouring screens.

### 2.5 Orders

**Operations → Orders** ([16-orders.png](screenshots/16-orders.png)):

1. Create a dispatch or receipt order: product, target mass, source, destination, customer or supplier. Only the platform super admin can set the commercial rate.
2. **Assign Fleet**: choose transporter, vehicle and driver to create approved bookings. Approved trucks appear in the operator's arrival queue.
3. **Pause** hides an order's trucks from the weighbridge queue; **Resume** shows them again.
4. **Constant weights / Fast-Track**: record a constant empty tare or loaded gross on the order, and apply it in bulk to the order's waiting trucks (first weigh) or in-yard trucks (second weigh). Fast-track is audited. Note: it is not subject to the tier's typed-weight reason rule.

**Bookings** lists and approves or rejects bookings.

### 2.6 Transporters

**Transporters** shows the hauliers working for the company and their onboarding status.

### 2.7 Reports

**Analytics & Data → Reports** ([15-reports.png](screenshots/15-reports.png)): filter by site, date, product and order; export CSV and PDF. Exports are rate-limited (20 per 5 minutes). Times are shown in South African Standard Time.

### 2.8 Incidents and exceptions

**Operations → Incidents** ([17-incidents-exceptions.png](screenshots/17-incidents-exceptions.png)) lists exceptions to review and resolve: typed weights at automated sites (`MANUAL_OVERRIDE`), driver or plate mismatches, overloads, scale and sensor faults, cloud sync failures.

### 2.9 Audit log

**Audit log** shows entries for the company only.

---

## 3. Site Admin

A Site Admin is an ADMIN user with one or more site assignments ([19-site-admin-dashboard.png](screenshots/19-site-admin-dashboard.png)). Compared with a Company Admin:

| Area | Site Admin |
|---|---|
| Sites, orders, bookings, transactions, incidents, reports, hardware health | Only assigned sites |
| Audit log | Entries for assigned sites only |
| Users, roles, role assignments, site access, password resets | **Refused** ("Only company-wide administrators can manage users and access"). A Site Admin cannot grant themselves more sites |
| Hardware configuration | Read-only ([20-site-admin-hardware-readonly.png](screenshots/20-site-admin-hardware-readonly.png)); device tests allowed |
| Records of other sites | Not found (404) |

---

## 4. Operator

**Weighbridge Station** (`/operator`) is the operator console ([21-operator-console-manual.png](screenshots/21-operator-console-manual.png), [22-operator-console-semi.png](screenshots/22-operator-console-semi.png)).

### 4.1 Connect the scale indicator (Web Serial)

1. Use Chrome or Edge on the weighbridge PC.
2. Choose the site at the top if you work at more than one.
3. Press **Auto-Detect Scale** to probe baud rate and framing automatically, or pick them and press **Manual Connect**. The first time, the browser asks you to choose the COM port.
4. The gauge shows the live reading. If no data arrives for 2.5 seconds the console shows "SIGNAL LOST — CHECK INDICATOR CABLE".

The IT team can remove the port prompt with `scripts/enable-scale-serial-policy.ps1` (`docs/TROUBLESHOOTING.md`). If the indicator cannot be connected, type the weight from the indicator display into **Operator scale input**.

### 4.2 Two-pass weighing (1st and 2nd weigh)

1. **Arrival queue** lists approved bookings waiting for a first weight. Use the order filter to focus on one order.
2. Truck on the deck: **Record 1st Weight**. Choose the truck from the queue, confirm **Dispatch** (1st = empty tare, 2nd = loaded gross) or **Receipt** (1st = loaded gross, 2nd = empty tare), check the weight, and press **Record 1st Weight & Authorize Entry**. The truck moves to **In Yard (Awaiting 2nd)**.
3. Truck returns: **Record 2nd Weight** (or **Weigh Out** on the in-yard card). Select the in-yard truck, check the weight, press **Finalize Weighment & Issue Waybill**. Net weight is gross minus tare.

### 4.3 Direct entry

**Direct Waybill Entry** records both weights in one step and issues a completed waybill. Use it when both readings are already known.

### 4.4 Walk-in trucks

**+ Walk-In Truck** (or **Walk-In / Ad-Hoc Truck** in the weighing dialog) is for trucks without a booking. Enter plate, driver name, optionally trailer and transporter, and choose the product.

### 4.7 Weigh once (when enabled for the site)

If an admin has ticked the options for your site, the 1st-weigh dialog shows **Weigh once (optional)** ([30-operator-weigh-once.png](screenshots/30-operator-weigh-once.png)):

- **Empty truck:** tick it, capture the empty weight and press **Store Empty Weight**. The truck's stored empty weight is updated; there is no second weighing and no waybill. A driver name is not needed.
- **Loaded truck:** tick it, capture the loaded weight and press **Complete with Stored Empty Weight**. The transaction completes immediately with net = loaded − stored empty weight, and the waybill is issued. The dialog shows the stored empty weight for queued trucks, or warns when the truck has none yet.

Leave both unticked for normal two-pass weighing.

### 4.5 Constant weights

If the order has a constant tare or gross, the weighing dialog offers a button to insert it. An inserted constant counts as a typed weight (see 4.6).

### 4.6 Typed weights at Semi-Automatic and Fully Automatic sites

When the weight you submit differs from the indicator reading the console captured, it is treated as typed ([23-operator-typed-weight-reason.png](screenshots/23-operator-typed-weight-reason.png)):

| Site tier | What you must do |
|---|---|
| Manual | Nothing extra |
| Semi-Automatic | Enter a reason (at least 5 characters). Quick reasons are offered: "Indicator offline — reading taken from display", "Order constant weight", "Indicator fault logged with technician" |
| Fully Automatic | A reason, and you must hold the supervisor permission (`transaction.override`). Otherwise the system refuses: "Typed weights at a fully automatic site need a supervisor" |

Each typed weight at these tiers is recorded in the audit trail and raised as an exception for review.

### 4.7 Waybills

After the final weight the dialog shows the waybill number. Open the waybill ([25-waybill.png](screenshots/25-waybill.png)) to print:

- Client / Office copy (PDF)
- Driver / Transporter copy (PDF)
- Security / Gate copy (PDF)
- Thermal receipt slip (80 mm): a plain-text slip to print through the operating system. Direct ESC/POS printing is not implemented.

The first print is recorded as a print; every later print is marked **REPRINT** and audited. Each waybill has a QR code linking to the public `/verify/{hash}` page.

### 4.8 Gates (sites with automated gates)

When the site has gates, the console shows **Open Entry Gate** and **Open Exit Gate**. You must give a reason of at least 10 characters. The command goes to the edge controller, which opens the barrier only if its safety checks pass (beams clear, telemetry fresh, lane not in fault), and the command is audited. This works only where the web server is connected to the site's edge controller; otherwise you get "No edge controller you can command is connected to this deployment".

The automation panel on the console (ANPR, beams, traffic lights) shows which devices are configured. It is not a live view of the beams or lights.

### 4.9 Card scanning

On fleet and RFID screens, **Scan card** reads a card UID from the desk NFC reader through the local NFC bridge. If the bridge is not running you will see "Can't reach the card-scanner bridge".

### 4.10 Incidents

**Incidents** is a read-only register of the latest 100 incidents at your sites (time, site, type, details, severity, status). Administrators resolve them on the admin Incidents screen.

---

## 5. Security

Security users have the same **Weighbridge Station** and **Incidents** screens as operators, scoped to their sites. Their built-in permission set is read access plus `incident.create`, `transaction.print` and `hardware.view`. Typical tasks:

- Check a truck's waybill and print its Security / Gate copy.
- Review the incident register for the site.
- Verify a waybill by scanning its QR code (`/verify/{hash}`).

---

## 6. Transporter portal

Transporter users belong to a haulier organisation and see only their own trucks and loads ([24-transporter-portal.png](screenshots/24-transporter-portal.png)).

| Screen | Use |
|---|---|
| **Fleet** | Vehicles and drivers registered to your organisation |
| **Waybills** | Your completed weighments; open and print your own waybills |
| **Reports** | Download CSV exports of your fleet, orders, roster and transactions |

You cannot see other hauliers' trucks on a shared order, and commercial rates are hidden. A haulier that is not yet registered applies through `/apply`; an administrator approves the application.

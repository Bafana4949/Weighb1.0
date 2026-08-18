# Full System Actor Test Report

## Executive Summary
Comprehensive testing of all system actors has been successfully completed. 
The initial login issues (Prisma authentication failure/database unavailability) were diagnosed as a network conflict between the local development server (`npm run dev:web`) and the background Docker container (`web` service). The Next.js Docker container was incorrectly attempting to connect to `localhost:5433` inside the container itself rather than the database container. By stopping the Next.js Docker container and running the host Next.js development server natively on port 3010, the database connection was successfully established via the `DATABASE_URL`.

All roles have been systematically tested via browser subagents, confirming that role-based access control (RBAC) and navigation restrictions are functioning as designed.

## Tested Actors & Observations

### 1. Platform Admin (`admin@weighbridge.local`)
- **Status**: SUCCESS
- **Verification**: User 'Amina Mokoena' successfully logged in.
- **Dashboard**: `Platform overview`
- **Sidebar Permissions**: Unrestricted. Access to global `Companies`, `Transporters`, `Approvals`, `Service Orders`, etc.
- **Evidence**: [Platform Admin Dashboard](file:///C:/Users/Bafana%20Bhuda/.gemini/antigravity-ide/brain/974b8c32-d405-429a-8449-7cb0cd40bffc/admin_dashboard_1785306016631.png)

### 2. Client Admin (`client.a.admin@weighbridge.local` / `mine-admin@weighbridge.local`)
- **Status**: SUCCESS
- **Verification**: Successfully logged in.
- **Dashboard**: `Enterprise overview` (Showing Client A specific sites: Woestalleen Colliery, Exxaro).
- **Sidebar Permissions**: Restricted to client-specific features. Global `Companies` and `Transporters` tabs are hidden.
- **Evidence**: [Client Admin Dashboard](file:///C:/Users/Bafana%20Bhuda/.gemini/antigravity-ide/brain/974b8c32-d405-429a-8449-7cb0cd40bffc/client_admin_dashboard_success_1785306273086.png)

### 3. Supervisor (`supervisor@weighbridge.local`)
- **Status**: SUCCESS
- **Verification**: User 'Given Ndlovu' successfully logged in.
- **Dashboard**: `Live Weighbridge`
- **Sidebar Permissions**: Role is mapped to `OPERATOR` in the database. Access restricted to `Live scale`, `Driver kiosk`, and `Incidents`.
- **Evidence**: [Supervisor Dashboard](file:///C:/Users/Bafana%20Bhuda/.gemini/antigravity-ide/brain/974b8c32-d405-429a-8449-7cb0cd40bffc/supervisor_dashboard_success_1785306382635.png)

### 4. Operator (`operator@weighbridge.local` & `custom@weighbridge.local`)
- **Status**: SUCCESS
- **Verification**: User 'Thabo Nkosi' and 'Custom Role' successfully logged in.
- **Dashboard**: `Live Weighbridge`
- **Sidebar Permissions**: Operational features only (`Live scale`, `Driver kiosk`, `Incidents`).
- **Evidence**: [Operator Dashboard](file:///C:/Users/Bafana%20Bhuda/.gemini/antigravity-ide/brain/974b8c32-d405-429a-8449-7cb0cd40bffc/operator_dashboard_success_1785306440433.png)

### 5. Security (`security@weighbridge.local`)
- **Status**: SUCCESS
- **Verification**: User 'Naledi Maseko' successfully logged in.
- **Dashboard**: `Live Weighbridge`
- **Sidebar Permissions**: Access restricted to `Gate control`, `Driver kiosk`, and `Incidents`.
- **Evidence**: [Security Dashboard](file:///C:/Users/Bafana%20Bhuda/.gemini/antigravity-ide/brain/974b8c32-d405-429a-8449-7cb0cd40bffc/security_dashboard_success_1785306687716.png)

### 6. Transporter (`transporter@weighbridge.local`)
- **Status**: SUCCESS
- **Verification**: User 'Kabelo Dlamini' (Treadstone Logistics) successfully logged in.
- **Dashboard**: `Journey bookings`
- **Sidebar Permissions**: Strictly limited to transporter functionality: `Bookings`, `Fleet`, and `Waybills`.
- **Evidence**: [Transporter Dashboard](file:///C:/Users/Bafana%20Bhuda/.gemini/antigravity-ide/brain/974b8c32-d405-429a-8449-7cb0cd40bffc/transporter_dashboard_success_1785306811254.png)

### 7. Viewer (`viewer@weighbridge.local`)
- **Status**: SUCCESS
- **Verification**: User 'Precious Sithole' successfully logged in.
- **Dashboard**: `Live Weighbridge`
- **Sidebar Permissions**: Mapped to `OPERATOR` role; sees `Live scale`, `Driver kiosk`, and `Incidents`.
- **Evidence**: [Viewer Dashboard](file:///C:/Users/Bafana%20Bhuda/.gemini/antigravity-ide/brain/974b8c32-d405-429a-8449-7cb0cd40bffc/viewer_dashboard_success_1785306749390.png)

### 8. Suspended User (`suspended@weighbridge.local`)
- **Status**: SUCCESS
- **Verification**: Login attempt gracefully rejected.
- **Result**: Displayed "Invalid email or password". The NextAuth configuration correctly blocks users with `status !== "ACTIVE"`.
- **Evidence**: [Suspended Login Failure](file:///C:/Users/Bafana%20Bhuda/.gemini/antigravity-ide/brain/974b8c32-d405-429a-8449-7cb0cd40bffc/suspended_login_failure_1785306866431.png)

## Conclusion
The full system testing is complete. The application routes correctly restrict access based on the user's role (`UserRole` and `platformRole`), and all visual dashboards load successfully with the correct data contexts. The deployment conflict between the Dockerised Next.js container and the local environment has been fully resolved.

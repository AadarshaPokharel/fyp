# CollisionGuard Frontend UI Architecture

This document summarizes the user interface structure and page connections within the CollisionGuard IoT platform frontend.

## 1. Routing & Access Control (`App.jsx`)

The highest level of the application uses React Router to direct users to specific pages based on their URL. The access to authenticated areas is controlled by a `ProtectedRoute` component which enforces Role-Based Access Control (RBAC).

### Public Routes (No Authentication Required)
These are primary entry points for users and handle account lifecycles.
*   **`/login`** -> `Login.jsx` : Main entry point for the application.
*   **`/set-password`** -> `SetPassword.jsx` : For new users setting their initial password.
*   **`/forgot-password`** -> `ForgotPassword.jsx` : Recovery flow initiation.
*   **`/reset-password`** -> `ResetPassword.jsx` : Completing the recovery flow.

### Shared User Routes (Any Authenticated Role)
These routes are available to any logged-in user, regardless of role.
*   **`/profile`** -> `Profile.jsx` : Manage account, update password, etc.

## 2. Shared Layout (`AppLayout.jsx`)

All authenticated pages are wrapped in a central layout component (`AppLayout`). This ensures a professional and consistent UI across all dashboards.

**Key Layout Elements:**
*   **Sidebar (`Sidebar.jsx`)**: The main navigation menu. It conditionally renders links depending on the logged-in user's role (Admin vs Policy Maker).
*   **Top Header Bar**: Sticky navbar on top providing:
    *   Dynamic Page Title & Subtitle based on the current route.
    *   A mobile menu toggle.
    *   System Status indicator ("System Online").
    *   **Theme Toggle (`ThemeToggle.jsx`)**: Enables consistent light/dark mode switching.
*   **Main Content Area (`<Outlet />`)**: The central region where the specific page content (Admin or Policy Maker components) is seamlessly injected and swapped out as the user navigates.

## 3. Role-Specific Dashboards

The application diverges into distinct experiences based on the user's role.

### Admin Dashboard (Role: `admin`)
Restricted to system administrators, located under `/admin`. It focuses on system oversight and access provisioning.

*   **`/admin`** (Index) -> `AdminDashboard.jsx` : High-level overview of the IoT network and system statistics.
*   **`/admin/policy-makers`** -> `PolicyMakers.jsx` : Interface to create, view, and manage Policy Maker accounts.
*   **`/admin/audit-logs`** -> `AuditLogs.jsx` : Tracks all administrative actions and security events.
*   **`/admin/downloads`** -> `AdminDownloads.jsx` : Oversee and process historical data export requests made by Policy Makers.

### Policy Maker Dashboard (Role: `policy_maker`)
Located under `/dashboard`. Designed for analysts to query sensor data and determine risks.

*   **`/dashboard`** (Index) -> `PMDashboard.jsx` : "Live Monitor" - Real-time IoT telemetry from deployed edge nodes.
*   **`/dashboard/analysis`** -> `CollisionAnalysis.jsx` : View historical collision risk patterns and operational trend data.
*   **`/dashboard/predict`** -> `InteractivePredict.jsx` : ML-powered interactive tool for collision risk simulation based on input metrics.
*   **`/dashboard/requests`** -> `CSVRequests.jsx` : Interface for policy makers to request bulk CSV downloads of sensor data.
*   **`/dashboard/activity`** -> `MyActivity.jsx` : Personal audit trail, displaying their past queries and actions.

## 4. UI Components (`src/components`)
Deeper domain knowledge components that populate the pages:
*   **`charts/`**: Reusable graphical components (e.g., `RiskDistributionChart.jsx`, `CollisionGauge.jsx`) rendered primarily in the Policy Maker dashboards to visually interpret IoT data.
*   **`ui/`**: Core reusable aesthetic parts (like the theme toggler or specialized buttons).
*   **`layout/`**: The structural wrappers like `AppLayout`, `Sidebar`, and `ProtectedRoute`.

---

**Visual Connection Flow Summary:**
1. Unauthenticated users arrive at Public Routes (Login).
2. Upon successful authentication, they are filtered by `ProtectedRoute`.
3. Valid sessions wrap the user in `AppLayout`.
4. Based on Role, `AppLayout/Sidebar` directs them into their specific subdomain boundaries (`/admin/*` or `/dashboard/*`).

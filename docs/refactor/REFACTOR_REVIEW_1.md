# Independent Technical Review 1: BookingManagement Refactor Plan V1

**Reviewer:** Antigravity Independent Technical Reviewer (`agency-code-reviewer`)  
**Target Document:** [`docs/refactor/REFACTOR_PLAN_V1.md`](file:///C:/Users/Admin/Documents/booking-payments/docs/refactor/REFACTOR_PLAN_V1.md)  
**Target Branch:** `booking-payments` (Repository: `https://github.com/QuanVu512/BookingManagement`)  
**Current Workspace State:** Branch `feat/payments`, HEAD `575a037a98aa8cbc0c73ac01dfbd63d42e7d107a`  
**Date:** 2026-10-20  
**Workflow Stage:** Plan V1 → **Review 1 (Antigravity)** → Plan V2.0 (Muse Spark) → Review 2 (Antigravity) → Implement  

---

## 1. Review Verdict

### **VERDICT: REVISION_REQUIRED**

> [!IMPORTANT]
> **Summary Judgment:**  
> `REFACTOR_PLAN_V1.md` is an exceptionally thorough, technically grounded, and disciplined architectural plan. It correctly diagnoses the repository's dirty payment working tree, understands the Next.js/NestJS/Prisma boundaries, avoids unnecessary framework churn, and respects payment invariants.  
> 
> However, Plan V1 cannot be marked `ACCEPTABLE` in its current state because of **three High-severity gaps** and **three Medium-severity edge cases** that must be resolved in **Plan V2.0**:
> 1. **F-01 (High):** Google first-time login onboarding state machine, temporary token mechanics, and collision retry flows are underspecified.
> 2. **F-02 (High):** Proposed `/account/payments` screen causes a client-side $N+1$ HTTP fan-out storm against per-booking payment endpoints due to the lack of a customer payments feed.
> 3. **F-03 (High):** Migration timestamp inversion risk: untracked payment migrations carry future timestamps (`20261021` and `20261022`), requiring strict ordering guards for any new auth schema migration.
> 4. **F-04 (Medium):** Email OTP Redis consumption vs PostgreSQL transaction boundary failure handling needs an explicit rate-limit/quota recovery policy.
> 5. **F-05 (Medium):** Seed court deletion restoration vs `(branch_id, code)` natural key unique constraint collision handling.
> 6. **F-06 (Medium):** Login password safety byte cap ($4096$ bytes) sizing rationale and Argon2 DoS mitigation.
>
> Once Muse Spark incorporates the corrective requirements into **Plan V2.0**, the architecture will be ready for final sign-off in Review 2.

---

## 2. Evidence Reviewed

The review team audited the plan against the actual repository files, live configurations, Git status, and MCP status:

| Evidence ID | Source File / Command Audited | Scope & Verified Reality |
| :--- | :--- | :--- |
| **EV-AUD-01** | `git status --short`, `git branch -avv` | Workspace is on `feat/payments` (HEAD `575a037`). Dirty working tree with tracked changes (`schema.prisma`, bookings, payments module, package.json) and untracked payment files (`20261021000000_payments_m03_metadata`, `20261022000000_payments_audit_log`, `modules/payments/`, tests). Remote `booking-payments` does not exist yet. |
| **EV-AUD-02** | [`backend/prisma/schema.prisma`](file:///C:/Users/Admin/Documents/booking-payments/backend/prisma/schema.prisma#L234-L285) | `User` requires `username` (`VarChar(100)`), `phone` (`VarChar(20)`), `email` (`VarChar(254)`), and `passwordHash` (`VarChar(255)`). `Court` has composite unique key `@@unique([branchId, code])`. `UserRole` has composite primary key `@@id([userId, role])`. |
| **EV-AUD-03** | [`backend/prisma/seed.mjs`](file:///C:/Users/Admin/Documents/booking-payments/backend/prisma/seed.mjs#L1-L83) | Raw `pg` client script. Seeds `MVP-DEMO` branch, 4 courts (`PRO-01`, `PRO-02`, `STD-03`, `STD-04`), hours, and price rules using `ON CONFLICT (id) DO NOTHING`. No Admin seeding; no host allowlist or environment checks; no preflight check for code collisions. |
| **EV-AUD-04** | [`backend/src/modules/auth/dto/login.dto.ts`](file:///C:/Users/Admin/Documents/booking-payments/backend/src/modules/auth/dto/login.dto.ts#L24-L34) | `LoginDto.password` is decorated with `@IsAuthPassword`, which strictly enforces 12–128 character policy on login, prematurely blocking valid legacy passwords <12 characters. |
| **EV-AUD-05** | [`frontend/lib/auth-validation.ts`](file:///C:/Users/Admin/Documents/booking-payments/frontend/lib/auth-validation.ts#L48-L85) | `getRegistrationErrors` directly delegates to `getLoginErrors`. `getLoginErrors` enforces `passwordMin: 12`. Tight coupling confirmed. |
| **EV-AUD-06** | [`backend/src/modules/auth/auth.service.ts`](file:///C:/Users/Admin/Documents/booking-payments/backend/src/modules/auth/auth.service.ts#L45-L84) | Login runs `hasher.verify(user?.passwordHash ?? AUTH_DUMMY_PASSWORD_HASH, dto.password)`. If password fails, generic `UnauthorizedException` is thrown. Email verification status is only checked after valid password. |
| **EV-AUD-07** | [`frontend/components/home/sporty-header.tsx`](file:///C:/Users/Admin/Documents/booking-payments/frontend/components/home/sporty-header.tsx#L360-L398) | Avatar is currently an unclickable `<div>` rendering the first letter of `fullName`. No dropdown menu exists. |
| **EV-AUD-08** | [`frontend/app/page.tsx`](file:///C:/Users/Admin/Documents/booking-payments/frontend/app/page.tsx#L26-L30) | Standalone `<Link className="btn btn-secondary" href="/bookings">Booking của tôi</Link>` exists directly inside the status container on the home page. |
| **EV-AUD-09** | [`frontend/app/bookings/page.tsx`](file:///C:/Users/Admin/Documents/booking-payments/frontend/app/bookings/page.tsx#L14-L17) | Renders stale hardcoded copy: `"Giữ chỗ hết hạn sau 5 phút; chưa có thanh toán."` |
| **EV-AUD-10** | [`backend/src/modules/users/user.controller.ts`](file:///C:/Users/Admin/Documents/booking-payments/backend/src/modules/users/user.controller.ts) | Controller is completely empty. No customer profile editing, ledger, or account aggregation endpoints exist. |
| **EV-AUD-11** | [`backend/src/modules/payments/presentation/payments.controller.ts`](file:///C:/Users/Admin/Documents/booking-payments/backend/src/modules/payments/presentation/payments.controller.ts#L104-L170) | Endpoints only permit querying payment requests by specific ID (`requests/:id`) or by specific booking ID (`requests?bookingId=...`). No user-scoped payment history list endpoint (`GET /api/payments/me`) exists. |
| **EV-AUD-12** | [`backend/test/payments-coordinator.integration.spec.ts`](file:///C:/Users/Admin/Documents/booking-payments/backend/test/payments-coordinator.integration.spec.ts#L34-L37) | Uses `storageDescribe = databaseUrl && redisUrl ? describe : describe.skip`. Missing environment variables silently skip tests while exiting 0. |
| **EV-AUD-13** | `figma-readwrite` MCP probe | `figma_get_status` returns: `WebSocket server running on port 9230 (fallback) but no plugin connected`. Confirms Figma canvas is currently inaccessible via automated tooling. |

---

## 3. Confirmed Strengths of Plan V1

1. **Strict Working Tree Preservation:**  
   Plan V1 explicitly recognizes the uncommitted state of the `feat/payments` working tree and prohibits any `git reset`, `git checkout`, or stash commands that could destroy work-in-progress payment features.
2. **Minimalist Architecture & Anti-Overengineering:**  
   Resists the temptation to introduce external state management (e.g. Redux/Zustand), heavy ORM alternatives, or multi-tenant OAuth abstractions. Reuses existing NestJS modular architecture, Prisma models, and React context.
3. **Decoupled Login vs. Registration Validation:**  
   Correctly identifies that `LoginDto` must not enforce registration password creation rules (12–128 chars, complexity), thereby protecting legacy credentials while preserving creation strength.
4. **Resilient Seed Baseline:**  
   Preserves deterministic UUIDs for branches and courts, rejects destructive teardown, mandates non-production environment guards, and introduces secure Argon2 bootstrap for admin accounts.
5. **Rigorous Security Baseline:**  
   Follows RFC 9700 OAuth 2.0 Security BCP (Authorization Code + PKCE S256, state, nonce, SameSite cookies), mandates HMAC-SHA256 hashed OTP challenges, enforces timing-attack mitigations, and rejects automatic account linking on email match.
6. **Honest Figma & Test Assessment:**  
   Refuses to fabricate visual fidelity claims or declare pass marks on tests that were skipped or not run. Properly categorizes Figma as `BLOCKED - FIGMA_NOT_ACCESSIBLE`.

---

## 4. Prioritized Findings

### 🔴 Critical Findings
*None. Plan V1 does not introduce catastrophic data loss or architecture-breaking regressions.*

---

### 🟡 High Severity Findings

#### `F-01`: Google First-Time Onboarding: Undefined State Machine, Temporary Token Mechanics, and Conflict Retries
- **Severity:** HIGH
- **Requirement:** R03, D01
- **Plan Reference:** [`docs/refactor/REFACTOR_PLAN_V1.md` §6.3, lines 210–219, lines 438]
- **Code Evidence:** [`backend/prisma/schema.prisma` lines 236–238](file:///C:/Users/Admin/Documents/booking-payments/backend/prisma/schema.prisma#L236-L238)
- **Problem:**  
  In the database, `User.username` (`VarChar(100)`) and `User.phone` (`VarChar(20)`) are `NOT NULL` and `UNIQUE`. Google OIDC only returns `sub`, `email`, `name`, and `email_verified: true`. Plan V1 correctly rejects generating dummy phones or fake usernames and adopts D01 (collect real username and phone via onboarding before issuing a full session).  
  However, Plan V1 leaves the onboarding state machine underspecified:
  1. It does not define how the verified Google identity (`sub`, `email`) is securely bound across the browser redirect between the OAuth GET callback and the frontend onboarding form submission (`POST /api/auth/oauth/google/onboard`).
  2. Without an explicit, signed, short-lived `HttpOnly` token (e.g., `google_onboarding_token` with 15-minute TTL) or an ephemeral Redis-backed onboarding ticket, the onboarding POST endpoint could be susceptible to request forgery or session fixation.
  3. The plan does not define the retry contract if the user selects a `username` or `phone` that conflicts with an existing account during onboarding.
- **Consequence:**  
  Implementation risk: Developer might store Google claims in insecure client storage (localStorage/sessionStorage), allow unauthenticated callers to hit the onboarding completion endpoint, or drop the Google association when a validation conflict occurs.
- **Minimum Corrective Action for Plan V2.0:**  
  Plan V2.0 must specify:
  1. The exact onboarding ticket mechanism: Upon successful Google token exchange for an unprovisioned user, backend issues a short-lived (15 min), `HttpOnly`, `SameSite=Lax`, host-only cookie or signed token containing `{ provider: 'GOOGLE', subject, email }`.
  2. Endpoint contract: `POST /api/auth/oauth/google/onboard` requiring CSRF, the onboarding ticket, `username`, `phone`, and `fullName`.
  3. Conflict handling: In-place validation errors returning standard field errors (`409 Conflict` or `422 Unprocessable Entity`) allowing the user to correct username/phone without restarting the Google OAuth redirect dance.
- **Verification Criterion:**  
  Plan V2.0 documents the onboarding DTO, endpoint path, ticket lifecycle, and includes test cases for onboarding conflict retries in the test matrix.

---

#### `F-02`: `/account/payments` Data Access Pattern: Client-Side $N+1$ Request Storm vs Lack of Customer Payment Feed
- **Severity:** HIGH
- **Requirement:** R04, R06
- **Plan Reference:** [`docs/refactor/REFACTOR_PLAN_V1.md` §3 lines 119, §8 line 250, §9 RF-06 line 270]
- **Code Evidence:** [`backend/src/modules/payments/presentation/payments.controller.ts` lines 104–153](file:///C:/Users/Admin/Documents/booking-payments/backend/src/modules/payments/presentation/payments.controller.ts#L104-L153)
- **Problem:**  
  Plan V1 specifies 5 required items for the Avatar menu: Profile, Security, Bookings, Payments, Logout. For `/account/payments`, Plan V1 states: *"Payment account section lấy booking IDs từ owner list rồi mở detail/status/refund APIs thực. Không dùng staff lookup cho customer... Không thêm invoice issuance."*  
  However, in `payments.controller.ts`, payment requests can only be queried individually by `id` (`/api/payments/requests/:id`) or by `bookingId` (`/api/payments/requests?bookingId=...`). There is **no customer-scoped payments feed** (`GET /api/payments/me`).  
  If `/account/payments` fetches all customer bookings (`GET /api/bookings/me`) and then fires parallel client-side requests for every booking ID to resolve payment details, this creates an unbounded client-side $N+1$ HTTP request flood.
- **Consequence:**  
  High network overhead, mobile latency spikes, susceptibility to rate-limiting (429), partial page rendering failures, and server CPU churn.
- **Minimum Corrective Action for Plan V2.0:**  
  Plan V2.0 must adopt one of two bounded solutions:
  - **Option A (Recommended UI Scoping):** Eliminate the standalone `/account/payments` page from the menu or make `/account/payments` a dedicated tab inside `/bookings` that loads payment details **on-demand (lazy load)** only when a booking card is expanded.
  - **Option B (Bounded Aggregate Read):** If a standalone page is retained, strictly paginate bookings (e.g. 5 per page) and batch/debounce payment lookups, defining clear loading and error boundaries for each booking row.
- **Verification Criterion:**  
  Plan V2.0 explicitly defines how `/account/payments` retrieves data without unbounded client $N+1$ calls, including partial failure rendering states.

---

#### `F-03`: Database Migration Timestamp Inversion Hazard with Untracked Payment Migrations
- **Severity:** HIGH
- **Requirement:** R01, R03, R06
- **Plan Reference:** [`docs/refactor/REFACTOR_PLAN_V1.md` §8 lines 254–257, §9 RF-04 line 268]
- **Code Evidence:** `backend/prisma/migrations/20261021000000_payments_m03_metadata/`, `backend/prisma/migrations/20261022000000_payments_audit_log/`
- **Problem:**  
  The workspace contains two untracked payment migrations dated **2026-10-21** and **2026-10-22**.  
  If the implementer creates an auth migration today (`20261020...`), Prisma's migration runner sorts migrations lexicographically. It will attempt to apply `20261020...` BEFORE `20261021000000_payments_m03_metadata`. However, `backend/prisma/schema.prisma` in the workspace already contains the payment models corresponding to those future migrations.
- **Consequence:**  
  Running `prisma migrate dev` or `prisma migrate deploy` on clean or target databases will result in schema drift, out-of-order execution errors, or checksum corruption.
- **Minimum Corrective Action for Plan V2.0:**  
  Plan V2.0 must specify the exact migration rule:
  1. The new auth migration (`AuthIdentity` and nullable `password_hash`) MUST be explicitly timestamped **after** `20261022000000_payments_audit_log` (e.g. `20261023000000_auth_identity_oauth`).
  2. The two untracked payment migrations must be staged and applied in their existing order prior to the auth migration.
- **Verification Criterion:**  
  Plan V2.0 explicitly sets the migration sequence rule and mandates running a clean-database migration verification (`prisma migrate deploy`) in test case T38.

---

### 🔵 Medium Severity Findings

#### `F-04`: Email OTP Redis Consumption vs Database Commit Failure Recovery
- **Severity:** MEDIUM
- **Requirement:** R03
- **Plan Reference:** [`docs/refactor/REFACTOR_PLAN_V1.md` §6.2 lines 193–198]
- **Code Evidence:** [`backend/src/modules/auth/services/auth-recovery.service.ts` lines 120–128](file:///C:/Users/Admin/Documents/booking-payments/backend/src/modules/auth/services/auth-recovery.service.ts#L120-L128)
- **Problem:**  
  Plan V1 specifies a two-step verification:
  1. Redis Lua atomically validates and consumes the 6-digit code.
  2. Backend performs conditional DB update (`emailVerifiedAt = NOW()`).  
  Plan V1 correctly notes that Redis + Postgres is not a 2PC distributed transaction and states: *"DB failure sau consume: không cấp session; trả recoverable unavailable, yêu cầu resend code mới."*  
  However, resend is strictly throttled (60s cooldown, max 3/hour). If a transient PostgreSQL connection error occurs during step 2, the user has entered the correct OTP, but the code is consumed in Redis. If they hit "Resend", they are penalized against their hourly rate limit for a server-side error.
- **Consequence:**  
  Legitimate users face locked-out states or 60s delays due to transient backend database glitches.
- **Minimum Corrective Action for Plan V2.0:**  
  Plan V2.0 should specify that if step 2 (DB commit) fails with a 500 error after step 1 succeeds, the backend error handler should either:
  - Issue a short-lived recovery token that allows one immediate resend without decrementing the recipient hourly budget, OR
  - Un-consume the code in Redis with a 2-minute emergency grace window.
- **Verification Criterion:**  
  Plan V2.0 documents the specific failure recovery handling between Redis consumption and PostgreSQL commit in §6.2 and test case T18.

---

#### `F-05`: Seed Court Deletion Restoration vs Natural Key Unique Constraint Collision
- **Severity:** MEDIUM
- **Requirement:** R01
- **Plan Reference:** [`docs/refactor/REFACTOR_PLAN_V1.md` §7 lines 231–233]
- **Code Evidence:** [`backend/prisma/seed.mjs` lines 57–69](file:///C:/Users/Admin/Documents/booking-payments/backend/prisma/seed.mjs#L57-L69), [`backend/prisma/schema.prisma` line 344](file:///C:/Users/Admin/Documents/booking-payments/backend/prisma/schema.prisma#L344)
- **Problem:**  
  `backend/prisma/seed.mjs` inserts courts with `ON CONFLICT (id) DO NOTHING`. In `schema.prisma`, `Court` has a unique constraint: `@@unique([branchId, code])`.  
  If a developer or test deletes court UUID `...101` (code `PRO-01`) and manually inserts a new court with code `PRO-01` but a different UUID:  
  When `seed.mjs` runs, `...101` does not exist, so `ON CONFLICT (id)` does NOT trigger. Postgres raises an unhandled unique violation `23505` on `(branch_id, code)`, aborting the entire seed script with a raw SQL error.
- **Consequence:**  
  Seed script crashes abruptly instead of reporting an actionable diagnostic conflict message.
- **Minimum Corrective Action for Plan V2.0:**  
  Plan V2.0 must require `seed.mjs` to execute a preflight select on `(branch_id, code)` before inserting missing courts. If the code is already assigned to an unmanaged UUID, log a clear conflict warning (`"Court code PRO-01 already in use by ID ...; skipping recreate to prevent data corruption"`) and continue or fail gracefully.
- **Verification Criterion:**  
  Plan V2.0 includes preflight natural key conflict checks in seed design and verifies it in test case T05.

---

#### `F-06`: Login Password Safety Cap Sizing & Argon2 Denial-of-Service Considerations
- **Severity:** MEDIUM
- **Requirement:** R02
- **Plan Reference:** [`docs/refactor/REFACTOR_PLAN_V1.md` §6.1 lines 171–172]
- **Code Evidence:** [`backend/src/modules/auth/dto/login.dto.ts` line 32](file:///C:/Users/Admin/Documents/booking-payments/backend/src/modules/auth/dto/login.dto.ts#L32)
- **Problem:**  
  Plan V1 proposes decoupling login validation from registration creation policy and suggests `LOGIN_PASSWORD_MAX_BYTES = 4096` UTF-8 bytes as an upper bound before passing the password to Argon2.  
  However, in this codebase, registration passwords have always been capped at 128 Unicode codepoints (`AUTH_LIMITS.passwordMax = 128`). Even with 4-byte UTF-8 characters, a valid password cannot exceed 512 bytes.  
  Allowing up to 4096 bytes allows attackers to submit 4KB strings to Argon2id, which consumes substantially more hashing memory and CPU time than a 128-byte string.
- **Consequence:**  
  Unnecessary amplification of CPU load during login attacks under distributed IPs.
- **Minimum Corrective Action for Plan V2.0:**  
  Reduce `LOGIN_PASSWORD_MAX_BYTES` to `1024` bytes (or `512` bytes if no wide multi-byte legacy passwords exist). 1024 bytes provides more than double the headroom needed for 128 UTF-8 codepoints while preventing oversized payload processing.
- **Verification Criterion:**  
  Plan V2.0 updates `LOGIN_PASSWORD_MAX_BYTES` to `1024` with documented justification.

---

### ⚪ Low Severity Findings

#### `F-07`: Stale Hardcoded Text on `/bookings`
- **Severity:** LOW
- **Requirement:** R04, R06
- **Plan Reference:** [`docs/refactor/REFACTOR_PLAN_V1.md` §5.2 line 155]
- **Code Evidence:** [`frontend/app/bookings/page.tsx` lines 14–16](file:///C:/Users/Admin/Documents/booking-payments/frontend/app/bookings/page.tsx#L14-L16)
- **Problem:**  
  Text states: *"Giữ chỗ hết hạn sau 5 phút; chưa có thanh toán."* This copy is obsolete and will mislead users once payments are enabled.
- **Corrective Action:**  
  Update copy to be payment-neutral, e.g.: *"Trạng thái đặt sân được cập nhật tự động từ máy chủ."*
- **Verification Criterion:**  
  Copy update documented in Plan V2.0 and asserted in `frontend-booking-rendering.spec.tsx`.

---

#### `F-08`: Read-Only Customer Profile & Security Screens: Guarding Against Dead-End Mock Buttons
- **Severity:** LOW
- **Requirement:** R04
- **Plan Reference:** [`docs/refactor/REFACTOR_PLAN_V1.md` §3 lines 117–118, §5.2 line 156]
- **Code Evidence:** [`backend/src/modules/users/user.controller.ts`](file:///C:/Users/Admin/Documents/booking-payments/backend/src/modules/users/user.controller.ts)
- **Problem:**  
  Since `UserController` is empty and profile modification / 2FA / session revocation APIs are out of scope, `/account` and `/account/security` can only display read-only info from `GET /api/auth/me` and link to password reset.
- **Corrective Action:**  
  Plan V2.0 must explicitly require that non-functional CTAs (e.g., "Đổi thông tin", "Bật 2FA", "Xóa tài khoản") MUST NOT be rendered as dead-end clickable buttons. They should be omitted or marked with an informational pill (`"Chưa hỗ trợ trực tuyến"`).
- **Verification Criterion:**  
  Test case T27 explicitly checks for the absence of non-functional CTAs.

---

## 5. Missing Test / Acceptance Coverage in Plan V1

Plan V1 provides an impressive 40-case test matrix (T01–T40). To ensure zero regressions, Plan V2.0 must add coverage for the following specific edge cases:

1. **OAuth Onboarding Collision Test (`T23b - new`):**  
   User authenticates with Google, enters onboarding, submits a `phone` or `username` already taken by a local account → Assert `409 Conflict`, error mapped to field, temporary onboarding session remains valid for retry.
2. **Login Password UTF-8 Byte Limit Boundary (`T09b - new`):**  
   Assert password with 1024 bytes passes validation; assert password with 1025 bytes is rejected with `400 Bad Request` *before* invoking Argon2.
3. **Seed Code Collision Preflight (`T05b - new`):**  
   Insert court with code `PRO-01` but random UUID; run `npm run seed:courts` → Assert script exits gracefully with error message and zero database modifications.
4. **Clean DB Full Migration Chain (`T38b - new`):**  
   Execute `prisma migrate deploy` on an empty PostgreSQL instance with all migrations (`v1_initial` through `auth_identity`) → Assert exit 0 and all SQL checks/exclusion constraints active.

---

## 6. Scope Creep Warnings

Plan V1 maintains commendable discipline regarding out-of-scope items. Review 1 issues the following boundary warnings for implementation:

> [!WARNING]
> 1. **Do NOT Implement Invoice Generation:**  
>    There is no `Invoice` table or tax accounting requirement. Under no circumstances should `/account/payments` attempt to generate PDF invoices or fake invoice numbers.
> 2. **Do NOT Implement Automatic Account Linking:**  
>    If a Google sign-in returns an email matching an existing local password account, the system must NOT automatically link the account or overwrite credentials. It must prompt the user to log in with their existing password.
> 3. **Do NOT Redesign SportyHeader or Global Theme:**  
>    The scope for R04/R05 is limited to converting the avatar `div` into an accessible dropdown menu. Do not rewrite CSS variables, hero banners, or fonts.

---

## 7. Figma Access & Validation Status

- **Status:** **BLOCKED — FIGMA_NOT_ACCESSIBLE**
- **Evidence:**  
  Live check with `figma-readwrite` MCP returned WebSocket fallback port 9230 with no active Desktop Bridge connection. Web access to URL `https://www.figma.com/design/qXtLrMdBhh4aNk0bTS2Rky/Untitled?node-id=0-1` remains restricted.
- **Reviewer Ruling:**  
  Plan V1's decision to classify Figma fidelity as `BLOCKED` and proceed with functional code-level planning while freezing visual identity changes is **APPROVED**.  
  Muse Spark must maintain this boundary in Plan V2.0: **NO visual redesign or component token changes are permitted without verified frame exports or direct canvas inspection.**

---

## 8. Corrective Requirements for Muse Spark (Plan V2.0)

Muse Spark is instructed to produce `docs/refactor/REFACTOR_PLAN_V2.md` addressing the following mandatory requirements:

1. **CR-01 (Onboarding Lifecycle):** Detail the exact token/cookie mechanics, DTO, endpoint (`/api/auth/oauth/google/onboard`), and collision retry flow for Google first-time login (Addressing `F-01`).
2. **CR-02 (Payments UX Architecture):** Eliminate client-side $N+1$ fan-out for `/account/payments`. Specify an on-demand/lazy-loading card pattern within `/bookings` or bounded batch pagination (Addressing `F-02`).
3. **CR-03 (Migration Sequencing):** Explicitly mandate that the auth schema migration timestamp is ordered AFTER `20261022000000_payments_audit_log` (Addressing `F-03`).
4. **CR-04 (OTP Server Failure Recovery):** Specify the rate-limit exemption or grace-window recovery rule if a PostgreSQL commit fails after Redis code consumption (Addressing `F-04`).
5. **CR-05 (Seed Collision Safety):** Add preflight select on `(branch_id, code)` in `seed.mjs` to prevent unhandled Postgres 23505 crashes (Addressing `F-05`).
6. **CR-06 (Login Byte Cap):** Adjust `LOGIN_PASSWORD_MAX_BYTES` to 1024 bytes and document early rejection before Argon2 (Addressing `F-06`).
7. **CR-07 (Test Matrix Expansion):** Add test cases `T05b`, `T09b`, `T23b`, and `T38b` to the test matrix.

---

## 9. Unverified Assumptions

The following items could not be verified in this review and must remain explicit assumptions in Plan V2.0:
1. **Google OAuth Credentials & Origins:** Production/staging Google Client ID and authorized redirect URIs are not yet configured in `.env`.
2. **SMTP Relay Delivery Latency:** Real-world delivery latency and bounce rates of the production SMTP provider cannot be verified from offline tests.
3. **Figma Canvas Layouts:** Component spacing, typography, and dark mode tokens in node `0-1` remain uninspected.

---

## 10. Role and Work Verification Report

Per workspace policy (`ai/rules/AGENCY-ROUTING.md`):

| Role | Agency Skill Path | Responsibilities in Task | Actual Work Performed & Evidence |
| :--- | :--- | :--- | :--- |
| **Independent Technical Reviewer** (Primary) | [`.agents/skills/agency-code-reviewer/SKILL.md`](file:///C:/Users/Admin/Documents/booking-payments/.agents/skills/agency-code-reviewer/SKILL.md) | Conduct independent technical review of `REFACTOR_PLAN_V1.md` against codebase reality. | Audited Git working tree, Prisma schema, auth, seed, frontend, and payments controllers; verified live MCP Figma status; produced 8 prioritized findings and corrective requirements. |
| **Backend & Database Specialist** (Supporting) | [`.agents/skills/agency-backend-architect/SKILL.md`](file:///C:/Users/Admin/Documents/booking-payments/.agents/skills/agency-backend-architect/SKILL.md) & [`.agents/skills/agency-database-optimizer/SKILL.md`](file:///C:/Users/Admin/Documents/booking-payments/.agents/skills/agency-database-optimizer/SKILL.md) | Audit schema migrations, unique constraints, and API query performance. | Identified future-dated migration sequencing hazard (`F-03`), seed court unique constraint collision (`F-05`), and `/account/payments` client-side $N+1$ fan-out (`F-02`). |
| **AppSec Specialist** (Supporting) | [`agency-application-security-engineer`](file:///C:/Users/Admin/.gemini/config/skills/agency-application-security-engineer/SKILL.md) | Audit authentication security, OTP atomicity, password limits, and OAuth PKCE flows. | Analyzed Google onboarding ticket security (`F-01`), OTP Redis-Postgres failure recovery (`F-04`), and login password DoS sizing (`F-06`). |

- **Execution Environment:** Antigravity CLI / Gemini 3.8 Flash (Medium).
- **Execution Mode:** 100% Read-Only Review. No application source code, database, migration, or plan file was altered.

---

### REVIEW 1 COMPLETE — RETURN FINDINGS TO MUSE SPARK FOR PLAN V2.0

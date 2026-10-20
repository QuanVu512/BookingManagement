# REFACTOR IMPLEMENTATION REPORT

Date: 2026-10-20
Implementer: OpenCode / DeepSeek v4.1 Flash (actual CLI/model; not Codex, Antigravity or Muse Spark)
Plan baseline: `docs/refactor/REFACTOR_PLAN_V2_FINAL.md` + `docs/refactor/REFACTOR_REVIEW_2_FINAL.md`
Target branch: `booking-payments`

> Implementation evidence only. This is not a new plan and not an independent review.

## 1. Git base / target

- Original base: `feat/payments`, HEAD `575a037a98aa8cbc0c73ac01dfbd63d42e7d107a`.
- Refactor base committed as payment-owned checkpoint `0b91d3e` ("chore(payments): preserve in-progress payment workflow and migrations") directly on `booking-payments`. No reset, stash, clean, rebase or history rewrite.
- WIP inventory: `docs/refactor/RF00_WIP_SHA256.txt` (pre-implementation snapshot).
- Remote: `origin` at `https://github.com/QuanVu512/BookingManagement.git`; push only to `origin/booking-payments`.

## 2. Packages implemented

| Package | Status | Scope delivered |
| --- | --- | --- |
| RF-00 | DONE | Branch/HEAD/status/WIP snapshot; payment WIP preserved and committed separately from refactor. |
| RF-01A | DONE (unit) | `seed-data.mjs` manifest/mode/env guards, create-only seed engine, whole-mode preflight, natural-key/customization failure codes, redacted logs, `seed:courts`. |
| RF-01B | DONE (unit) | `seed:admin`/`seed:all`, mandatory env-based Admin bootstrap, Argon2 adapter verification, no default credentials, no role elevation/rotation on rerun. |
| RF-02 | DONE | Login accepts raw legacy passwords up to 1024 UTF-8 bytes; creation policy 12–128 stays for register/reset; 1025-byte rejection before account lookup/Argon2; auth error envelope scoped to `/api/auth`; 64 KiB auth body parser isolated from payOS raw webhook; session requires `emailVerifiedAt`; frontend parity + duplicate note removed. |
| RF-03A | DONE (unit) | `email-otp.service.ts` with CSPRNG 6-digit code, HMAC-SHA256(code) binding, Redis Lua verify/attempt/lease, `VERIFIED_PENDING_ACTIVATION` 120s proof, conditional activation transaction, generic resend, rate budgets, pending-resend preservation, no plaintext code/secret in Redis or responses. Not wired to registration (D02). |
| RF-06A | DONE | Avatar disclosure menu with exactly five items and native links, Escape/outside-close + focus restore; `/account` and `/account/security` read-only with real `me` data; non-functional CTAs removed; home duplicate booking link removed; `/bookings` copy and heading updated. |
| RF-06B | DONE | `/account/payments` server redirect; `/bookings?tab=payments`; 0 payment reads before expand; max 3 reads per expanded booking; max 2 concurrent; single-flight per key; owner/generation invalidation on collapse/account/tab/unmount; independent resource states; retry only failed resource; 10s refresh cooldown; transparent no-e-invoice copy; no fake invoice/amount/payment state. |
| RF-03B / RF-05A | BLOCKED | D02 (retiring legacy verification links) not approved. |
| RF-04A / RF-04B / RF-05B | BLOCKED | D01 (Google onboarding policy, nullable passwordHash) not approved. No `auth_identities` migration or OIDC dependency added. |
| RF-07 | BLOCKED | `FIGMA_NOT_ACCESSIBLE`; no frame fidelity claim. |
| RF-08 | PARTIAL / BLOCKED | Unit/contract/build/security regression executed; storage/migration/provider/E2E gates blocked by missing approved disposable PG/Redis, providers and Figma. |

## 3. Verification evidence (this session, final tree)

| Check | Command | Result |
| --- | --- | --- |
| OTP core spec | Jest unit `--runTestsByPath backend/src/modules/auth/services/email-otp.service.spec.ts` | PASS — 12/12, exit 0 |
| Backend unit | `npm run test:backend` | PASS — 315 passed, 4 skipped, 30/31 suites (skipped suite = `auth-storage.integration.spec.ts` requiring live PG/Redis) |
| Frontend suite | `npm run test:frontend` | PASS — 131/131 tests, 11/11 suites |
| Auth contract | `npm run test:auth:contract` | PASS — backend 27/27; frontend 79/79 |
| Auth security HTTP | `npm run test:auth:security` | PASS — 24/24 |
| Lint | `npm run lint` | PASS — exit 0, no findings |
| Backend types | `npx tsc --noEmit -p backend/tsconfig.json` | PASS — exit 0 |
| Frontend types | `npx tsc --noEmit -p frontend/tsconfig.json` | PASS — exit 0 |
| Backend build | `npm run build` | PASS — Prisma generate + Nest build, exit 0 |
| Web build | `NEXT_PUBLIC_API_URL=https://api.booking.local npm run build:web` | PASS — exit 0; placeholder origin used because production build requires an explicit HTTPS API origin |
| Source security scan | `node tools/security-source-check.mjs` | PASS — 354 files, 0 findings |

New regression tests:

- `frontend/__tests__/frontend-account-rendering.spec.tsx` — 6 tests: menu items/targets, Escape/focus/logout, profile/security read-only, payments redirect, home/bookings copy.
- `frontend/__tests__/frontend-account-payment-history.spec.tsx` — 6 tests: 50 rows → 0 money calls, expand → ≤3 reads/2 concurrent, partial failure + targeted retry, Retry-After, account switch stale discard, refresh 3 reads + 10s cooldown, collapse.

Fixed in-scope regressions discovered by the gates:

- `email-otp.service.ts`: HMAC verification omitted `generation`; constant name mismatch; TypeScript errors.
- `auth-error-envelope.filter.ts`: nullable `applicationRef` guard.
- Outdated test contracts updated for RF-02 (LoginDto no creation min/max; short wrong password is 401 after hashing, not 400).
- `frontend-auth-rendering.spec.tsx`: `next/navigation` mock now includes `usePathname` used by `AccountMenu`.

## 4. Remaining verification blockers (unchanged)

| ID | Status | Consequence |
| --- | --- | --- |
| D01 | BLOCKED — business policy not approved | Cannot implement identity migration or Google UI/provisioning. |
| D02 | BLOCKED — business policy not approved | Cannot retire legacy verify links or wire OTP into registration. |
| B-TEST | BLOCKED — no approved disposable PG/Redis | Seed/migration/OTP storage/payment race integration exits not executed; skipped suite reported, not treated as PASS. |
| B-GOOGLE / B-SMTP | BLOCKED — no approved provider/mailbox | Real OAuth and SMTP delivery not verified. Mocks are not provider evidence. |
| B-FIGMA | BLOCKED — no readable canvas/exports | Visual fidelity signoff and RF-07 not executed. |
| B-PAY | UNKNOWN runtime | Payment source preserved and unit-tested; end-to-end payOS/DB correctness not proven here. |

## 5. Role and actual work

| Role (agency skill) | Responsibility in task | Actual work performed |
| --- | --- | --- |
| Senior Project Manager — `.agents/skills/agency-senior-project-manager/SKILL.md` | Keep scope to Plan V2, enforce blockers, report evidence | Re-read Plan V2/Review 2; executed only unblocked packages; kept D01/D02/Figma/DB gated; no new plan/review. |
| Backend Architect — `.agents/skills/agency-backend-architect/SKILL.md` | Auth/OTP/seed compatibility and TypeScript correctness | Delivered OTP core internals, fixed HMAC generation binding and filter typing, ran backend typecheck/build and unit suite. |
| Application Security Engineer — `.agents/skills/agency-application-security-engineer/SKILL.md` | Preserve security contracts while verifying | Kept 1024-byte pre-hash bound, generic errors, verification gate, OTP binding/replay/rate limits; updated security HTTP expectations; ran security source scan. |
| Frontend Developer / UX Architect — `.agents/skills/agency-frontend-developer/SKILL.md` | Account navigation and bounded payment history | Built account menu/shell/profile/security, bookings tabs, redirect, lazy payment-history hook/view; added jsdom regression tests for request budget, failure isolation, stale-owner discard and read-only UI. |
| Code Reviewer (self-check) — `.agents/skills/agency-code-reviewer/SKILL.md` | Review own diff before handoff | Reviewed diff for scope, owner isolation, request budget, no financial writes; not an independent review. |

No worker CLI, Antigravity session or independent reviewer was run in this implementation turn.

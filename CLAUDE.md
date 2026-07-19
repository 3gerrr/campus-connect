# Campus Connect — Project Context for Claude Code

Read this before doing anything. It is the shared context for a 4-person
student team building this as both a product and a time-bound, measurable
research project.

## What this is

A verified academic communication app for Nigerian universities. Core thesis:
students miss cancelled classes, venue changes, and announcements because
information is buried in WhatsApp groups. This app makes course announcements
**verified at the source** (only the lecturer or an approved course rep can
post), **tamper-evident** (per-course hash chains + RFC 6962 Merkle proofs,
Certificate-Transparency-style — NOT blockchain), and **delivered reliably**
(push notifications, eventually SMS/WhatsApp fallback for critical messages).

## Evidence base (our survey, n=124, mostly FUTA + OAU students)

- 81% (100/124) have missed important info buried in a group chat
- Top pains: lecturer cancels class unannounced (57), last-minute venue
  change (50), missed announcements (42)
- 102/124 would "definitely" use it free; 117 signed up as early testers
- Preferred reminder channel: push (48), in-app (29), WhatsApp (29), SMS (10)
- Research metric we are building toward: median time from announcement
  posted → seen by enrolled student (via AnnouncementReadReceipt), compared
  against a WhatsApp baseline, in a one-semester single-department pilot.

## Architecture

- `backend/` — NestJS + Prisma + PostgreSQL. Auth (JWT), scoped permissions,
  enrollment, announcements with per-course hash chain (advisory-lock
  serialized writes), per-university hash-chained audit log, Merkle
  inclusion/consistency proofs, WebSocket realtime (socket.io), cron-based
  deadline reminders (5-min tick, 26h lookahead), rate limiting.
- `mobile/` — Expo (React Native) app for students/lecturers/reps. React
  Navigation, TanStack Query, axios, socket.io-client, expo-notifications.
- No admin UI exists — admin is API-only for now (intentional for pilot).

Key invariants — do not break these:

1. Announcement posting authorization is enforced in the SERVICE layer
   (`announcements.service.ts`), never only in routes/UI.
2. Announcements are immutable. Corrections are new announcements linked via
   `parentId`. Never add an "edit" mutation.
3. Chain writes must stay inside the transaction holding the per-offering
   Postgres advisory lock, or concurrent posts fork the chain.
4. Hashing uses `canonicalJSON()` from `common/hash-chain.ts` (sorted keys)
   because Postgres jsonb does not preserve key order. Any new hashed
   payload must go through it on BOTH write and verify paths.
5. WebSocket room membership must reuse `EnrollmentService.assertCanView` —
   one source of truth for course access.

## Current phase plan (agreed by the team)

- **Phase 0 (now):** boot the whole stack locally, fix wiring bugs, validate
  every route via curl. See PHASE-0-CHECKLIST.md. Known pre-found issues:
  `class-validator`/`class-transformer` missing from package.json (needed by
  the global ValidationPipe in main.ts); `@types/passport-jwt` missing;
  `.env` is not auto-loaded (no @nestjs/config or dotenv in deps).
- **Phase 1:** push notifications to CLOSED apps via **Expo Push Service**
  (not raw FCM/APNs — we are on Expo managed workflow). Store Expo push
  tokens per device/session; send on announcement create + reminder dispatch.
- **Phase 2:** NotificationPreference read/write routes + mobile settings
  screen (table already exists in schema).
- **Phase 3:** minimal admin path good enough for a one-department pilot.
- Later: SMS/WhatsApp fallback for CANCELLATION/VENUE_CHANGE categories,
  analytics dashboard on read receipts, Merkle checkpointing.

## Working conventions

- TypeScript strict; follow existing NestJS module layout (module/controller/
  service per feature).
- Every privileged action writes to the audit log via AuditLogService.
- Prefer small commits with clear messages; tag milestones (`v0-boots`).
- When touching crypto/verification code, run
  `npx ts-node scripts/verify-merkle-tree.ts` before committing.

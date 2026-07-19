# Phase 0 — Boot the Full Stack Locally (Team Checklist)

Goal: get the entire backend running end-to-end on one laptop and prove every
route works via curl/Postman, **before writing any new feature code**. The
README admits the full Nest app has never been run wired together — this
checklist is about finding and fixing whatever breaks on first boot.

Assign one person as the "driver" for this; everyone else pulls their fixes.

---

## Step 1 — Prerequisites (each teammate, once)

```bash
node -v          # must be 18+
npm -v
docker -v        # install Docker Desktop if missing
git --version
```

## Step 2 — Fix known dependency gaps (do this BEFORE npm install)

Two packages are missing from `backend/package.json` and will cause failures:

- **`class-validator` + `class-transformer`** — `main.ts` registers a global
  `ValidationPipe({ whitelist: true, transform: true })`, and Nest's
  ValidationPipe hard-requires both packages. Without them the app errors
  with "class-validator package is missing" as soon as validation runs.
- **`@types/passport-jwt`** — `auth/strategies/jwt.strategy.ts` imports
  `passport-jwt`; the TypeScript build will likely fail without its types.

Fix:

```bash
cd backend
npm install class-validator class-transformer
npm install -D @types/passport-jwt
```

(Note: `bcrypt` is a native module — if `npm install` fails on it on Windows,
the usual fix is installing build tools, or swap to `bcryptjs` which is pure
JS and API-compatible for this use.)

## Step 3 — Database up

```bash
docker run --name campus-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres
docker ps    # confirm campus-pg is running
```

After any laptop restart: `docker start campus-pg`.

## Step 4 — Configure environment

```bash
cd backend
cp .env.example .env
```

Edit `.env`:

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/campus_connect"
JWT_SECRET="<mash keyboard, 40+ chars>"
```

Leave `FCM_SERVER_KEY` empty for now (Phase 1 concern — and we'll likely use
Expo Push instead of raw FCM anyway).

## Step 5 — Migrate + generate + seed

```bash
npx prisma migrate dev     # name it: init
npx prisma generate
npm run prisma:seed
```

Likely failure points:
- Schema validation errors in `schema.prisma` (it's 20KB and has never been
  run through `migrate` — relation mistakes surface here).
- Seed script assumptions not matching the final schema.

Record every error + fix in a shared doc or git commits — this IS the work.

## Step 6 — First boot

```bash
npm run start:dev
```

Watch the module initialization log. Likely failure points:
- Circular imports between modules (Announcements ↔ Enrollment ↔ Realtime
  is the risky triangle — AnnouncementsService injects EnrollmentService and
  RealtimeGateway).
- A service used by another module but not exported from its own module
  (Nest error: "Nest can't resolve dependencies of X").
- Missing `@nestjs/config`? `.env` is read via `process.env` — Nest does NOT
  load `.env` automatically without `@nestjs/config` or `dotenv`. If
  `JWT_SECRET` comes up undefined at runtime, this is why. Quick fix:
  `npm install dotenv` and add `import 'dotenv/config';` as the FIRST line
  of `src/main.ts` (and note `prisma` CLI loads `.env` itself, so migrate
  can succeed while the app still can't see the vars — don't let that
  mislead you).

## Step 7 — Prove every route with curl (the real checkpoint)

Follow README Section 5 in order. Minimum path to validate the core loop:

1. Login as seeded admin → token
2. Admin creates campus → faculty → department → course → session → offering
3. Signup a lecturer, admin verifies them, assign to offering
4. Signup a student, enroll in the offering
5. Lecturer posts an announcement
6. Student fetches announcements → sees it
7. `GET /announcements/offering/:id/verify` → chain valid
8. Post 3 more announcements, then fetch an inclusion proof
9. Student applies as rep → lecturer approves → rep posts successfully
10. Check `GET /admin/audit-logs` shows all of the above, and
    `GET /admin/audit-logs/verify` passes

If all 10 pass, Phase 0 is done. Tag the commit `v0-boots`.

## Step 8 — Mobile smoke test (optional in Phase 0)

```bash
cd mobile
npm install
cp .env.example .env    # point API URL at your laptop's LAN IP, not localhost
npx expo start
```

Phone and laptop must be on the same Wi-Fi. `localhost` in the app's .env
will NOT reach your laptop from a physical phone — use e.g.
`http://192.168.x.x:3000`.

---

## Definition of done

- [ ] Backend boots with zero errors
- [ ] All 10 curl steps pass
- [ ] Every fix committed with a clear message
- [ ] `v0-boots` tag pushed
- [ ] List of anything punted written into the repo README

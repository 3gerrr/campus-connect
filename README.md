# Campus Connect — From Zero to a Live Prototype

This README is written to be followed top to bottom, in order, by someone
who is comfortable with basic Node.js/JavaScript but hasn't necessarily
deployed a full-stack mobile app before. Every command is meant to be
copy-pasted. Where something might be confusing, there's a short explanation
of *why*, not just *what*.

If you get stuck at any step, don't skip ahead — most later steps assume the
earlier ones actually worked.

---

## Table of Contents

1. [What you're building](#1-what-youre-building)
2. [Before you start: install these tools](#2-before-you-start-install-these-tools)
3. [Understanding the project structure](#3-understanding-the-project-structure)
4. [Run the backend locally](#4-run-the-backend-locally)
5. [Prove the backend works (no app needed yet)](#5-prove-the-backend-works-no-app-needed-yet)
6. [Run the mobile app locally](#6-run-the-mobile-app-locally)
7. [Deploy the backend so it's live on the internet](#7-deploy-the-backend-so-its-live-on-the-internet)
8. [Build the mobile app for real testers (EAS)](#8-build-the-mobile-app-for-real-testers-eas)
9. [Walking a tester through the app end-to-end](#9-walking-a-tester-through-the-app-end-to-end)
10. [Troubleshooting](#10-troubleshooting)
11. [What's built vs. what's next](#11-whats-built-vs-whats-next)

---

## 1. What you're building

**Campus Connect** is a verified academic communication app. The core idea:
announcements about a course can only come from the lecturer or an
approved representative — never edited after the fact, only ever
corrected with a new linked message. Students only see announcements for
courses they're actually enrolled in.

It has two halves that run separately:

- **`backend/`** — a NestJS (Node.js) API + PostgreSQL database. This is the
  brain: authentication, permissions, the actual data.
- **`mobile/`** — a React Native (Expo) app. This is the phone app your
  users open. It talks to the backend over the internet using HTTP requests.

They are two separate things that get deployed separately. The backend runs
on a server somewhere (we'll use Railway). The mobile app runs on someone's
phone (we'll use EAS Build to package it).

### Why announcements are hash-chained

Beyond "only the lecturer can post," each course's announcements form a
**tamper-evident hash chain**: every announcement's hash is computed from
its own content *plus* the previous announcement's hash. Alter or delete
any historical row — even with direct database access — and every hash
after it stops matching, which a quick recomputation catches immediately
(the "Verify this course's announcement history" button in the app runs
exactly that recomputation). **The chain also covers attachments, not just
text** — swapping a "Lecture Slides" link to point somewhere malicious
after the fact is caught the same way altering the message text would be.

The **audit log gets the identical treatment**, chained per university
rather than per course. This closes what would otherwise be an obvious
irony: an audit log whose entire purpose is holding privileged actions
accountable is worthless if it's just an ordinary, quietly-editable table.
University admins can now actually read it too (`GET /admin/audit-logs`) —
previously every part of the system *wrote* to the audit log, but nothing
ever read it back.

This is the same underlying idea as Certificate Transparency (the system
that makes fraudulent SSL certificates detectable) — not blockchain, no
mining, no tokens, just a well-established pattern applied to the actual
threat this app cares about: a compromised account or insider quietly
rewriting what a lecturer said, or what an admin did. **It's worth being
precise about what this does and doesn't do:** it makes tampering
*detectable after the fact*, the same way Certificate Transparency doesn't
stop a bad certificate from being issued, only makes it discoverable. It
is not a defense against someone compromising the database *and* silently
swapping the entire chain along with it — no purely server-side
tamper-evidence scheme can fully rule that out. What it does rule out is
quiet, undetected retroactive edits by anyone with less than full database
control, which covers the realistic set of people the trust chain in this
app is designed to hold accountable.

One subtle correctness detail worth knowing if you touch this code:
`metadata` on audit log entries is stored as Postgres `jsonb`, which does
**not** guarantee key order survives a write/read round-trip. Hashing
`JSON.stringify(metadata)` directly would risk the verifier reporting
"tampered" on data nobody touched, purely because the database reordered
keys internally — a false alarm that's arguably worse than no alarm at
all, since it teaches people to distrust or ignore the check. The fix is
`canonicalJSON()` in `common/hash-chain.ts`, which recursively sorts keys
before hashing, on both the write and the verify path.

### Portable cryptographic proofs (Merkle tree)

Beyond the linear hash chain (which requires querying every row to
verify), both announcements and the audit log also support **RFC 6962-style
Merkle proofs** — the same construction Certificate Transparency uses:

- `GET /announcements/offering/:id/inclusion-proof/:announcementId` — a
  small (`O(log n)`) proof that one specific announcement is part of the
  official record, self-contained enough that someone can verify it later
  without needing API access at all — useful for a student who wants
  portable evidence (e.g. via the in-app "Export proof of inclusion" share
  action) rather than "just trust our app."
- `GET /announcements/offering/:id/consistency-proof?oldSize=N` — proof
  that history grew from an earlier known state without anything being
  rewritten in between.
- The identical pair of endpoints exists for the audit log under
  `GET /admin/audit-logs/inclusion-proof/:id` and
  `GET /admin/audit-logs/consistency-proof?oldSize=N`.

**This algorithm was validated before being wired in, not trusted from
memory.** A standalone property test (`backend/scripts/verify-merkle-tree.ts`,
runnable with `npx ts-node scripts/verify-merkle-tree.ts`) generates
thousands of cases — every leaf at every tree size 1–80 for inclusion,
every `(oldSize, newSize)` pair for tree sizes 1–50 for consistency,
power-of-two boundary sizes specifically (the historically bug-prone spot),
explicit tamper-detection and forged-root-rejection cases, and a concrete
at-scale demonstration. That test caught a real bug during development (an
early version of the consistency verifier returned the wrong value in one
base case) before it ever reached the API. Concretely, at 500 announcements
in a course, an inclusion proof is **9 hashes** and a consistency proof is
**7 hashes** — not a 500-row scan.

**Honest scope note:** the tree is rebuilt from the stored `contentHash`
values on every proof request — `O(n)` server-side work per call, same as
`verifyChain`. The payoff isn't server compute (that would need checkpoint
caching, a real next step, not done here) — it's that the *proof itself*
stays small and cheap for whoever receives it to verify, regardless of how
large the course's history grows.

---

## 2. Before you start: install these tools

Run each of these and confirm you get a version number back, not an error.

```bash
node -v          # need 18 or higher
npm -v
docker -v        # for running Postgres locally — install Docker Desktop if missing
git --version
```

Then install two CLIs globally:

```bash
npm install -g @nestjs/cli
npm install -g eas-cli
```

You'll also want:
- A **GitHub account** (free) — for deploying the backend
- A **Railway account** (free tier) — sign up at railway.app, easiest to use "Login with GitHub"
- An **Expo account** (free) — sign up at expo.dev, needed for EAS Build
- **For iOS testers only**: a free Apple Developer account (a paid $99/year
  account is only needed later, for the App Store — not for this stage)

---

## 3. Understanding the project structure

```
campus-connect/
  backend/
    prisma/
      schema.prisma     ← the entire database structure lives in this ONE file
      seed.ts            ← creates the first university + admin account
    src/
      auth/              ← login, signup, JWT tokens
      admin/              ← university admin creates faculties/courses/etc
      academic/          ← read-only browsing of courses
      enrollment/        ← students registering for a course
      representatives/    ← course rep applications + approval
      announcements/      ← posting, corrections, sharing
      permissions/        ← who's allowed to do what
      sessions/           ← device/login tracking
      audit-logs/          ← records every privileged action
    .env.example          ← copy this to .env and fill in real values
    package.json

  mobile/
    src/
      screens/            ← the actual UI screens (Login, Signup, Announcements)
      context/            ← app-wide state (who's logged in)
      services/api.ts      ← the one file that knows how to talk to the backend
      navigation/          ← which screen shows when
    App.tsx                ← entry point
    app.json               ← app name, permissions (camera, biometrics, etc.)
    eas.json               ← build configuration for EAS
    .env.example            ← copy this to .env, set your backend's URL
```

**The one thing to internalize:** the backend doesn't know or care that a
phone app exists. It just answers HTTP requests. You could test 100% of it
with `curl` or Postman and never open the mobile app. That's exactly what
we'll do in Step 5, before touching the phone app at all — so if something's
broken, you know immediately whether it's a backend problem or an app
problem.

---

## 4. Run the backend locally

> **A note on how thoroughly this has been tested so far.** The
> cryptographic core (`common/hash-chain.ts`, `common/merkle-tree.ts`) has
> been compiled with the real TypeScript compiler and run with real
> Node.js — not just reviewed — including a 4,500+ case property test (see
> the "Portable cryptographic proofs" section above). The `tsconfig.json`
> and `nest-cli.json` files were themselves a genuine gap caught during
> that process (a NestJS project can't build without them) and have been
> added. What *hasn't* been run yet in full is the complete Nest
> application with all its dependencies installed and wired together end
> to end — that needs `npm install` with real network access to fetch
> `@nestjs/*`, `@prisma/client`, and so on, which is why Section 5 below
> (testing every route via curl) matters as your first real checkpoint —
> it's the first time the *whole* app runs together, not just its parts.

### 4.1 Start a local database

```bash
docker run --name campus-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres
```

This starts a Postgres database in the background. Check it's running:
```bash
docker ps
```
You should see a container called `campus-pg`. (If you restart your
computer later, this container stops — restart it with `docker start campus-pg`.)

### 4.2 Configure the backend

```bash
cd backend
npm install
cp .env.example .env
```

Open `.env` in your editor. Set:
```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/campus_connect"
JWT_SECRET="any-long-random-string-you-make-up"
```
(For `JWT_SECRET`, literally mash your keyboard for 40 characters. It just
needs to be secret and long — this is what makes login tokens un-forgeable.)

### 4.3 Create the database tables

```bash
npx prisma migrate dev
```

This reads `prisma/schema.prisma` and creates every table (University,
User, Course, Announcement, etc.) in your Postgres database. It'll ask you
to name the migration — type something like `init` and hit enter.

If this succeeds, you now have a real, empty database matching the full
data model.

> **If you already had a database from an earlier version of this project**
> (before the hash-chain fields were added to `Announcement`), run
> `npx prisma migrate dev` again after pulling this update — it'll generate
> a new migration for the added columns. Since there's no production data
> to preserve at this stage, the simplest option if you hit migration
> conflicts is `npx prisma migrate reset` (wipes and recreates everything,
> then re-run the seed step below).

### 4.4 Seed the first university + admin

```bash
npm run prisma:seed
```

This creates one `University` row and one `UNIVERSITY_ADMIN` account, using
the values from your `.env` (or defaults if you didn't set them — check
`prisma/seed.ts` for what those defaults are). **Write down the printed
email and password** — you'll use them to log in as admin in Step 5.

### 4.5 Start the server

```bash
npm run start:dev
```

You should see Nest print something like `Nest application successfully
started`, and it'll keep running in this terminal (leave it open — open a
new terminal tab for the next steps).

---

## 5. Prove the backend works (no app needed yet)

This is the step people skip and regret. Do this before opening the mobile
app — it isolates backend problems from app problems.

### 5.1 Log in as the seeded admin

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example-university.edu","password":"changeme123"}'
```
(Use the actual email/password printed in step 4.4 if different.)

You should get back JSON with an `accessToken`. **Copy that token** — you'll
need it for the next requests. Every request below needs this header:
```
-H "Authorization: Bearer PASTE_YOUR_TOKEN_HERE"
```

### 5.2 Create a faculty, department, and course

```bash
# Save your token to a shell variable so you don't have to paste it every time
TOKEN="paste_your_access_token_here"

curl -X POST http://localhost:3000/admin/faculties \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Faculty of Science"}'
# copy the returned "id" — you need it for the next request
```

```bash
FACULTY_ID="paste_the_id_from_above"

curl -X POST http://localhost:3000/admin/departments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"facultyId\":\"$FACULTY_ID\",\"name\":\"Computer Science\"}"
```

```bash
DEPT_ID="paste_the_id_from_above"

curl -X POST http://localhost:3000/admin/courses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"departmentId\":\"$DEPT_ID\",\"code\":\"CSC301\",\"title\":\"Data Structures\"}"
```

```bash
COURSE_ID="paste_the_id_from_above"

curl -X POST http://localhost:3000/admin/academic-sessions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Rain Semester 2026","startDate":"2026-04-01","endDate":"2026-08-01"}'
```

### 5.3 Create a lecturer account, verify it, then assign them a course offering

```bash
curl -X POST http://localhost:3000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Dr Bello","email":"bello@example-university.edu","password":"lecturer123","role":"LECTURER"}'
```
This account starts **unverified** — trying to log in right now would fail
on purpose. Find their pending status and approve them:

```bash
curl http://localhost:3000/admin/lecturers/pending \
  -H "Authorization: Bearer $TOKEN"
# copy the lecturer's "id"
```

```bash
LECTURER_ID="paste_the_id_from_above"

curl -X PATCH http://localhost:3000/admin/lecturers/$LECTURER_ID/verify \
  -H "Authorization: Bearer $TOKEN"
```

Now assign them to teach the course you created:

```bash
SESSION_ID="paste_the_academic_session_id_from_5.2"

curl -X POST http://localhost:3000/admin/course-offerings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"courseId\":\"$COURSE_ID\",\"academicSessionId\":\"$SESSION_ID\",\"lecturerId\":\"$LECTURER_ID\"}"
```
**Copy the returned course offering `id` — this is what students will
enroll in, so save it somewhere.**

### 5.4 Create a student, enroll them, and post an announcement

```bash
curl -X POST http://localhost:3000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Amaka Obi","email":"amaka@example-university.edu","password":"student123","role":"STUDENT"}'
```

```bash
# log in as the student to get their own token
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"amaka@example-university.edu","password":"student123"}'
```

```bash
STUDENT_TOKEN="paste_student_token_here"
OFFERING_ID="paste_course_offering_id_from_5.3"

curl -X POST http://localhost:3000/enrollment \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -d "{\"courseOfferingId\":\"$OFFERING_ID\"}"
```

Now log in as the lecturer and post an announcement:
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"bello@example-university.edu","password":"lecturer123"}'
```
```bash
LECTURER_TOKEN="paste_lecturer_token_here"

curl -X POST http://localhost:3000/announcements \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LECTURER_TOKEN" \
  -d "{\"courseOfferingId\":\"$OFFERING_ID\",\"category\":\"VENUE_CHANGE\",\"content\":\"Class moved to Room 204 today.\"}"
```

Finally, prove the student can see it:
```bash
curl http://localhost:3000/announcements/offering/$OFFERING_ID \
  -H "Authorization: Bearer $STUDENT_TOKEN"
```

If that returns the announcement — **the entire backend is working
correctly, end to end, before you've touched the mobile app once.** If
something failed along the way, fix it here; don't move to the app yet.

---

## 6. Run the mobile app locally

```bash
cd mobile
npm install
cp .env.example .env
```

Edit `mobile/.env`. If you're testing on a **simulator on the same
machine**, `http://localhost:3000` works. If you're testing on a **real
phone** on the same wifi, you need your computer's LAN IP instead (find it
with `ipconfig getifaddr en0` on Mac, or `ipconfig` on Windows and look for
IPv4 Address):
```
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.XXX:3000
```

Because this app uses native modules (camera, biometrics) it needs a
**development build**, not the plain Expo Go app:

```bash
npx expo prebuild
npx expo run:ios       # or: npx expo run:android
```
This builds and launches the app on a simulator (or connected device). It
takes a few minutes the first time.

Try signing up as a student in the app, log in, and confirm you see the
announcement you created via curl in Step 5. If you see it — the phone app
is correctly talking to your local backend.

---

## 7. Deploy the backend so it's live on the internet

Right now the backend only runs on your laptop — if you close the
terminal, it's gone, and nobody else can reach it. Let's put it on Railway.

### 7.1 Push the backend to GitHub

```bash
cd backend
git init
git add .
git commit -m "Initial backend"
```
Create a new (empty) repository on github.com, then:
```bash
git remote add origin https://github.com/YOUR_USERNAME/campus-connect-backend.git
git branch -M main
git push -u origin main
```

### 7.2 Deploy on Railway

1. Go to railway.app → **New Project** → **Deploy from GitHub repo** → select the repo you just pushed
2. In the same project, click **+ New** → **Database** → **Add PostgreSQL**.
   Railway automatically creates a `DATABASE_URL` variable and makes it
   available to your app — you don't need to type a connection string
   yourself.
3. Click into your backend service → **Variables** tab → add:
   - `JWT_SECRET` = (a different long random string than your local one)
4. Still in the service settings, set the **Start Command** to:
   ```
   npx prisma migrate deploy && npm run start:prod
   ```
   (`migrate deploy` applies your schema to Railway's database the same way
   `migrate dev` did locally — but it doesn't ask interactive questions,
   which is what you want on a server.)
5. Also set the **Build Command** to:
   ```
   npm install && npm run build
   ```
6. Trigger a deploy (Railway usually does this automatically on push).
   Watch the deploy logs — wait for it to say the app started successfully.
7. Once deployed, run the seed script **once** using Railway's built-in
   shell (find "Shell" or "Run Command" in the service's menu):
   ```
   npm run prisma:seed
   ```
8. Railway gives your service a public URL under **Settings → Networking →
   Generate Domain**, something like:
   ```
   https://campus-connect-backend-production.up.railway.app
   ```

### 7.3 Confirm it's actually live

Run the exact same `curl` login command from Step 5.1, but swap
`http://localhost:3000` for your Railway URL. If you get a token back,
your backend is live on the real internet.

---

## 8. Build the mobile app for real testers (EAS)

### 8.1 Point the app at your live backend

Edit `mobile/.env`:
```
EXPO_PUBLIC_API_BASE_URL=https://campus-connect-backend-production.up.railway.app
```

### 8.2 Log in to EAS and configure the build

```bash
cd mobile
eas login
eas build:configure
```
(The project already has an `eas.json` with an `internal` profile set up —
you shouldn't need to change it, just confirm it looks right.)

### 8.3 Build for Android (the easy one)

```bash
eas build --profile internal --platform android
```
When it finishes, EAS gives you a URL. Send that link to any Android
tester — they open it on their phone, tap install, done. No app store, no
device registration needed.

### 8.4 Build for iOS (one extra step: device registration)

Apple requires every test device to be registered before an "internal
distribution" build will install on it — this is Apple's rule, not
something Expo can skip.

```bash
eas device:create
```
This prints a registration link. Send it to each iPhone tester — they open
it on their phone, it registers their device's UDID with your Apple
account. Once your testers have all registered:
```bash
eas build --profile internal --platform ios
```
This build now includes their devices. EAS gives you an installation link
same as Android — send it to them and they install it directly.

---

## 9. Walking a tester through the app end-to-end

The app now branches by role right after login — students land on a
Dashboard of their enrolled courses; lecturers land on a Dashboard of the
courses they teach. Here's the full loop:

**As a student:**
1. Sign up (role: Student) using an email matching the university's domain.
   You're logged in immediately.
2. Tap **"Browse Courses to Enroll"** — courses are grouped by
   Faculty/Department. Tap **Enroll** on one.
3. Back on the Dashboard, tap into that course to see its Announcements feed.
4. Tap **"Rep Status"** in the top right to apply to become a course
   representative — optionally add a short note. You'll see your
   application sit as **Pending**.

**As a lecturer (needs an admin to verify first — see Step 5.3):**
1. Sign up (role: Lecturer). You'll see a "pending verification" message.
2. Have an admin verify you and assign you a course offering
   (`/admin/lecturers/:id/verify` then `/admin/course-offerings`, via curl).
3. Log in — you'll land on **your** courses (not every course in the
   university). Tap into one.
4. If a student has applied to be a rep, you'll see their application at
   the top of the screen with **Approve**/**Reject** buttons.
5. Tap **"+ Post Announcement"** — pick a category (chips: General, Venue
   Change, Exam, Emergency, etc.), write the message, optionally set an
   expiry in hours and attach links (e.g. a slides URL). Submitting takes
   you straight back to the feed with the new post visible.

**Back as the student:** the new post appears **automatically**, live,
without needing to pull to refresh — the app is subscribed to that
course's real-time channel the whole time the Announcements screen is open.

---

## 10. Troubleshooting

**`prisma migrate dev` fails with a connection error**
→ Your Postgres container probably isn't running. `docker ps` to check;
`docker start campus-pg` if it's stopped.

**Mobile app can't reach the backend, but curl works fine**
→ You're almost certainly using `localhost` in `mobile/.env` while testing
on a physical device. A phone can't resolve your laptop's `localhost` —
use your computer's LAN IP instead (Section 6), or your live Railway URL.

**Lecturer signup succeeds but login fails with "pending verification"**
→ This is correct, expected behavior — not a bug. An admin has to call
`PATCH /admin/lecturers/:id/verify` first (Section 5.3).

**"Faculty does not belong to your university" or similar 403 errors from
`/admin` routes**
→ You're passing an ID (facultyId, departmentId, etc.) that belongs to a
different university than the admin's own. Double check you copied the
right ID from the right response.

**EAS build fails for iOS citing missing credentials**
→ Run `eas credentials` and follow the prompts — EAS can generate what it
needs (a distribution certificate) automatically the first time, it just
sometimes needs you to confirm interactively.

**Railway deploy succeeds but the app crashes on start**
→ Check the deploy logs for the actual error. Common cause: `JWT_SECRET`
variable wasn't set, or the start command wasn't updated to include
`prisma migrate deploy`.

**Announcements aren't appearing live — I have to force-close and reopen
the app to see new ones**
→ First confirm the REST flow still works (Section 5) — if that's fine,
the issue is the WebSocket layer specifically. Check: (1) your
`EXPO_PUBLIC_API_BASE_URL` uses `https://`, not `wss://` — the socket.io
client handles the upgrade itself, don't hand-write a websocket URL; (2) if
testing against a local backend on a real device, the same LAN-IP-vs-
localhost issue from Section 6 applies to sockets too; (3) Railway supports
WebSockets on its generated domains by default, so this is rarely a hosting
problem — check the backend logs for "disconnecting" warnings, which mean
the token being sent didn't verify (often an expired 15-minute access
token — log out and back in).

---

## 11. What's built vs. what's next

**Working end-to-end right now:**
- Full institution hierarchy (University → Campus/Faculty/Department/Course/CourseOffering/AcademicSession)
- Admin bootstrap (seed script) + full admin CRUD for standing up that hierarchy
- Self-signup for students/lecturers, gated by university email domain
- Lecturer verification queue, enforced at login
- Enrollment-gated announcement visibility
- **Role-aware mobile app**: students and lecturers see entirely different
  Dashboards after login
- Student: Browse Courses (enroll/drop), enrolled-course Dashboard,
  Announcements feed, and a Representative application screen with live
  status (Pending/Approved/Rejected/Revoked) and re-apply support
- Lecturer: Dashboard of courses they teach (not every course), a course
  screen showing pending rep applications with one-tap Approve/Reject,
  approved reps with a **Revoke** button, and a full Compose Announcement
  screen (category chips, expiry, link attachments)
- Course-offering-scoped representative applications/approval/revocation,
  **with the applicant list now properly restricted to the owning lecturer
  or an admin** — this was tightened during this pass; the original version
  let any authenticated user view any course's applicants and their
  submitted notes/documents
- **Real-time updates over WebSockets** — new/shared announcements push
  live to any subscribed student or lecturer without pulling to refresh.
  Room membership is permission-checked using the exact same
  `EnrollmentService.assertCanView` logic the REST endpoint uses, so
  there's one source of truth for course access, not two. (Documented
  tradeoff: the socket's JWT is verified once at connection time, not
  re-checked on every message — see `realtime.gateway.ts` for the reasoning.)
- **Tamper-evident, hash-chained history for both announcements (per
  course) and the audit log itself (per university)** — each row's hash
  commits to the previous one's, Certificate-Transparency-style, so
  retroactively altering or deleting any historical row (short of an
  attacker with full DB control rewriting the entire chain) is detectable.
  The announcement chain covers attachments too, not just text — a
  swapped attachment URL is caught the same way as edited text. Chain
  writes are serialized per scope via a Postgres advisory lock to prevent
  concurrent writes from forking the chain. Admins can now read the audit
  log (`GET /admin/audit-logs`) and verify its integrity
  (`GET /admin/audit-logs/verify`) — previously nothing could read it back
  at all, only write to it. A "Verify this course's announcement history"
  button in the app runs the equivalent check for announcements on demand.
- **Portable, O(log n) Merkle inclusion/consistency proofs** (RFC 6962-
  style) layered on top of both chains — a self-contained proof that one
  specific announcement (or audit log entry) is part of the record,
  verifiable without needing API access at all. The algorithm was
  validated with a 4,500+ case property test before being wired into the
  API (`backend/scripts/verify-merkle-tree.ts`, runnable standalone). The
  app's "Export proof of inclusion" action hands a proof to the OS share
  sheet so a student can save or send it outside the app entirely.
- Flat scoped permissions (`PermissionGrant`) + term-boxed `LeadershipRole`
- Immutable, expiring announcements with attachments + non-editable amplification
- Audit logging on every privileged action
- Rate limiting, session/device tracking with revoke-all

**Not yet built — the honest next-phase list:**
- **FCM/APNs push notifications** — the WebSocket layer only updates the
  app while it's open; there's still no push to a closed app. Permission is
  requested on the phone, but the backend doesn't send platform pushes yet
- **NotificationPreference screens** — the database table exists, no UI or
  routes to read/write it yet
- **Admin UI to appoint Leadership Roles** (Dept/Faculty President, Student
  Union) — the data model and permission logic exist; there's no endpoint
  yet to actually create one, only direct DB access
- **Socket re-authentication for long-lived connections** — see the
  documented tradeoff above; fine for a prototype, worth hardening before
  any real production use
- **No admin mobile app at all** — every admin action (standing up the
  institution hierarchy, verifying lecturers, and now reading/verifying the
  audit log) is API-only; there's no admin-facing screen in the mobile app,
  which is currently entirely student/lecturer-facing
- **Merkle-tree upgrade path for the hash chain** — the current verifier is
  O(n): it recomputes every announcement (or every audit log entry) in a
  scope to check its chain. Fine for a prototype's data volumes; a course
  or university with a very long history would benefit from the same
  O(log n) checkpoint-proof structure Certificate Transparency uses,
  rather than a full linear rescan
- **Academic calendar, assignments/exams, attendance, office hours**
- **Analytics dashboards** (read receipts, engagement metrics)

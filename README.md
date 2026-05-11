## Inspiration
1 teacher. 22 kids. 5 minutes each. That's 110 minutes a kindergarten teacher doesn't have.
We wanted to create a tool that helps kindergarten teachers overcome the challenge of being everywhere at once — introducing an AI classroom assistant that provides live handwriting feedback. Teachers set up student groups and start a session where students can independently learn to write their names, one letter at a time.

## What it does
The only login required is the teacher's. From their dashboard, teachers store student information, track active sessions, and monitor progress. They share a single 4-digit code with students to begin.
Students need no login and no typing. A simple number keypad gets them into the session. From there, they independently practice writing their name one letter at a time — guided entirely by on-device whiteboard annotations and immediate text-to-speech feedback. No reading comprehension required.
Every iPad becomes a personal assistant. Students are no longer bottlenecked by having just one teacher in the room.

# Tech Stack
## Frontend
| Component | Details |
|-----------|---------|
| **Next.js + React** | App Router, SSR |
| **tldraw** | Whiteboard canvas |
| **Supabase Auth** | Session, JWT |

## Backend (Next.js API Routes)
| Component | Details |
|-----------|---------|
| **API Routes** | REST endpoints |
| **Server Actions** | Mutations, triggers |
| **Supabase SDK** | DB + RLS queries |

## Database
| Component | Details |
|-----------|---------|
| **Postgres (Supabase)** | Tables, triggers, RLS |
| **Realtime** | Live session sync |
| **Storage** | Whiteboard assets |

## AI & Media
| Component | Details |
|-----------|---------|
| **Gemini 2.5 Flash Lite** | Image + text feedback |
| **ElevenLabs** | Text-to-speech |
| **Dev AI (Claude Code / Codex)** | Code generation tooling (not a production service) |

## User Interviews

### 1. Elementary School Teacher's Assistant
Though not a kindergarten teacher, we wanted to hear from an instructor who works closely with young children. Her biggest challenge was keeping students engaged and on-task for extended periods.
To address this for Letterling, we made the session length customizable: teachers control how many letters a student completes before the turn passes. To prevent a student from getting stuck, the turn automatically advances after 5 attempts on a single letter. The text-to-speech voice is also configured as a fun character to hold students' attention.

### 2. Kindergarten Education Assistant
Our second interviewee struggled with managing multiple students at the same time, a near-universal challenge in early childhood classrooms.
Letterling addresses this with an all-in-one teacher dashboard that shows progress across all students from a single screen. Teachers control when to start or pause a session, and have full flexibility over group size and the letter limit per turn.

## Outcomes
1. **Increase** the teacher to student ratio in classrooms
2. **Reduce** the effort required to give live feedback to student handwriting
3. **Improve** interactivity while learning with visual & verbal cues
4. **Minimize** number of clicks and manual help required by students to learn to write their name

## KPIs
1. 2 or more students actively practicing simultaneously with feedback
2. Live feedback delivered in < 3 seconds per letter submission for high interactivity
3. 0 teacher interventions required for a student to complete a full turn (letter prompt → draw → feedback → pass)

---

# Security & Pentesting Guide

## Architecture Security Model

| Layer | Mechanism |
|-------|-----------|
| Teacher auth | Supabase Auth (JWT stored in HttpOnly cookies) |
| Student auth | HMAC-SHA256 signed `letterling_play_session` cookie (4-hour TTL) |
| Group access | 4-digit `group_code`; session must be `active` and teacher must be "hosting" |
| Anti-brute-force | In-memory rate limiter: 12 join attempts per IP+User-Agent per 5-minute window |
| Session replay | `play_session_version` incremented on each new join; stale tokens rejected |
| Tab isolation | `x-play-tab` header must match current `play_session_version` |
| Tenant isolation | Supabase RLS enforced on all teacher-owned resources |

The `letterling_play_session` cookie payload (base64url JSON + HMAC-SHA256 signature):
```json
{ "groupId": "<uuid>", "sessionId": "<uuid>", "sessionVersion": 3, "issuedAt": 1234567890, "expiresAt": 1234582290 }
```

## Option A — Test the Deployed Version

No local setup required. Obtain the production URL and proceed directly to [Test Persona Setup](#test-persona-setup).

**Known deployment note:** The join-attempt rate limiter is in-process memory (not Redis). It resets on every cold start / redeploy. On serverless targets (Vercel) each function instance has an independent counter, so the effective limit is per-instance, not per-IP globally.

## Option B — Local Setup for Pentesting

1. Clone the repo and install dependencies:
   ```bash
   git clone <repo-url>
   cd letterling
   npm install
   ```

2. Copy `.env.local.example` to `.env.local` and fill in:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   PLAY_SESSION_SECRET=<any-strong-secret-for-local-testing>
   GEMINI_API_KEY=...
   ELEVENLABS_API_KEY=...
   ```
   For security testing you can stub out `GEMINI_API_KEY` and `ELEVENLABS_API_KEY` with placeholder values if you want to avoid hitting external APIs during injection/fuzzing.

3. Start the dev server:
   ```bash
   npm run dev   # http://localhost:3000
   ```

## Test Persona Setup

1. **Teacher A** — register at `/signup`, then use the dashboard to:
   - Create at least 2 students (with real-looking names to trigger the grading path)
   - Create a group and note the 4-digit `group_code`
   - Start a session (required for the group to be joinable)
   - Capture the Supabase auth cookies from browser DevTools → Application → Cookies

2. **Teacher B** — register a second account with a different email, create its own group and session. This is your cross-tenant test identity.

3. **Student session** — in a separate browser/incognito window navigate to `/play`, enter Teacher A's `group_code`, and capture the `letterling_play_session` cookie value.

## Endpoint Map

### Teacher (requires Supabase auth cookie)
| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/api/auth/signup` | No auth required |
| `GET\|POST` | `/api/students` | Scoped to authenticated teacher |
| `GET\|PUT\|DELETE` | `/api/students/[id]` | Must own the student |
| `GET\|POST` | `/api/groups` | Scoped to authenticated teacher |
| `GET\|PUT\|DELETE` | `/api/groups/[id]` | Must own the group |
| `GET\|POST` | `/api/sessions` | Scoped to authenticated teacher |
| `GET\|PUT\|DELETE` | `/api/sessions/[id]` | Must own the session |
| `GET\|PUT` | `/api/student-progress/[studentId]` | Must own the student |
| `POST` | `/api/whiteboard/feedback` | Must own the student |

### Student / Anonymous (requires `letterling_play_session` cookie)
| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/api/play/join?code=NNNN` | Issues the play session cookie |
| `GET\|PATCH` | `/api/play/[groupId]` | groupId must match cookie |
| `PUT` | `/api/play/[groupId]/progress` | groupId must match cookie |
| `POST` | `/api/play/grade` | Derives student from group state; requires `x-play-tab` header |
| `POST` | `/api/tts` | No additional auth beyond play session |

## Testing Checklist by Category

### 1. Broken Access Control
- [ ] Use Teacher B's auth cookies to call `GET/PUT/DELETE /api/students/[id]` with IDs belonging to Teacher A.
- [ ] Use a valid Student A play-session cookie against `/api/play/[groupId]` where `groupId` belongs to Teacher B.
- [ ] Tamper the `groupId` in the cookie payload — signature should reject it.
- [ ] Supply a mismatched `studentId` / `previousStudentId` in `PATCH /api/play/[groupId]` to try to hijack the active student slot.
- [ ] Call `/api/student-progress/[studentId]` (teacher endpoint) from an anonymous session.

### 2. Cryptographic Failures (4-digit code / play session)
- [ ] Attempt to brute-force `/api/play/join?code=NNNN` — confirm 429 triggers after 12 attempts per 5-minute window.
- [ ] Replay a captured `letterling_play_session` after calling join again (new version should invalidate the old token).
- [ ] Flip one byte of the cookie's HMAC signature — server must return 401.
- [ ] Submit an expired token (manipulate `expiresAt` in the base64 payload — signature will be invalid, expect rejection).
- [ ] Omit the `x-play-tab` header from a grading request — expect 403.
- [ ] Send `x-play-tab` with an off-by-one version number.

### 3. Injection
Test the following fields with: `'`, `"`, `<script>alert(1)</script>`, `{{7*7}}`, SQL comment sequences (`--`, `/*`), null bytes (`\x00`), and very long strings (>10 KB).

| Endpoint | Fields |
|----------|--------|
| `POST /api/students` | `first_name`, `last_name`, `parent_email` |
| `PUT /api/students/[id]` | same |
| `POST /api/groups` | `name` |
| `PUT /api/student-progress/[studentId]` | `goal_word`, `next_char` |
| `POST /api/play/grade` | `targetLetter`, `mimeType`, `imageBase64` header |
| `POST /api/tts` | `text` |
| `POST /api/whiteboard/feedback` | `goal_word`, `text` |

Look for: raw Supabase/PostgREST error messages, stack traces, constraint names, or reflected input in responses.

### 4. Insecure Design / Parameter Tampering
- [ ] `PUT /api/play/[groupId]/progress` — send `next_char: -1`, `next_char: 9999`, `status: "inactive"`.
- [ ] `PATCH /api/play/[groupId]` — set `studentId` to a student from a different group.
- [ ] `POST /api/play/grade` — set `imageBase64` to exactly `MAX_BASE64_CHARS + 1` characters; expect 413.
- [ ] `POST /api/play/grade` — send `mimeType: "text/html"` or `"image/svg+xml"`; expect 400.
- [ ] `POST /api/sessions` — set `letters_per_turn: 0`, `-1`, `999`.
- [ ] Teacher A creates a session, Teacher B tries to `PUT /api/sessions/[id]` to set `status: "active"`.

### 5. Exceptional Conditions
- [ ] Send `Content-Type: text/plain` with a JSON body to any `POST` endpoint.
- [ ] Send a completely empty body `{}` to endpoints that require fields.
- [ ] Send `null` values for required fields.
- [ ] Drop the `letterling_play_session` cookie entirely and call student endpoints.
- [ ] Call `/api/play/grade` after the teacher has ended the session — expect a session-expired error, not a 500.
- [ ] Submit a base64 string that decodes to a valid-length but corrupt JPEG to the grading endpoint.
- [ ] Check whether Supabase/PostgREST errors are returned verbatim in 500 responses (constraint names, table names, etc.).

## What to Document for Each Finding

1. Vulnerability name and OWASP category
2. Exact HTTP request (method, path, headers, body)
3. Auth state used (Teacher A, Teacher B, or anonymous + cookie value)
4. Payload(s) used
5. Response evidence (status code + body excerpt)
6. Impact in Letterling terms (e.g., student data exposure, session hijack, DoS)
7. Remediation guidance

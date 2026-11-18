# ProctorX

ProctorX is an online proctoring and assessment system for the CS/IT
department. Teachers create and run monitored exams and quizzes, students take
them from a laptop, tablet or phone, and the Dean oversees faculty, students,
academic periods, integrity analytics and audit logs.

AI monitoring produces **review indicators, not verdicts**: every flag is
reviewed by a teacher before any decision is made.

## Who does what

| Role | Main features |
| --- | --- |
| **Student** | Join subjects by code, take exams in a monitored room (fullscreen, screen share, camera/microphone when required), autosaved answers, raise a hand, see released results and progress analytics. |
| **Teacher** | Subjects and sections, question bank, exam builder (manual, AI-generated from PPT/PDF/DOCX, or Google Form embed), live CCTV-style monitoring grid, warnings, lock/resume, extra time, incident review with evidence clips, grading and result release, score correlation. |
| **Dean** | Academic periods, departments and faculty accounts, student lists and sections, permission overrides, integrity analytics, generated reports, audit logs, data-retention policy. |

## Architecture

```
 Browser (React + Vite)
        │  HTTPS + cookie session
        ▼
 ┌─────────────────────────────────────────────────┐
 │ Backend API — NestJS (apps/backend)  :4000      │
 │  • REST + Socket.IO (live monitoring, signaling)│
 │  • Prisma ORM ─────────────► PostgreSQL 16       │
 │  • Socket.IO Redis adapter ─► Redis 7 (optional) │
 └───────────────┬─────────────────────────────────┘
                 │ internal API key
                 ▼
 ┌─────────────────────────────────────────────────┐
 │ AI service — FastAPI (apps/ai-service)  :8000   │
 │  • Face analysis (MediaPipe), voice detection   │
 │  • Fuzzy-logic suspicion scoring (Mamdani)      │
 │  • AI question generation, PDF reports (Celery) │
 └─────────────────────────────────────────────────┘
```

Live screen/camera video goes **directly from the student's browser to the
teacher's** (WebRTC); it is not stored. Camera snapshots (every 10 s) and audio
samples are analysed in memory and discarded — only the findings are saved.
Short evidence clips around tab-switch / fullscreen-exit incidents are kept for
teacher review and deleted automatically after 180 days.

## Repository layout

| Path | Contents |
| --- | --- |
| `apps/web` | React + TypeScript web app (all three portals) |
| `apps/backend` | NestJS API, Prisma schema and migrations |
| `apps/ai-service` | FastAPI AI service and Celery worker |
| `packages/` | Shared TypeScript config and types |
| `tools/loadtest` | Load-test scripts and measured results |

## Getting started

Full, step-by-step Windows instructions (prerequisites, `.env` values, Python
environment, troubleshooting) are in **[FRIEND_SETUP_GUIDE.md](FRIEND_SETUP_GUIDE.md)**.

Short version, after installing Node.js 22, Python 3.11, Docker Desktop and
LibreOffice:

```powershell
npm ci
Copy-Item apps\backend\.env.example apps\backend\.env      # then fill in values
Copy-Item apps\web\.env.example apps\web\.env
Copy-Item apps\ai-service\.env.example apps\ai-service\.env

cd apps\ai-service; py -3.11 -m venv .venv; .\.venv\Scripts\python -m pip install -r requirements.txt; cd ..\..

docker compose up -d        # PostgreSQL + Redis
npm run db:migrate
npm run db:seed             # creates the dean/teacher/student accounts from .env

npm run dev:web             # terminal 1 → http://localhost:5173
npm run dev:backend         # terminal 2 → http://localhost:4000
npm run dev:ai              # terminal 3 → http://127.0.0.1:8000/docs
```

## Configuration

Each app has a documented `.env.example`. The most important settings:

| Variable | Where | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | backend | PostgreSQL connection |
| `JWT_SECRET` | backend | Session signing key — **required, 32+ characters** |
| `INTERNAL_API_KEY` | backend + AI | Shared backend↔AI key — **required, identical, 32+ characters** |
| `CORS_ORIGINS` | backend | Allowed web origins |
| `SMTP_*` | backend | Email for activation codes |
| `TURN_*` / `STUN_URLS` | backend | WebRTC relay; TURN is strongly recommended on campus networks |
| `EVIDENCE_RETENTION_DAYS` | backend | Days evidence clips are kept (default 180) |
| `FACE_SAMPLE_SECONDS`, `AUDIO_SAMPLE_SECONDS` | backend | AI sampling cadence (default 10 s) |
| `DB_POOL_SIZE` | backend | Database connections per backend instance (default 30) |
| `TRUST_PROXY` | backend | Set behind a reverse proxy so rate limits see real client IPs |
| `GEMINI_API_KEY`, `LIBREOFFICE_PATH` | AI | AI question generation from documents |
| `FACE_ANALYZER_POOL` | AI | MediaPipe instances per process (scale with `--workers`) |

Never commit `.env` files.

## Testing

```powershell
npm test            # backend + web unit tests
npm run typecheck   # backend and web
npm run test:ai     # AI service (pytest)
```

GitHub Actions (`.github/workflows/ci.yml`) runs all of these on every push
and pull request.

Load testing: see **[tools/loadtest/README.md](tools/loadtest/README.md)** for
how to simulate hundreds of concurrent students, the measured results, and the
recommended deployment for 300–500 students.

## Security and privacy

- HTTP-only session cookie; every session is server-side and revocable
  (logout, password change and account deactivation take effect immediately,
  including live connections).
- Role-based access control plus per-faculty permission overrides managed by
  the Dean; append-only audit log.
- Rate limiting keyed per account and per session, so a whole campus behind
  one IP address is not throttled together.
- Exam integrity enforced on the server: wall-clock timer, lock, grace window,
  one live session per student; unsubmitted attempts are graded from their
  last autosave when time runs out.
- Data minimisation (RA 10173): snapshots and live video are never stored;
  evidence clips are deleted after the retention period, recorded in the audit
  log.

## Tech stack

React 19, Vite, Tailwind CSS, TanStack Query, Socket.IO, WebRTC · NestJS 11,
Prisma, PostgreSQL 16, Redis 7 · FastAPI, MediaPipe, OpenCV, webrtcvad,
scikit-fuzzy, Celery.

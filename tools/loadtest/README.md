# ProctorX load test

Simulates many students taking a camera- and microphone-monitored exam at the
same time, plus one teacher watching the live monitor, and reports latency and
error rates per endpoint.

Each simulated student behaves like the real web client:

| Traffic | Frequency |
| --- | --- |
| Sign in, join the exam, open the Socket.IO room | once (spread over the ramp-up) |
| HTTP heartbeat + socket heartbeat | every 5 s |
| Camera snapshot (640×480 JPEG, ~42 KB) for AI analysis | every 10 s |
| Audio sample (16 kHz WAV) | ~10% of 10 s ticks (silence is not uploaded) |
| Autosaved draft | every 15 s |
| Tab-switch event | occasionally |
| Final submit | once |

## Safety

The scripts **refuse to run unless `DATABASE_URL` points at a database whose
name contains `loadtest`**. Never point them at the real `proctorx` database.

## Running it

From the repository root (PowerShell shown; the backend `.env` supplies the
other settings):

```powershell
# 1. Create a throwaway database and apply migrations
docker exec proctorx-postgres-1 createdb -U <db-user> proctorx_loadtest
$env:DATABASE_URL = "postgresql://<user>:<password>@localhost:5432/proctorx_loadtest"
npx prisma migrate deploy --schema apps/backend/prisma/schema.prisma

# 2. Create 500 students, a teacher and a published exam (writes fixtures.json)
$env:STUDENTS = "500"; node tools/loadtest/setup.cjs

# 3. Start the AI service and a backend pointed at the load-test database
#    (separate terminals)
cd apps/ai-service; .venv\Scripts\python -m uvicorn app.main:app --port 8100 --workers 4
cd apps/backend;  $env:PORT="4100"; $env:AI_SERVICE_URL="http://127.0.0.1:8100"; npm run start:dev

# 4. Run (reset first if you run more than once)
node tools/loadtest/reset.cjs
node tools/loadtest/run.cjs --base http://127.0.0.1:4100 --students 500 --duration 180 --ramp 60

# 5. Clean up
docker exec proctorx-postgres-1 dropdb -U <db-user> proctorx_loadtest
```

Options for `run.cjs`: `--students`, `--duration` (seconds of steady load),
`--ramp` (seconds over which students sign in), `--face` / `--audio`
(sampling seconds).

Run the load generator on a **different machine** from the server when
possible; otherwise it competes with the server for CPU.

## Results (November 2026)

All components (PostgreSQL in Docker Desktop, backend, AI service with 4
workers, and the load generator) ran on **one 8-core Windows development
laptop**.

| Scenario | Sign-ins | Joined | Submitted | Server errors |
| --- | --- | --- | --- | --- |
| 500 students, before Phase 4 fixes | 415 / 500 (85 failed) | 415 | 415 | 85 |
| 500 students, after Phase 4 fixes | 500 / 500 | 500 | 500 | 0 |

With 500 students every attempt completed, but monitoring traffic was slow on
this hardware: median heartbeat ≈ 10 s and roughly a third of camera samples
were skipped by the AI service's overload protection (by design, a skipped
sample is simply not analysed).

### Bottlenecks found and fixed

| Finding | Fix |
| --- | --- |
| Database connection pool (17) exhausted → sign-in failures | Pool of 30, single-query auth check |
| AI service handled one frame at a time (blocking event loop) | Analysis in a thread pool, stateless service, `--workers N` |
| AI overload stalled fuzzy scoring and health checks | Bounded queue; excess frames answered "busy" at once |
| Camera/audio uploads rejected by the AI service (missing MIME type) | Real media type sent — analysis now actually runs |
| Heartbeat wrote to the database every 5 s per student | Writes once per minute (timer is computed from the clock) |
| Autosave rewrote every answer | Writes only the changed answers |
| JWT secret re-parsed on every request | Pre-built secret key object |

### Remaining limit on the test laptop

On Docker Desktop for Windows, a database commit took **12.9 ms versus 1.7 ms
for a read** (≈180 commits/s maximum), so write-heavy traffic queues behind
disk flushes. This is a property of the test hardware, not of the code.

### Recommended deployment for 300–500 concurrent students

- A dedicated Linux server (or VM) with SSD storage for PostgreSQL.
- AI service with one worker per CPU core: `uvicorn app.main:app --workers <cores>`.
- Keep camera sampling at 10 s (`FACE_SAMPLE_SECONDS`).
- Students sign in a few minutes before the exam starts, so sign-ins are not
  all in the same minute.
- For more than one backend instance: set `REDIS_URL` (shared Socket.IO
  rooms), use sticky sessions, and keep the total of `DB_POOL_SIZE` across
  instances below PostgreSQL's `max_connections`.

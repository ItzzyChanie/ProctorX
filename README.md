# ProctorX

**An AI-assisted online proctoring and assessment system for schools.**
Teachers build and run monitored exams, students take them from a laptop,
tablet or phone, and the Dean oversees integrity across the whole department.

> AI monitoring produces **review indicators, not verdicts.** Every flag is
> reviewed by a teacher before any decision is made.

---

## Table of contents

1. [What is ProctorX?](#what-is-proctorx)
2. [Why it matters](#why-it-matters)
3. [Who uses it](#who-uses-it)
4. [Features](#features)
5. [How monitoring works](#how-monitoring-works)
6. [Tech stack](#tech-stack)
7. [Architecture](#architecture)
8. [Repository layout](#repository-layout)
9. [Setup guide (step by step, for beginners)](#setup-guide-step-by-step-for-beginners)
10. [Configuration reference](#configuration-reference)
11. [Testing](#testing)
12. [Security and privacy](#security-and-privacy)

---

## What is ProctorX?

ProctorX is a web-based system for creating, taking and supervising online
exams and quizzes. It combines:

- an **exam platform**: question bank, exam builder, autosave, grading and result release,
- **live proctoring**: a CCTV-style wall where teachers watch students' screens and cameras in real time,
- **AI assistance**: face and voice analysis during exams, AI-generated questions from lecture files, AI difficulty review and essay-grading suggestions,
- **department oversight**: analytics, reports, audit logs and data-retention controls for the Dean.

## Why it matters

Online and hybrid exams are common, but they are hard to supervise fairly:

- **Teachers can't watch 40+ screens at once.** ProctorX watches for the patterns that matter and brings them to the teacher's attention, with evidence.
- **Cheating detection must be fair.** A glance away or a cough is not cheating. ProctorX only reports behaviour that persists, scores it with fuzzy logic, and always leaves the final decision to a human.
- **Writing good exams takes time.** AI turns lecture slides and handouts into draft questions, then reviews their difficulty before publishing.
- **Privacy is the law.** Following the Data Privacy Act of 2012 (RA 10173), live video and snapshots are never stored. Only short evidence clips around incidents are kept, and they are deleted automatically.
- **Students use whatever device they have.** Exams work on laptops, and on phones and tablets in camera-only mode.

## Who uses it

| Role | Who they are | What they do in ProctorX |
| --- | --- | --- |
| **Dean** | Department head / administrator | Sets up the department, manages faculty and students, sees integrity analytics and reports, and controls permissions and data retention. |
| **Teacher** | Faculty member | Creates subjects, sections and exams, monitors live exams, reviews incidents, grades and releases results. |
| **Student** | Enrolled learner | Joins subjects, takes monitored exams, and sees results and progress. |

## Features

### Student
- Join subjects and sections using a **class code**
- **Dashboard**, **assessment calendar** and **notifications** for upcoming exams
- **Monitored exam room**: fullscreen, screen sharing, and camera/microphone when the teacher requires them
- **Camera-only mode** on phones and tablets, where screen sharing isn't possible
- **Autosaved answers**: a refresh or lost connection doesn't lose work
- **Question navigator**, **flag for review**, and a **review screen** before submitting
- **Results** (once released by the teacher) and **progress analytics**
- Profile and avatar management

### Teacher
- **Subjects, sections and student rosters**, including bulk import of students from Excel
- **Question bank** with six question types: multiple choice, checkboxes (select all that apply), identification, enumeration, fill-in-the-blank and essay
- **Partial credit** and **typo tolerance** for typed answers
- **Exam builder** with three ways to create an exam:
  - manually,
  - **AI-generated** from PPT/PPTX, PDF or DOCX files,
  - **Google Form** exams (link a form; the exam room still monitors the student)
- **Exam drafts**, per-question difficulty, and **AI difficulty review** before publishing
- Randomized question and answer order, scheduling, time limits
- **Live monitoring wall**: real-time screen and camera tiles for every student, auto-fit to any screen size
- Live controls: **warnings**, **lock / resume** an exam, **extra time**, and **messages**
- **Incident review** with **evidence clips** (recorded around tab switches and fullscreen exits) and AI suspicion scores
- **Grading** of submitted exams with **AI essay-grading suggestions**, then **result release**
- **Item analysis**: AI-predicted vs. actual question difficulty
- **Score correlation**: compare suspicion scores with exam scores

### Dean
- **Institution registration** (Get Started page) with institutional email verification
- **Academic periods** (semesters) and **departments**
- **Faculty accounts** and **student lists**
- **Permission overrides** per faculty member
- **Integrity analytics** across the department
- **Generated PDF reports**
- **Audit logs** (append-only)
- **Data-retention policy** for evidence clips

### Proctoring signals detected
| Signal | Detected by |
| --- | --- |
| Tab / app switch | Browser (Page Visibility API) |
| Fullscreen exit | Browser (Fullscreen API) |
| Screen sharing stopped | Browser (screen-capture track ended) |
| Multiple displays | Browser (Window Management API, Chrome/Edge) |
| Face not visible | AI service (MediaPipe) |
| Multiple faces | AI service (MediaPipe) |
| Excessive eye movement / looking away | AI service (MediaPipe face landmarks) |
| Possible talking | AI service (mouth movement) |
| Voice detected | AI service (WebRTC voice activity detection) |
| Google Form opened in a new tab | Browser (expected action, not penalized) |

## How monitoring works

1. **Live video (screen + camera)** travels **directly from the student's
   browser to the teacher's browser** over **WebRTC**. The server only helps
   the two connect (signaling over Socket.IO). Live video is **not stored**.
2. Every **10 seconds** the student's browser sends a **camera snapshot** and a
   short **audio sample** to the backend, which forwards them to the AI
   service. They are analysed **in memory and discarded**; only the findings are saved.
3. The AI service only reports a behaviour (for example, face missing or
   looking away) if it **persists for about 9 seconds across at least two
   samples**, so a single blink or glance is never an incident.
4. Browser events (tab switch, fullscreen exit, screen share stopped) are sent
   to the backend immediately. A **short evidence clip** of the screen around
   the event is uploaded for teacher review.
5. A **fuzzy-logic engine** (Mamdani inference) combines all indicators into a
   **suspicion score** that the teacher sees on the monitoring wall and in
   incident review.
6. Evidence clips are **deleted automatically** after the retention period
   (default **180 days**), and each deletion is recorded in the audit log.

## Tech stack

### Frontend (`apps/web`)
| Technology | Used for |
| --- | --- |
| **React 19** + **TypeScript** | User interface for all three portals |
| **Vite** | Development server and production build |
| **Tailwind CSS 4** | Styling, light/dark theme |
| **React Router 7** | Page routing |
| **TanStack Query** | Server data fetching and caching |
| **Zustand** | Client state (auth session) |
| **React Hook Form** + **Zod** | Forms and validation |
| **Axios** | HTTP client |
| **Socket.IO client** | Real-time events (live monitoring, warnings, chat) |
| **Recharts** | Analytics charts |
| **Lucide** | Icons |

### Backend (`apps/backend`)
| Technology | Used for |
| --- | --- |
| **NestJS 11** (Node.js + TypeScript) | REST API |
| **Socket.IO** (+ Redis adapter) | Real-time events and WebRTC signaling; Redis lets several backend instances share rooms |
| **Prisma 6** | Database ORM and migrations |
| **PostgreSQL 16** | Main database |
| **Redis 7** | Socket.IO scaling and the AI job queue |
| **Passport + JWT** in an HTTP-only cookie | Authentication with revocable server-side sessions |
| **bcrypt** | Password hashing |
| **Helmet**, **@nestjs/throttler** | Security headers and rate limiting |
| **Nodemailer** | Activation and verification emails (SMTP) |
| **ffmpeg** (`ffmpeg-static`) | Processing evidence clips |
| **xlsx** | Excel import of students |

### AI service (`apps/ai-service`)
| Technology | Used for |
| --- | --- |
| **Python 3.11** + **FastAPI** + **Uvicorn** | AI REST API |
| **Celery** (Redis broker) | Background job worker for PDF reports |
| **Google Gemini** | AI question generation, difficulty review, essay-grading suggestions |
| **python-pptx**, **python-docx**, **pdfplumber**, **PyMuPDF**, **LibreOffice** | Reading lecture files (PPT/PPTX, DOCX, PDF) |
| **scikit-fuzzy** | Fuzzy-logic suspicion scoring |
| **NumPy, SciPy, pandas, statsmodels** | Analytics and score correlation |
| **Matplotlib** | Charts in PDF reports |

### Screen and face monitoring
| Technology | Where | Used for |
| --- | --- | --- |
| **WebRTC** (`getDisplayMedia`, `getUserMedia`) | Browser | Capturing the screen, camera and microphone; peer-to-peer live video to the teacher |
| **STUN / TURN** servers | Network | Connecting browsers across school networks (TURN relays video when a direct connection is blocked) |
| **MediaRecorder** | Browser | Recording short evidence clips |
| **Page Visibility & Fullscreen APIs** | Browser | Detecting tab switches and fullscreen exits |
| **MediaPipe Face Mesh** + **OpenCV** | AI service | Face presence, face count, gaze and mouth movement |
| **webrtcvad** | AI service | Detecting human voice in audio samples |

### Tooling
Docker Compose (PostgreSQL + Redis), npm workspaces (monorepo), GitHub Actions CI,
Node's built-in test runner, pytest.

## Architecture

```
 Student / Teacher / Dean browser (React + Vite)        :5173
        │  HTTPS + cookie session     ▲
        │                             │  WebRTC: live screen + camera,
        ▼                             │  student ──► teacher directly
 ┌─────────────────────────────────────────────────┐
 │ Backend API — NestJS (apps/backend)       :4000 │
 │  • REST + Socket.IO (live monitoring, signaling)│
 │  • Prisma ORM ─────────────► PostgreSQL 16 :5432│
 │  • Socket.IO Redis adapter ─► Redis 7      :6379│
 └───────────────┬─────────────────────────────────┘
                 │ internal API key
                 ▼
 ┌─────────────────────────────────────────────────┐
 │ AI service — FastAPI (apps/ai-service)    :8000 │
 │  • Face analysis (MediaPipe), voice detection   │
 │  • Fuzzy-logic suspicion scoring (Mamdani)      │
 │  • Question generation & review (Gemini)        │
 │  • PDF reports via Celery worker (Redis queue)  │
 └─────────────────────────────────────────────────┘
```

## Repository layout

| Path | Contents |
| --- | --- |
| `apps/web` | React + TypeScript web app (Student, Teacher and Dean portals) |
| `apps/backend` | NestJS API, Prisma schema, migrations and seed script |
| `apps/ai-service` | FastAPI AI service and Celery worker |
| `packages/` | Shared TypeScript config and types |
| `tools/loadtest` | Load-test scripts and measured results |
| `docker-compose.yml` | Local PostgreSQL and Redis |

---

## Setup guide (step by step, for beginners)

This guide sets up ProctorX on a **Windows 10 (version 2004 or newer) or
Windows 11, 64-bit** laptop or PC. When you finish, all five parts run on your
machine: the website, the backend API, the AI service, PostgreSQL and Redis.

> **Where do I type the commands?**
> Use **PowerShell**: press **Start**, type `PowerShell`, and open it.
> The VS Code terminal (`` Ctrl+` ``) also works.
> Commands are written for PowerShell. Where Command Prompt (CMD) needs
> something different, both versions are shown.

### Step 0: Check your computer

| | Minimum | Recommended |
| --- | --- | --- |
| RAM | 8 GB | 16 GB |
| Free disk space | 10 GB | 15 GB |
| Internet | Needed for the first install (downloads ~2–3 GB) | |
| CPU virtualization | Must be **enabled** in BIOS/UEFI (needed by Docker) | |

With less than 8 GB of RAM it still runs, but close other apps (browsers with
many tabs, games) while using it.

### Step 1: Install the required software

Install these once, in this order. Restart Windows if an installer asks you to.

| # | Software | Version | Download | Notes |
| --- | --- | --- | --- | --- |
| 1 | **Git** | Latest | https://git-scm.com/download/win | Keep the default options. |
| 2 | **Node.js** | **22 LTS** (at least 20.19) | https://nodejs.org | npm is included. |
| 3 | **Python** | **3.11, 64-bit** | https://www.python.org/downloads/windows/ | ⚠️ Tick **"Add python.exe to PATH"** on the first installer screen. Don't use 3.12 or newer. |
| 4 | **WSL 2** | Latest | (command below) | Needed by Docker Desktop. |
| 5 | **Docker Desktop** | Latest | https://www.docker.com/products/docker-desktop/ | Runs PostgreSQL and Redis. |
| 6 | **LibreOffice** | Latest | https://www.libreoffice.org/download/ | Only needed for AI question generation from Office files (PPT/PPTX). |
| 7 | **VS Code** | Latest (optional) | https://code.visualstudio.com | Recommended editor. |
| 8 | **Google Chrome** or **Microsoft Edge** | Latest | | Best support for screen sharing. |

**Installing WSL 2 and Docker Desktop:**

1. Right-click **Start**, choose **Terminal (Admin)** or **Windows PowerShell (Admin)**.
2. Run:
   ```powershell
   wsl --install
   ```
3. **Restart** your computer when it finishes.
4. After restarting, open **Ubuntu** from the Start menu once. Create a Linux
   username and password when asked, then close the window.
5. Install **Docker Desktop** and open it. In **Settings → General**, make sure
   **"Use the WSL 2 based engine"** is ticked. Click **Apply & Restart**.
6. Leave Docker Desktop running. Its whale icon in the taskbar tray should be steady, not animating.

### Step 2: Check that everything is installed

Open a **new, normal** PowerShell window (not Admin) and run each line:

```powershell
git --version
node --version
npm --version
py -3.11 --version
docker --version
docker compose version
```

Each one should print a version number:

- `node` must be **v20.19.0 or newer** (v22 recommended).
- `npm` must be **10 or newer**.
- `py -3.11` must print **Python 3.11.x**.

If a command says *"is not recognized"*, reinstall that program, then
**close and reopen PowerShell**.

### Step 3: Download the project

Choose a short folder path without spaces, for example `C:\Projects`:

```powershell
mkdir C:\Projects
cd C:\Projects
git clone https://github.com/ItzzyChanie/ProctorX.git
cd ProctorX
```

**Every command from now on runs inside this `ProctorX` folder** (the
"project root") unless a step says otherwise.

> Got the project as a ZIP file instead? Extract it fully (not inside the ZIP
> viewer) to `C:\Projects\ProctorX`, then run `cd C:\Projects\ProctorX`.
> Never copy `node_modules`, `.venv` or `.env` from another computer.

### Step 4: Install the JavaScript packages

```powershell
npm ci
```

This installs the exact package versions from `package-lock.json` for the
website and backend. It takes a few minutes the first time. Don't install
Nest, Vite or Prisma globally.

### Step 5: Create the `.env` files (settings and secrets)

GitHub only contains **`.env.example`** templates. The real `.env` files hold
passwords and keys, so they are **never uploaded**. Each person creates their
own.

**5.1: Copy the three templates**

PowerShell:
```powershell
Copy-Item apps\backend\.env.example apps\backend\.env
Copy-Item apps\web\.env.example apps\web\.env
Copy-Item apps\ai-service\.env.example apps\ai-service\.env
```

Command Prompt (CMD):
```bat
copy apps\backend\.env.example apps\backend\.env
copy apps\web\.env.example apps\web\.env
copy apps\ai-service\.env.example apps\ai-service\.env
```

**5.2: Generate two secret keys**

Run this command **twice** and copy each output somewhere (each is a 64-character random string):

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

- First output → your **`JWT_SECRET`**
- Second output → your **`INTERNAL_API_KEY`**

**5.3: Edit `apps\backend\.env`**

Open it in VS Code or Notepad (`notepad apps\backend\.env`). Replace every
value written in `<angle brackets>`. You can leave the other lines as they are.

| Setting | What to put | Example |
| --- | --- | --- |
| `DATABASE_URL` | Use this exact value (it matches `docker-compose.yml`) | `postgresql://proctorx:proctorx_dev@localhost:5432/proctorx` |
| `JWT_SECRET` | First generated key from step 5.2 | `9f3c…` (64 characters) |
| `INTERNAL_API_KEY` | Second generated key from step 5.2 | `a71e…` (64 characters) |
| `SEED_DEAN_EMAIL` | Email you'll use to log in as Dean | `dean@example.com` |
| `SEED_DEAN_PASSWORD` | A password for the Dean account | `ChangeMe123!` |
| `SEED_DEAN_FULLNAME` | Dean's display name | `Demo Dean` |
| `SEED_TEACHER_EMAIL` / `_PASSWORD` / `_FULLNAME` | A demo teacher account | `teacher@example.com` / `TeacherDemo1!` / `Demo Teacher` |
| `SEED_STUDENT_LOGIN_ID` / `_EMAIL` / `_PASSWORD` / `_FULLNAME` | A demo student account | `2023-01234` / `student@example.com` / `StudentDemo1!` / `Demo Student` |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | **Optional.** Only needed to send emails (student activation codes, institution verification). See the box below. | `smtp.gmail.com`, `you@gmail.com`, *app password*, `"ProctorX <you@gmail.com>"` |

Don't change `AI_SERVICE_URL`, `CORS_ORIGINS`, `STUN_URLS` or the numbers at
the bottom for local use.

> **Sending real emails with Gmail (optional):** turn on 2-Step Verification
> on the Google account, then create an **App Password** at
> https://myaccount.google.com/apppasswords. Use `SMTP_HOST=smtp.gmail.com`,
> `SMTP_PORT=587`, your Gmail address as `SMTP_USER`, and the 16-character
> app password as `SMTP_PASS`. Without SMTP, everything works except features
> that send emails.

**5.4: Edit `apps\ai-service\.env`**

| Setting | What to put | Example |
| --- | --- | --- |
| `INTERNAL_API_KEY` | ⚠️ **Exactly the same value** as `INTERNAL_API_KEY` in the backend `.env` | `a71e…` |
| `GEMINI_API_KEY` | Your Google Gemini API key. Get a free one at https://aistudio.google.com/apikey. **Only needed for AI features** (question generation, difficulty review, essay suggestions). | `AIza…` |
| `LIBREOFFICE_PATH` | Full path to LibreOffice's `soffice.exe` | `C:\Program Files\LibreOffice\program\soffice.exe` |
| `LLM_BASE_URL`, `LLM_API_KEY` | Leave empty (delete the `<...>` text) unless you use another AI provider | *(empty)* |

Leave the other lines (`AI_SERVICE_PORT`, `REDIS_URL`, `LLM_MODEL`, the limits) as they are.

**5.5: `apps\web\.env`**

Nothing to change. It already points the website to the local backend:
```dotenv
VITE_API_URL=http://localhost:4000
VITE_SOCKET_URL=http://localhost:4000
```

> 🔒 **Never upload or share your `.env` files** (they're already in
> `.gitignore`). Don't paste API keys into chats or screenshots.

### Step 6: Set up the Python environment for the AI service

This creates a private Python environment (`.venv`) just for ProctorX and
installs the AI libraries (MediaPipe, OpenCV, FastAPI…). It downloads about 1 GB.

PowerShell:
```powershell
cd apps\ai-service
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
cd ..\..
```

Command Prompt (CMD):
```bat
cd apps\ai-service
py -3.11 -m venv .venv
.venv\Scripts\python.exe -m pip install --upgrade pip
.venv\Scripts\python.exe -m pip install -r requirements.txt
cd ..\..
```

If a package fails to install, check that `py -3.11 --version` works, install
the latest **Microsoft Visual C++ Redistributable (x64)**, and try again.

### Step 7: Start the database (PostgreSQL) and Redis

Make sure **Docker Desktop is open and running**, then:

```powershell
docker compose up -d
docker compose ps
```

The first run downloads the images. `docker compose ps` should list
**postgres** and **redis** with status **running** / **Up**.

### Step 8: Create the database tables and demo accounts

```powershell
npm run db:migrate
npm run db:seed
```

- **`db:migrate`** creates all the tables by applying the migrations in
  `apps/backend/prisma/migrations`.
- **`db:seed`** creates the **Dean, Teacher and Student** accounts from your
  `apps\backend\.env` and prints their login details.

### Step 9: Run ProctorX

ProctorX needs **three terminals running at the same time**. Open three
PowerShell windows (or three VS Code terminals with the **+** button). In
each one, `cd` to the project folder, then run one command:

| Terminal | Command | Wait until you see |
| --- | --- | --- |
| 1: Website | `npm run dev:web` | `Local: http://localhost:5173/` |
| 2: Backend API | `npm run dev:backend` | `Nest application successfully started` |
| 3: AI service | `npm run dev:ai` | `Application startup complete` |

Keep all three windows open while using ProctorX.

### Step 10: Log in

1. Open **http://localhost:5173** in Chrome or Edge.
2. Log in with the **Dean** email and password from your `apps\backend\.env`.
   You'll be asked to **change the Dean password** on first login.
3. To try the other portals, log out and log in as the demo **Teacher**
   (email) or **Student** (student login ID).

Useful extra pages:
- AI service API docs: http://127.0.0.1:8000/docs
- Browse the database visually: run `npm run db:studio`

🎉 **Setup is complete.**

---

### Everyday use

**Starting ProctorX again later:**
1. Open **Docker Desktop**. The database starts automatically.
2. Open the three terminals and run `npm run dev:web`, `npm run dev:backend` and `npm run dev:ai` (step 9).

**Stopping:** press `Ctrl+C` in each terminal. To also stop the database
containers (your data is kept):
```powershell
docker compose down
```

### After downloading updates (`git pull`)

Whenever you pull new changes from GitHub, stop the three terminals and run:

```powershell
git pull
npm ci                 # install any new/changed JavaScript packages
npm run db:migrate     # apply any new database migrations
```

If `apps/ai-service/requirements.txt` changed, also run:
```powershell
cd apps\ai-service
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
cd ..\..
```

Also compare your `.env` files with the `.env.example` files. If a new
setting was added, copy it into your `.env`.

Then start the three terminals again.

### Using ProctorX from another device on the same Wi-Fi (optional)

Browsers only allow **camera, microphone and screen sharing** on `https://`
sites or on `localhost`. So opening `http://<your-laptop-IP>:5173` from a
phone or another laptop **loads the site, but the camera and screen share are
blocked**. For full features on other devices, host ProctorX on a server with
HTTPS (or use an HTTPS tunnel such as Cloudflare Tunnel), and update
`CORS_ORIGINS` (backend `.env`) and `VITE_API_URL` / `VITE_SOCKET_URL`
(web `.env`) to that address.

### Quick health check

If something isn't working, check that each part is listening:

```powershell
docker compose ps                            # postgres + redis running?
Test-NetConnection localhost -Port 5432      # PostgreSQL
Test-NetConnection localhost -Port 6379      # Redis
Test-NetConnection localhost -Port 4000      # Backend   (terminal 2)
Test-NetConnection localhost -Port 8000      # AI service (terminal 3)
Test-NetConnection localhost -Port 5173      # Website   (terminal 1)
```

`TcpTestSucceeded : True` means that part is running.

### Troubleshooting

| Problem | Fix |
| --- | --- |
| `docker` is not recognized, or *"cannot connect to the Docker daemon"* | Open Docker Desktop and wait until it's fully started, then run `docker compose up -d` again. |
| WSL says virtualization is disabled | Enable **Intel VT-x / AMD-V (SVM)** in your BIOS/UEFI settings, then run `wsl --install` again as Admin. |
| `py -3.11` is not found | Install Python **3.11 64-bit** with **"Add python.exe to PATH"** ticked, then reopen PowerShell. |
| `npm run dev:ai` fails with `.venv\Scripts\python.exe` not found | You skipped or didn't finish step 6. Run it again from the project root. |
| Backend or AI service stops with *"must be set to at least 32 characters"* | `JWT_SECRET` and `INTERNAL_API_KEY` must be 32+ characters. Generate them with the command in step 5.2. |
| AI features return *unauthorized* | `INTERNAL_API_KEY` must be **identical** in `apps\backend\.env` and `apps\ai-service\.env`. Restart terminals 2 and 3 after fixing. |
| *"Gemini is not configured"* | Add a valid `GEMINI_API_KEY` to `apps\ai-service\.env` and restart terminal 3. |
| Uploading a PPT/PPTX for AI questions fails | Install LibreOffice and check that `LIBREOFFICE_PATH` points to the real `soffice.exe`. Restart terminal 3. |
| Prisma *"Can't reach database server"* | Docker Desktop isn't running, or `DATABASE_URL` is different from step 5.3. Run `docker compose up -d`. |
| `db:seed` says the Dean email/password/name is missing | Fill in all three `SEED_DEAN_*` values in `apps\backend\.env`. |
| *"Port … is already in use"* | Another program uses that port. Close it (or restart the computer) and try again. |
| Login works but pages show network errors | Make sure terminal 2 (backend) is running and `apps\web\.env` points to `http://localhost:4000`. |
| Camera or screen share is not offered | Use Chrome or Edge on `http://localhost:5173`, and allow camera/screen permissions when the browser asks. |
| Emails (activation codes) are not sent | Fill in the `SMTP_*` settings (step 5.3) and restart terminal 2. |
| Errors after `git pull` | Run the commands in [After downloading updates](#after-downloading-updates-git-pull). |

### Reset the database (start over with empty data)

⚠️ This **permanently deletes all local data** (users, exams, results) on
this computer. Stop the three terminals first, then:

```powershell
docker compose down -v
docker compose up -d
npm run db:migrate
npm run db:seed
```

---

## Configuration reference

Each app has a documented `.env.example`. The most important settings:

| Variable | Where | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | backend | PostgreSQL connection |
| `JWT_SECRET` | backend | Session signing key. **Required, 32+ characters.** |
| `INTERNAL_API_KEY` | backend + AI | Shared backend ↔ AI key. **Required, identical in both, 32+ characters.** |
| `SEED_*` | backend | Demo accounts created by `npm run db:seed` |
| `CORS_ORIGINS` | backend | Website addresses allowed to call the API |
| `SMTP_*` | backend | Email for activation and verification codes |
| `STUN_URLS`, `TURN_*` | backend | WebRTC connection servers. TURN is strongly recommended on campus networks. |
| `EVIDENCE_RETENTION_DAYS` | backend | Days evidence clips are kept (default 180) |
| `FACE_SAMPLE_SECONDS`, `AUDIO_SAMPLE_SECONDS` | backend | How often snapshots/audio are analysed (default 10 s) |
| `DB_POOL_SIZE` | backend | Database connections per backend instance (default 30) |
| `REDIS_URL` | backend (optional) + AI | Redis for multi-instance Socket.IO and the Celery queue |
| `TRUST_PROXY` | backend | Set behind a reverse proxy so rate limits see real client IPs |
| `GEMINI_API_KEY`, `LLM_MODEL` | AI | AI question generation, review and essay suggestions |
| `LIBREOFFICE_PATH` | AI | Converting Office files for question generation |
| `FACE_ANALYZER_POOL` | AI | MediaPipe instances per process (scale with `--workers`) |
| `VITE_API_URL`, `VITE_SOCKET_URL` | web | Where the website finds the backend |

## Testing

```powershell
npm test            # backend + web unit tests
npm run typecheck   # TypeScript checks for backend and web
npm run test:ai     # AI service tests (pytest)
```

GitHub Actions (`.github/workflows/ci.yml`) runs these on every push and pull
request.

Load testing: see **[tools/loadtest/README.md](tools/loadtest/README.md)** for
how to simulate hundreds of concurrent students, the measured results, and the
recommended deployment for 300–500 students.

## Security and privacy

- **Sessions:** HTTP-only session cookie; every session is server-side and
  revocable. Logout, password change and account deactivation take effect
  immediately, including on live connections.
- **Access control:** role-based access plus per-faculty permission overrides
  managed by the Dean; append-only audit log.
- **Rate limiting** is keyed per account and per session, so a whole campus
  behind one IP address is not throttled together.
- **Exam integrity is enforced on the server:** wall-clock timer, lock, grace
  window, one live session per student. Unsubmitted attempts are graded from
  their last autosave when time runs out.
- **Data minimisation (RA 10173):** snapshots and live video are never stored;
  evidence clips are deleted after the retention period, and each deletion is
  recorded in the audit log.

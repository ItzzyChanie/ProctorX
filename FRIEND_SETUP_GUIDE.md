# ProctorX: first-time Windows setup

Use this guide on a Windows 10 (version 2004+) or Windows 11, 64-bit laptop. It starts all parts of ProctorX locally: the web site, backend API, AI service, PostgreSQL, and Redis.

## What to install first

Install these once, then restart Windows when an installer asks you to.

| Required software | Recommended version | Why it is needed |
| --- | --- | --- |
| Windows Terminal or PowerShell | Current | Run the commands below. PowerShell is built into Windows. |
| Git | Current | Required only when cloning/pulling the repository. Not needed for a ZIP copy. |
| Node.js | **22 LTS** (or any version >= 20.19) | Runs the web app and NestJS backend; npm is installed with it. |
| Docker Desktop | Current, with WSL 2 backend | Runs PostgreSQL 16 and Redis 7. |
| WSL 2 / Ubuntu | Current | Docker Desktop's recommended Linux backend. |
| Python | **3.11, 64-bit** | Runs the FastAPI/Celery AI service. Check **Add Python to PATH** in its installer. |
| LibreOffice | Current | Required for AI question generation from Office documents (especially PPT/PPTX). |
| VS Code | Current (recommended) | Editor; install its PowerShell and Python extensions if desired. |

Internet access is required for the first `npm ci`, `pip install`, and Docker image download. Docker Desktop should have at least 4 GB of memory available (8 GB+ total laptop RAM is recommended) and roughly 10 GB free disk space.

### Install and verify WSL 2 and Docker

1. Open **PowerShell as Administrator**.
2. Run the following, then restart when Windows tells you to:

   ```powershell
   wsl --install
   ```

3. After restarting, open **Ubuntu** from the Start menu once. Create the Linux username and password it asks for. Close Ubuntu when finished.
4. Install and open Docker Desktop. In Docker Desktop settings, select **Use the WSL 2 based engine**. Under **Resources > WSL Integration**, enable the Ubuntu distribution created above, then click **Apply & Restart**.
5. In a normal PowerShell window, verify:

   ```powershell
   wsl --status
   docker --version
   docker compose version
   node --version
   npm --version
   py -3.11 --version
   git --version
   ```

`git --version` is not required if using a ZIP. Node must report `v20.19.0` or newer and npm must report version 10 or newer.

## Get the project

### Option A: clone with Git

```powershell
git clone <REPOSITORY-URL> ProctorX
Set-Location ProctorX
```

For later updates:

```powershell
git pull
npm ci
```

### Option B: use the ZIP file

1. Extract the ZIP completely (do not run from inside the ZIP).
2. Prefer a short path with no special characters, for example `C:\Projects\ProctorX`.
3. Open PowerShell in the extracted `ProctorX` folder:

   ```powershell
   Set-Location C:\Projects\ProctorX
   ```

Never copy `node_modules`, `.venv`, or `.env` from another laptop. They are machine-specific or contain secrets.

## One-time project setup

Run all commands in this section from the repository root unless the command says otherwise.

### 1. Install JavaScript dependencies

```powershell
npm ci
```

Use `npm ci` because this project includes `package-lock.json`; it installs the exact versions the project expects. Do not install Nest, Vite, Prisma, or Electron globally.

### 2. Create the three environment files

The `.env` files are intentionally excluded from Git and ZIP sharing. Copy each template:

```powershell
Copy-Item apps\backend\.env.example apps\backend\.env
Copy-Item apps\web\.env.example apps\web\.env
Copy-Item apps\ai-service\.env.example apps\ai-service\.env
```

Edit `apps\backend\.env` and use these local-development values (replace the sample names/passwords with safe private values):

```dotenv
DATABASE_URL=postgresql://proctorx:proctorx_dev@localhost:5432/proctorx
JWT_SECRET=replace-this-with-a-long-random-private-string
JWT_EXPIRES_IN=7d
AUTH_COOKIE_MAX_AGE_MS=604800000
AI_SERVICE_URL=http://127.0.0.1:8000
INTERNAL_API_KEY=use-one-long-random-shared-value-here
SEED_DEAN_EMAIL=dean@example.com
SEED_DEAN_PASSWORD=ChooseAStrongPassword123!
SEED_DEAN_FULLNAME=Demo Dean
SEED_TEACHER_EMAIL=teacher@example.com
SEED_TEACHER_PASSWORD=ChooseAStrongPassword123!
SEED_TEACHER_FULLNAME=Demo Teacher
SEED_STUDENT_LOGIN_ID=2023-01234
SEED_STUDENT_EMAIL=student@example.com
SEED_STUDENT_PASSWORD=ChooseAStrongPassword123!
SEED_STUDENT_FULLNAME=Demo Student
```

Edit `apps\ai-service\.env`:

```dotenv
INTERNAL_API_KEY=use-the-exact-same-shared-value-as-backend
AI_SERVICE_HOST=127.0.0.1
AI_SERVICE_PORT=8000
REDIS_URL=redis://localhost:6379/0
LLM_PROVIDER=gemini
GEMINI_API_KEY=paste-a-private-Gemini-API-key-here
LLM_MODEL=gemini-3.5-flash-lite
LIBREOFFICE_PATH=C:\Program Files\LibreOffice\program\soffice.exe
```

Keep the `VITE_API_URL=http://localhost:4000` and `VITE_SOCKET_URL=http://localhost:4000` values already in `apps\web\.env`.

Important:

- The backend and AI `INTERNAL_API_KEY` values **must be identical**.
- `GEMINI_API_KEY` is required only for AI-generated questions. Do not commit or send it through chat.
- SMTP values are required only for email delivery features. Leave their placeholder values until a real SMTP account/app password is available.
- LibreOffice is needed for office-file conversion. If it was installed to a different location, change `LIBREOFFICE_PATH` to the actual `soffice.exe` path.

### 3. Install the Python AI environment

```powershell
Set-Location apps\ai-service
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Set-Location ..\..
```

Do not use Python 3.12+ for this setup unless the project dependencies have been verified with it. If a Python package fails to build, first confirm `py -3.11 --version`; then install the current Microsoft Visual C++ x64 Redistributable and retry.

### 4. Start the database and cache, then create sample data

Make sure Docker Desktop is running (its tray icon should be active), then run:

```powershell
docker compose up -d
docker compose ps
npm run db:migrate
npm run db:seed
```

`docker compose ps` should show `postgres` and `redis` as running. The first Docker run downloads the images. The seed command creates the dean, teacher, and student accounts specified in `apps\backend\.env`.

## Start ProctorX

Open **three separate PowerShell terminals**, each located at the project root.

Terminal 1 — web app:

```powershell
npm run dev:web
```

Terminal 2 — backend API:

```powershell
npm run dev:backend
```

Terminal 3 — AI service and worker:

```powershell
npm run dev:ai
```

Then open `http://localhost:5173` in a browser. The backend listens at `http://localhost:4000`; the AI API documentation is at `http://127.0.0.1:8000/docs`.

The project also has an optional Electron desktop app. Start it only if needed, in a fourth terminal:

```powershell
npm run dev:desktop
```

To stop a development service, focus its terminal and press `Ctrl+C`. To stop database containers while preserving data:

```powershell
docker compose down
```

## Quick health check

Before opening the browser, these commands should succeed:

```powershell
docker compose ps
Test-NetConnection localhost -Port 5432
Test-NetConnection localhost -Port 6379
Test-NetConnection localhost -Port 4000
Test-NetConnection localhost -Port 8000
Test-NetConnection localhost -Port 5173
```

Run the last three only after their corresponding development terminals are running. In the browser, log in with the dean email/password you placed in `apps\backend\.env`.

## Common first-time problems

| Symptom | Fix |
| --- | --- |
| `docker` is not recognized or Docker cannot connect | Start Docker Desktop; ensure its WSL 2 engine is enabled, then rerun `docker compose up -d`. |
| WSL installation says virtualization is disabled | Enable CPU virtualization in BIOS/UEFI, then rerun `wsl --install` as Administrator. |
| Port 5432, 6379, 4000, 5173, or 8000 is already in use | Close the other program/container using that port, or ask the project owner before changing the port and related `.env` values. |
| Prisma cannot connect to the database | Confirm Docker is running, use the exact local `DATABASE_URL` above, then run `docker compose up -d` and `npm run db:migrate` again. |
| AI requests return unauthorized | Make `INTERNAL_API_KEY` identical in `apps\backend\.env` and `apps\ai-service\.env`, then restart both services. |
| AI question generation says Gemini is not configured | Put a valid private `GEMINI_API_KEY` in `apps\ai-service\.env`, then restart the AI terminal. |
| Office-document conversion fails | Install LibreOffice and correct `LIBREOFFICE_PATH`; restart the AI service. |
| `py -3.11` is not found | Install 64-bit Python 3.11, select **Add Python to PATH**, reopen PowerShell, and retry. |
| Packages fail after pulling updates | Stop the dev servers, run `npm ci`, then rerun the Python `pip install -r requirements.txt` command if `requirements.txt` changed. |

### Reset local database data (only when intentionally starting over)

This erases that laptop's Docker PostgreSQL data. Stop services first, then run:

```powershell
docker compose down -v
docker compose up -d
npm run db:migrate
npm run db:seed
```


# ProctorX Deployment Guide (Beginner-Friendly)

This guide takes ProctorX from "running on my laptop" to "anyone can open it on the internet and log in". It assumes you have **never deployed anything before**. Every new term is explained the first time it shows up.

> **Prices and free-tier limits change.** Everything below was accurate when this guide was written. Check each provider's website before you sign up.

---

## Table of Contents

0. [Words you need to know](#0-words-you-need-to-know)
1. [The big picture](#1-the-big-picture)
2. [What you need before starting](#2-what-you-need-before-starting)
3. [Step 1: Buy a domain name](#step-1-buy-a-domain-name)
4. [Step 2: Set up the database on Supabase](#step-2-set-up-the-database-on-supabase)
5. [Step 3: Create the Oracle Cloud server](#step-3-create-the-oracle-cloud-server)
6. [Step 4: Connect to your server and install Docker](#step-4-connect-to-your-server-and-install-docker)
7. [Step 5: Put the ProctorX code on the server](#step-5-put-the-proctorx-code-on-the-server)
8. [Step 6: Create the Docker files](#step-6-create-the-docker-files)
9. [Step 7: Create the production .env files](#step-7-create-the-production-env-files)
10. [Step 8: Point your domain to the server](#step-8-point-your-domain-to-the-server)
11. [Step 9: Start everything](#step-9-start-everything)
12. [Step 10: Deploy the frontend on Vercel](#step-10-deploy-the-frontend-on-vercel)
13. [Step 11: Test everything](#step-11-test-everything)
14. [Updating the app after you change code](#updating-the-app-after-you-change-code)
15. [Checklist before the thesis defense](#checklist-before-the-thesis-defense)
16. [Troubleshooting](#troubleshooting)

---

## 0. Words you need to know

| Term | What it means |
|---|---|
| **Deploy** | Putting your app on a computer on the internet so other people can use it. |
| **Server / VM** | A computer in a data center that runs 24/7. A **VM** (Virtual Machine) is a "rented slice" of a big computer. It works like a normal Linux computer that you control remotely. |
| **Frontend** | The part users see in the browser (`apps/web`, the React app). |
| **Backend** | The server program that handles logins, exams, and data (`apps/backend`, NestJS). |
| **AI service** | The Python program that does face/audio analysis and question generation (`apps/ai-service`). |
| **Database** | Where data (users, exams, answers) is stored. Yours is **PostgreSQL**. |
| **Prisma** | The tool your backend uses to talk to the database and to create the tables (**migrations**). |
| **Migration** | A saved step that creates or changes database tables. Your project has these in `apps/backend/prisma/migrations`. |
| **Docker** | A tool that packages a program with everything it needs (Node, Python, libraries) into a **container**, so it runs the same everywhere. |
| **Image** | The "recipe result" Docker builds from a **Dockerfile**. A **container** is a running copy of an image. |
| **Docker Compose** | Runs several containers together from one file (`docker-compose.yml`). You already use it locally for Postgres and Redis. |
| **Redis** | A small, very fast in-memory database. ProctorX uses it for background jobs (Celery) and live sockets. |
| **Celery / worker** | A Python background-job runner. The AI service uses it to build reports without making the user wait. |
| **Domain** | A website name like `proctorx.xyz`. You rent it yearly. |
| **Subdomain** | A name in front of your domain, like `api.proctorx.xyz` or `app.proctorx.xyz`. Free once you own the domain. |
| **DNS** | The internet's "phone book". It maps a name (`api.proctorx.xyz`) to an **IP address** (like `129.150.10.20`). |
| **DNS record** | One entry in that phone book. **A record** = name → IP address. **CNAME** = name → another name. |
| **IP address** | The numeric address of a computer on the internet. |
| **HTTPS / SSL certificate** | The padlock in the browser. Required for cameras, microphones, and secure cookies to work. |
| **Reverse proxy** | A program that sits in front of your backend, receives traffic from the internet on HTTPS, and passes it to your app. We'll use **Caddy**, which also gets HTTPS certificates automatically. |
| **Port** | A numbered "door" on a computer. Web = 80 (HTTP) and 443 (HTTPS). Your backend uses 4000 and the AI service uses 8000 (internal only). |
| **Firewall** | Rules that block or allow traffic to ports. |
| **SSH** | A secure way to open a terminal on a remote server from your laptop. |
| **SSH key** | A pair of files that work like a password: the **private key** stays with you (never share it), and the **public key** goes on the server. |
| **Environment variables / `.env`** | Settings and secrets (passwords, API keys) that your app reads when it starts. Never commit real ones to GitHub. |
| **CORS** | A browser security rule. The backend must list which websites are allowed to call it. |
| **Cookie** | Small data the browser stores. ProctorX keeps you logged in using a cookie. |
| **Connection pooler** | A middleman that shares database connections efficiently. Supabase gives you one. |
| **Terminal** | The command-line window. On Windows use **PowerShell** or VS Code's terminal. On the server it's **bash** (Linux). |

---

## 1. The big picture

```
                 Users' browsers
                       │
        ┌──────────────┴──────────────┐
        ▼                             ▼
 app.yourdomain.com           api.yourdomain.com
 ┌───────────────┐            ┌────────────────────────────────────────┐
 │    VERCEL     │            │  ORACLE CLOUD VM (Ubuntu + Docker)     │
 │ React frontend│            │                                        │
 │  (apps/web)   │            │  Caddy (HTTPS) ──► Backend (NestJS)     │
 └───────────────┘            │                       │      │         │
                              │                       ▼      ▼         │
                              │               AI service   Redis       │
                              │               + Celery worker          │
                              │   storage/ folder (avatars, recordings)│
                              └───────────────────────┬────────────────┘
                                                      │
                                                      ▼
                                         ┌────────────────────────┐
                                         │  SUPABASE (PostgreSQL)  │
                                         └────────────────────────┘
```

| Part | Where | Cost |
|---|---|---|
| Frontend (`apps/web`) | Vercel | Free (Hobby plan) |
| Backend, AI service, Celery worker, Redis, Caddy | Oracle Cloud "Always Free" VM | Free |
| Database | Supabase | Free plan |
| Uploaded files (avatars, recordings, evidence) | A Docker volume on the Oracle VM | Free |
| Domain name | Any domain registrar | About $1–$15 per year |

### Why you need your own domain (important!)

ProctorX keeps users logged in with a **cookie** set to `sameSite: 'lax'` (see `apps/backend/src/auth/auth.controller.ts`). Browsers only send that cookie when the frontend and backend are on the **same site**:

- ✅ `app.proctorx.xyz` (frontend) + `api.proctorx.xyz` (backend) = same site → **login works**
- ❌ `proctorx.vercel.app` (frontend) + some other address (backend) = different sites → **login silently fails**, especially on iPhone/Safari

So: **buy one cheap domain and use two subdomains.** It's the easiest and most reliable fix. You also need a name for the HTTPS certificate on the backend anyway.

> 💡 **Student tip:** The **GitHub Student Developer Pack** (education.github.com/pack) has included a free domain for a year (e.g., `.me` via Namecheap or `.tech`). Check whether it still does.

---

## 2. What you need before starting

- [ ] A **GitHub** account with the ProctorX repository pushed (you already have this).
- [ ] A **credit or debit card** in your name. Oracle uses it only to verify your identity. Prepaid and virtual cards are often rejected.
- [ ] Your laptop with ProctorX running locally (Docker Desktop, Node, Python).
- [ ] About **one afternoon** for the first setup.
- [ ] Accounts (create them as you go):
  - Oracle Cloud: https://www.oracle.com/cloud/free/
  - Supabase: https://supabase.com
  - Vercel: https://vercel.com (sign up with GitHub)
  - A domain registrar, e.g. Porkbun, Namecheap, or Cloudflare Registrar

> 💡 **Do the Oracle sign-up early** (days or weeks before your defense). It sometimes takes a while to be approved, and the free ARM servers are sometimes "out of capacity" and you need to retry.

---

## Step 1: Buy a domain name

1. Go to a registrar (e.g., porkbun.com or namecheap.com).
2. Search for a name, like `proctorx-thesis.xyz`. Cheap endings: `.xyz`, `.site`, `.online`, `.me`.
3. Buy it (1 year is enough). **Turn off auto-renew** if you only need it for the defense.
4. Find the **DNS settings** page for your domain in the registrar's dashboard. You'll come back to it in Step 8 and Step 10.

From here on, this guide uses **`proctorx.xyz`** as the example. **Replace it with your real domain everywhere.**

- Frontend will be: `https://app.proctorx.xyz`
- Backend will be: `https://api.proctorx.xyz`

---

## Step 2: Set up the database on Supabase

### 2.1 Create the project

1. Log in to https://supabase.com → **New project**.
2. **Name:** `proctorx`.
3. **Database password:** click **Generate a password** and **save it somewhere safe** (e.g., a password manager). You need it later.
   - Avoid special characters like `@ : / ? #` in the password, because they break database URLs. If the generated one has them, regenerate or use only letters and numbers.
4. **Region:** pick the one **closest to your users** (and ideally close to the Oracle region you'll choose in Step 3).
5. Click **Create new project** and wait 1–2 minutes.

### 2.2 Get the connection strings

1. In your project, click the **Connect** button at the top.
2. Choose the **ORMs** tab → **Prisma** (or look under "Connection string").
3. You'll see two URLs. Copy both into a notepad:
   - **Transaction pooler** (port **6543**): this goes in `DATABASE_URL` (used by the running app).
   - **Session pooler** (port **5432**): this goes in `DIRECT_URL` (used by Prisma migrations).
4. Replace `[YOUR-PASSWORD]` in both with the password from 2.1.

They look like this (yours will differ):

```
DATABASE_URL="postgresql://postgres.abcdefghijk:YOURPASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.abcdefghijk:YOURPASSWORD@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"
```

> ⚠️ Make sure `DATABASE_URL` ends with `?pgbouncer=true`. Prisma needs it when using the transaction pooler.

### 2.3 Tell Prisma about the second URL (one-time code change)

Open `apps/backend/prisma/schema.prisma` and change the `datasource` block:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

Then add `DIRECT_URL` to your **local** `apps/backend/.env` too, so local development keeps working. For local, it's the same as your current `DATABASE_URL`:

```env
DATABASE_URL="postgresql://proctorx:proctorx_dev@localhost:5432/proctorx?schema=public"
DIRECT_URL="postgresql://proctorx:proctorx_dev@localhost:5432/proctorx?schema=public"
```

Commit and push this change:

```powershell
git add apps/backend/prisma/schema.prisma
git commit -m "chore(prisma): add directUrl for hosted database"
git push
```

### 2.4 Create the tables in Supabase

Run these **on your laptop** (in VS Code's terminal, from the project folder). This temporarily points Prisma at Supabase **without editing your `.env`**:

```powershell
cd apps/backend

# Paste YOUR two Supabase URLs here (keep the quotes)
$env:DATABASE_URL = "postgresql://postgres.abcdefghijk:YOURPASSWORD@...:6543/postgres?pgbouncer=true"
$env:DIRECT_URL   = "postgresql://postgres.abcdefghijk:YOURPASSWORD@...:5432/postgres"

# Check what will be applied
npx prisma migrate status

# Create all tables in Supabase
npx prisma migrate deploy
```

You should see `All migrations have been successfully applied.`

> These `$env:` variables only last until you close that terminal window. **Close the terminal afterward** so you don't accidentally run commands against Supabase later.

### 2.5 Put data in the database: choose ONE option

**Option A: Start fresh with the demo accounts (simplest).** In the same terminal as 2.4 (so it still points to Supabase):

```powershell
npx prisma db seed
```

This creates the dean, teacher, and student accounts from the `SEED_*` values in your `.env`.

**Option B: Copy all your local data to Supabase.** Use this if you want your existing users, subjects, questions, etc.

1. Start your local database: in the project root, run `docker compose up -d`.
2. Export your local data (run in the **project root**):

   ```powershell
   docker exec proctorx-postgres-1 pg_dump -U proctorx -d proctorx --data-only --no-owner --no-privileges --schema=public --exclude-table=_prisma_migrations -f /tmp/data.sql
   docker cp proctorx-postgres-1:/tmp/data.sql ./data.sql
   ```

   - `pg_dump` = PostgreSQL's export tool. `--data-only` = only rows, not table definitions (Supabase already has the tables from 2.4).
   - `--exclude-table=_prisma_migrations` = skip Prisma's history table, since Supabase already has it.

3. Import into Supabase (use the **Session pooler** URL, port 5432):

   ```powershell
   docker cp ./data.sql proctorx-postgres-1:/tmp/data.sql
   docker exec proctorx-postgres-1 psql "postgresql://postgres.abcdefghijk:YOURPASSWORD@...:5432/postgres" -v ON_ERROR_STOP=1 -c "SET session_replication_role = replica;" -f /tmp/data.sql
   ```

   - `session_replication_role = replica` temporarily turns off foreign-key checks, so the import order doesn't matter.

4. **Delete `data.sql` afterward.** It contains your users' data. Don't commit it.

   ```powershell
   Remove-Item ./data.sql
   ```

5. Check in Supabase: **Table Editor** (left sidebar) → open the `users` table. Your users should be there.

> ⚠️ **Uploaded files are not in the database.** Avatars and recordings are files in `apps/backend/storage/`. If you need them on the server, copy that folder in Step 9.4.

---

## Step 3: Create the Oracle Cloud server

### 3.1 Sign up

1. Go to https://www.oracle.com/cloud/free/ → **Start for free**.
2. Fill in your details and verify your card. Oracle may place a small temporary hold.
3. **Home Region:** pick one close to you and your users. ⚠️ **You cannot change this later**, and Always Free servers can only be created in your home region.
4. Wait for the account to finish setting up (can take minutes to hours). You'll get an email.

> 💡 **Recommended:** After the account is active, go to **Billing → Upgrade and Manage Payment** and upgrade to **Pay As You Go**. You will still pay **$0** as long as you stay within Always Free limits. This prevents Oracle from reclaiming your server if it looks "idle" for 7 days. If you'd rather not, just make sure you log in and use the app regularly.

### 3.2 Create an SSH key on your laptop

Open **PowerShell** on your laptop:

```powershell
ssh-keygen -t ed25519 -f "$HOME\.ssh\proctorx_oracle"
```

- Press **Enter** when asked for a passphrase (or type one if you want extra security).
- This creates two files in `C:\Users\<you>\.ssh\`:
  - `proctorx_oracle`: your **private key**. **Never share or upload this.**
  - `proctorx_oracle.pub`: your **public key**. You'll paste this into Oracle.

Show the public key so you can copy it:

```powershell
Get-Content "$HOME\.ssh\proctorx_oracle.pub"
```

### 3.3 Create the VM (called an "instance" in Oracle)

1. In the Oracle Console, open the menu (☰) → **Compute** → **Instances** → **Create instance**.
2. **Name:** `proctorx-server`.
3. **Image and shape** → **Edit**:
   - **Image:** click **Change image** → **Canonical Ubuntu** → **24.04** (or 22.04). Not "Minimal".
   - **Shape:** click **Change shape** → **Ampere** → **VM.Standard.A1.Flex**.
     - **OCPUs:** `4` and **Memory:** `24` GB (the Always Free maximum).
     - If you get an **"Out of capacity"** error at the end, try `2` OCPUs / `12` GB, or try again later or another day.
   - Look for the **"Always Free-eligible"** label.
4. **Networking:** keep the defaults (it creates a network for you). Make sure **"Assign a public IPv4 address"** is **Yes**.
5. **Add SSH keys:** choose **Paste public keys** and paste the contents of `proctorx_oracle.pub`.
6. **Boot volume:** default (about 47 GB) is fine. You can set up to 200 GB total for free.
7. Click **Create**. Wait until the status is **Running** (green).
8. On the instance page, copy the **Public IP address** (e.g., `129.150.10.20`). We'll call it **`YOUR_SERVER_IP`**.

### 3.4 Open ports 80 and 443 in Oracle's firewall

Oracle blocks web traffic by default. You need to allow it.

1. On the instance page, under **Primary VNIC**, click the **Subnet** link.
2. Click **Security Lists** → **Default Security List for ...**.
3. Click **Add Ingress Rules** and add **two** rules:

| Source CIDR | IP Protocol | Destination Port Range | Description |
|---|---|---|---|
| `0.0.0.0/0` | TCP | `80` | HTTP |
| `0.0.0.0/0` | TCP | `443` | HTTPS |

(`0.0.0.0/0` means "from anywhere on the internet". Port 22 for SSH is already open by default.)

> Do **NOT** open ports 4000, 8000, 5432, or 6379. Those stay private inside the server.

---

## Step 4: Connect to your server and install Docker

### 4.1 Connect with SSH

From PowerShell on your laptop:

```powershell
ssh -i "$HOME\.ssh\proctorx_oracle" ubuntu@YOUR_SERVER_IP
```

- First time: it asks `Are you sure you want to continue connecting?` → type `yes`.
- Your prompt changes to something like `ubuntu@proctorx-server:~$`. **You are now typing commands on the server**, not your laptop.
- To disconnect at any time: type `exit`.

> **All commands from here until Step 10 run on the server** (inside SSH), unless stated otherwise.

### 4.2 Update the system

```bash
sudo apt update && sudo apt upgrade -y
```

- `sudo` = run as administrator. `apt` = Ubuntu's app installer.
- If a pink/purple screen asks about restarting services, press **Enter**.

### 4.3 Open ports 80 and 443 in Ubuntu's own firewall

Oracle's Ubuntu images have a **second** firewall inside the server. Allow web traffic there too:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

(The last line makes the rules survive a reboot.)

### 4.4 Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
```

- The first line downloads and runs Docker's official installer.
- The second lets the `ubuntu` user run Docker without `sudo`.

**Log out and back in** for that to take effect:

```bash
exit
```

```powershell
ssh -i "$HOME\.ssh\proctorx_oracle" ubuntu@YOUR_SERVER_IP
```

Check it works:

```bash
docker --version
docker compose version
docker run --rm hello-world
```

You should see "Hello from Docker!".

### 4.5 (Recommended) Add swap memory

Swap is disk space used as backup memory, so the server doesn't crash if RAM fills up during builds:

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## Step 5: Put the ProctorX code on the server

### If your GitHub repository is **public**

```bash
cd ~
git clone https://github.com/ItzzyChanie/ProctorX.git
cd ProctorX
```

### If your GitHub repository is **private**

You need a **Personal Access Token** (a special password for Git):

1. On GitHub: profile picture → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
2. **Repository access:** Only select repositories → `ProctorX`.
3. **Permissions:** Repository permissions → **Contents: Read-only**.
4. Generate and copy the token (starts with `github_pat_...`).

Then on the server:

```bash
cd ~
git clone https://github.com/ItzzyChanie/ProctorX.git
# Username: your GitHub username
# Password: paste the token (nothing shows while pasting; that's normal)
cd ProctorX
```

---

## Step 6: Create the Docker files

These files tell Docker how to build and run each part. **Recommended:** create them **on your laptop** inside the project, commit and push them to GitHub, then run `git pull` on the server. That way they're saved in your repo.

### 6.1 Backend Dockerfile: `apps/backend/Dockerfile`

```dockerfile
# ---- Build stage: install everything and compile TypeScript ----
FROM node:22-bookworm-slim AS build
WORKDIR /repo

# Tools needed to compile native packages (e.g. bcrypt) if no prebuilt version exists
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ openssl \
    && rm -rf /var/lib/apt/lists/*

# Copy package files first (faster rebuilds)
COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/config/package.json packages/config/
RUN npm ci --workspace=backend --include-workspace-root

# Copy the source code and build
COPY packages ./packages
COPY apps/backend ./apps/backend
WORKDIR /repo/apps/backend
RUN npx prisma generate && npm run build

# ---- Run stage ----
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo /repo
WORKDIR /repo/apps/backend
EXPOSE 4000
# Apply any new database migrations, then start the server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
```

> If `packages/config` doesn't have a `package.json`, remove that `COPY packages/config/...` line.

### 6.2 AI service Dockerfile: `apps/ai-service/Dockerfile`

```dockerfile
FROM python:3.11-slim

# System libraries needed by OpenCV, MediaPipe, audio, and LibreOffice (document conversion)
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential libgl1 libglib2.0-0 libsndfile1 ffmpeg \
        libreoffice-writer libreoffice-impress \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

ENV LIBREOFFICE_PATH=/usr/bin/soffice
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 6.3 Production Compose file: `docker-compose.prod.yml` (project root)

This is **separate** from your local `docker-compose.yml`. It runs the whole backend side on the server.

```yaml
services:
  redis:
    image: redis:7-alpine
    restart: always

  ai:
    build: ./apps/ai-service
    restart: always
    env_file: ./apps/ai-service/.env
    environment:
      REDIS_URL: redis://redis:6379/0
    depends_on: [redis]

  worker:
    build: ./apps/ai-service
    restart: always
    env_file: ./apps/ai-service/.env
    environment:
      REDIS_URL: redis://redis:6379/0
    command: >
      celery -A app.core.celery_app:celery_app worker --loglevel=info
      --concurrency=2 --queues=proctorx_v2 --hostname=proctorx-v2@%h
    depends_on: [redis]

  backend:
    build:
      context: .
      dockerfile: apps/backend/Dockerfile
    restart: always
    env_file: ./apps/backend/.env
    environment:
      AI_SERVICE_URL: http://ai:8000
      REDIS_URL: redis://redis:6379
      TRUST_PROXY: "1"
      NODE_ENV: production
    volumes:
      - backend_storage:/repo/apps/backend/storage
    depends_on: [redis, ai]

  caddy:
    image: caddy:2
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on: [backend]

volumes:
  backend_storage:   # avatars, recordings, evidence files (survives rebuilds)
  caddy_data:        # HTTPS certificates
  caddy_config:
```

What each part means:
- `restart: always` = automatically restart if it crashes or the server reboots.
- `env_file` = load settings from that `.env` file.
- `environment` = extra settings that override the `.env`. Inside Docker, services reach each other by name (`http://ai:8000`, `redis://redis:6379`), not `localhost`.
- `volumes` = folders that **survive** when containers are rebuilt. `backend_storage` keeps uploaded files safe.
- Only **Caddy** exposes ports (80 and 443) to the internet. Everything else is private.

### 6.4 Caddy config: `Caddyfile` (project root, no file extension)

```
api.proctorx.xyz {
    reverse_proxy backend:4000
}
```

That's it. Caddy will automatically:
- get a free HTTPS certificate from Let's Encrypt,
- redirect HTTP → HTTPS,
- pass normal requests **and** live WebSocket (Socket.IO) connections to the backend.

### 6.5 Make sure `.env` files are never committed

Check that your `.gitignore` contains `.env` (it should already). Then commit the new files **on your laptop**:

```powershell
git add apps/backend/Dockerfile apps/ai-service/Dockerfile docker-compose.prod.yml Caddyfile
git commit -m "chore: add production Docker setup"
git push
```

And pull them **on the server**:

```bash
cd ~/ProctorX
git pull
```

---

## Step 7: Create the production .env files

`.env` files hold secrets, so they are **created directly on the server**, never committed.

### 7.1 Generate strong secrets

On the server, run this **twice** and save both outputs (one for `JWT_SECRET`, one for `INTERNAL_API_KEY`):

```bash
openssl rand -hex 32
```

### 7.2 Backend: `apps/backend/.env`

```bash
nano ~/ProctorX/apps/backend/.env
```

`nano` is a simple text editor in the terminal. Paste this in (right-click pastes in most terminals), and **fill in your real values**:

```env
# --- Database (Supabase, from Step 2.2) ---
DATABASE_URL="postgresql://postgres.abcdefghijk:YOURPASSWORD@...:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.abcdefghijk:YOURPASSWORD@...:5432/postgres"
# Keep this small: Supabase's free plan has a limited number of connections
DB_POOL_SIZE=10
DB_POOL_TIMEOUT=20

# --- Auth ---
JWT_SECRET=<first value from openssl rand -hex 32>
JWT_EXPIRES_IN=7d
AUTH_COOKIE_MAX_AGE_MS=604800000

# --- Must be IDENTICAL in apps/ai-service/.env ---
INTERNAL_API_KEY=<second value from openssl rand -hex 32>

# --- The frontend address (your Vercel domain) ---
CORS_ORIGINS=https://app.proctorx.xyz

# --- Email (copy from your local .env) ---
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<your smtp user>
SMTP_PASS=<your app password>
SMTP_FROM="ProctorX <your-email@example.com>"

UNIVERSITY_SEARCH_API_URL=http://universities.hipolabs.com/search

# --- Live monitoring (WebRTC) ---
STUN_URLS=stun:stun.l.google.com:19302
TURN_URLS=
TURN_SECRET=
TURN_TTL_SECONDS=21600
TURN_USERNAME=
TURN_CREDENTIAL=

EVIDENCE_RETENTION_DAYS=180
FACE_SAMPLE_SECONDS=10
AUDIO_SAMPLE_SECONDS=10

# --- Seed accounts (only used if you run the seed) ---
SEED_DEAN_EMAIL=...
SEED_DEAN_PASSWORD=...
SEED_DEAN_FULLNAME=...
SEED_TEACHER_EMAIL=...
SEED_TEACHER_PASSWORD=...
SEED_TEACHER_FULLNAME=...
SEED_STUDENT_LOGIN_ID=...
SEED_STUDENT_EMAIL=...
SEED_STUDENT_PASSWORD=...
SEED_STUDENT_FULLNAME=...
```

Save and exit nano: press **Ctrl + O**, **Enter** (save), then **Ctrl + X** (exit).

> `AI_SERVICE_URL`, `REDIS_URL`, `TRUST_PROXY` and `NODE_ENV` are set in `docker-compose.prod.yml`, so you don't need them here.

### 7.3 AI service: `apps/ai-service/.env`

```bash
nano ~/ProctorX/apps/ai-service/.env
```

```env
INTERNAL_API_KEY=<SAME value as the backend's INTERNAL_API_KEY>

LLM_PROVIDER=gemini
GEMINI_API_KEY=<your Gemini API key>
LLM_MODEL=<same model as your local .env>
LLM_BASE_URL=
LLM_API_KEY=

MAX_DOCUMENT_SIZE_MB=20
MAX_DOCUMENT_FILES=20
MAX_DOCUMENT_TOTAL_SIZE_MB=100
MAX_COMBINED_DOCUMENT_CHARACTERS=500000
MAX_GENERATED_QUESTIONS=50

QUESTION_GENERATION_TIMEOUT_SECONDS=120
LIBREOFFICE_PATH=/usr/bin/soffice
LIBREOFFICE_CONVERSION_TIMEOUT_SECONDS=60

FACE_ANALYZER_POOL=1
```

Save and exit (**Ctrl + O**, **Enter**, **Ctrl + X**).

Lock both files so only you can read them:

```bash
chmod 600 ~/ProctorX/apps/backend/.env ~/ProctorX/apps/ai-service/.env
```

---

## Step 8: Point your domain to the server

Go back to your **domain registrar's DNS settings** (from Step 1) and add:

| Type | Name / Host | Value / Points to | TTL |
|---|---|---|---|
| **A** | `api` | `YOUR_SERVER_IP` | Auto / 300 |

This means: "`api.proctorx.xyz` lives at your Oracle server."

Wait a few minutes (sometimes up to an hour). Check it **on your laptop**:

```powershell
nslookup api.proctorx.xyz
```

When the answer shows `YOUR_SERVER_IP`, continue.

> ⚠️ Do this **before** Step 9. Caddy needs the domain to point at the server to get the HTTPS certificate.

---

## Step 9: Start everything

On the server:

### 9.1 Build and start

```bash
cd ~/ProctorX
docker compose -f docker-compose.prod.yml up -d --build
```

- `-f docker-compose.prod.yml` = use the production file.
- `up -d` = start in the background.
- `--build` = build the images from your Dockerfiles.

⏳ **The first build can take 10–30 minutes**, mainly the AI service (OpenCV, MediaPipe, LibreOffice). Later builds are faster.

### 9.2 Check that everything is running

```bash
docker compose -f docker-compose.prod.yml ps
```

All services should say `Up` or `running`. If one says `Restarting` or `Exited`, check its logs:

```bash
docker compose -f docker-compose.prod.yml logs backend --tail=100
docker compose -f docker-compose.prod.yml logs ai --tail=100
docker compose -f docker-compose.prod.yml logs worker --tail=100
docker compose -f docker-compose.prod.yml logs caddy --tail=100
```

(Add `-f` at the end to watch logs live. Press **Ctrl + C** to stop watching.)

### 9.3 Test the backend from your laptop

Open in your browser: **https://api.proctorx.xyz**

- You should see a padlock 🔒 (HTTPS works) and some response from the backend (even a "Not Found" JSON message is fine; it means the backend answered).

### 9.4 (Optional) Copy existing uploaded files to the server

If you chose Option B in Step 2.5 and want old avatars and recordings too, run this **on your laptop** in the project root:

```powershell
scp -i "$HOME\.ssh\proctorx_oracle" -r apps/backend/storage ubuntu@YOUR_SERVER_IP:/home/ubuntu/storage-upload
```

Then **on the server**:

```bash
cd ~/ProctorX
docker compose -f docker-compose.prod.yml cp ~/storage-upload/. backend:/repo/apps/backend/storage/
rm -rf ~/storage-upload
```

---

## Step 10: Deploy the frontend on Vercel

Now back on your **laptop and browser**.

### 10.1 Add a routing file (one-time code change)

ProctorX uses React Router. Without this file, refreshing a page like `/dashboard` on Vercel shows a 404.

Create `apps/web/vercel.json`:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

Commit and push:

```powershell
git add apps/web/vercel.json
git commit -m "chore(web): add Vercel SPA rewrite"
git push
```

### 10.2 Import the project

1. Go to https://vercel.com → **Add New…** → **Project**.
2. **Import** your `ProctorX` GitHub repository. (If you don't see it, click **Adjust GitHub App Permissions** and give Vercel access.)
3. Configure:
   - **Framework Preset:** `Vite`
   - **Root Directory:** click **Edit** → choose `apps/web`
   - **Build Command:** leave the default (`npm run build`)
   - **Output Directory:** leave the default (`dist`)
4. **Environment Variables:** add these two:

| Name | Value |
|---|---|
| `VITE_API_URL` | `https://api.proctorx.xyz` |
| `VITE_SOCKET_URL` | `https://api.proctorx.xyz` |

5. Click **Deploy**. Wait 1–3 minutes.

> ⚠️ `VITE_` variables are baked in **when the site is built**. If you ever change them, go to **Deployments** → ⋯ → **Redeploy**.

### 10.3 Connect your domain

1. In your Vercel project → **Settings** → **Domains** → **Add** → type `app.proctorx.xyz`.
2. Vercel shows a DNS record to add, usually:

| Type | Name / Host | Value |
|---|---|---|
| **CNAME** | `app` | `cname.vercel-dns.com` (use exactly what Vercel shows you) |

3. Add it at your registrar's DNS settings.
4. Wait until Vercel shows a ✅ **Valid Configuration**. HTTPS is set up automatically.

---

## Step 11: Test everything

Open **https://app.proctorx.xyz** and check:

- [ ] The page loads with a padlock 🔒.
- [ ] You can **log in** as dean, teacher, and student.
- [ ] Refreshing the page **keeps you logged in**.
- [ ] Refreshing on a deeper page (e.g. a dashboard) doesn't show 404.
- [ ] Uploading an **avatar** works and it still shows after refresh.
- [ ] A student can **start an exam**, and the **camera/microphone** permission prompt appears.
- [ ] The teacher sees **live monitoring** (Socket.IO working).
- [ ] **AI question generation** from a document works.
- [ ] **Reports** generate (Celery worker working).
- [ ] Emails send (registration/verification).
- [ ] Test from a **phone on mobile data** (not your Wi-Fi) to be sure it's truly online.

If something fails, see [Troubleshooting](#troubleshooting).

---

## Updating the app after you change code

1. **On your laptop:** make changes, then commit and push to GitHub.
2. **Frontend:** Vercel **automatically redeploys** when you push to `main`. Nothing to do.
3. **Backend / AI service:** on the server:

   ```bash
   ssh -i "$HOME\.ssh\proctorx_oracle" ubuntu@YOUR_SERVER_IP   # (from your laptop)
   cd ~/ProctorX
   git pull
   docker compose -f docker-compose.prod.yml up -d --build
   ```

   New Prisma migrations are applied automatically when the backend starts (the `prisma migrate deploy` in the Dockerfile).

4. Free up disk space from old images occasionally:

   ```bash
   docker image prune -f
   ```

### Useful server commands

| What | Command |
|---|---|
| See running services | `docker compose -f docker-compose.prod.yml ps` |
| View logs of one service | `docker compose -f docker-compose.prod.yml logs backend --tail=100 -f` |
| Restart one service | `docker compose -f docker-compose.prod.yml restart backend` |
| Stop everything | `docker compose -f docker-compose.prod.yml stop` |
| Start everything again | `docker compose -f docker-compose.prod.yml up -d` |
| Check memory usage | `free -h` |
| Check disk space | `df -h` |
| Check live CPU/RAM per container | `docker stats` (Ctrl + C to exit) |

---

## Checklist before the thesis defense

**One week before**
- [ ] Everything in [Step 11](#step-11-test-everything) passes.
- [ ] Test on the **actual network** you'll use during the defense (school Wi-Fi often blocks things; see the TURN note in Troubleshooting).
- [ ] Test on the browsers your panel/students will use (Chrome, Edge, Safari/iPhone).
- [ ] Make a database backup (on your laptop, uses Docker's Postgres tools):

  ```powershell
  docker run --rm -v "${PWD}:/backup" postgres:17 pg_dump "YOUR_SUPABASE_SESSION_POOLER_URL" -Fc -f /backup/proctorx-backup.dump
  ```

  Keep `proctorx-backup.dump` somewhere safe and **don't commit it**.

**The day before**
- [ ] Log in to **Supabase**. Free projects **pause after about 1 week of no activity**. If it says "Paused", click **Restore**.
- [ ] Log in to the app once to make sure everything is awake.
- [ ] Check server health: `docker compose -f docker-compose.prod.yml ps`, `free -h`, `df -h`.

**Have a backup plan**
- [ ] Keep the **local setup working** on your laptop (`docker compose up -d`, then run the backend, web, and AI service locally). If the internet fails during the defense, you can still demo locally.

---

## Troubleshooting

### "Login works, but I'm logged out immediately / after refresh"
- The frontend and backend must be on the **same domain** (`app.proctorx.xyz` + `api.proctorx.xyz`). Don't use the `*.vercel.app` address to log in.
- `CORS_ORIGINS` in the backend `.env` must exactly match the frontend address: `https://app.proctorx.xyz` (no trailing `/`).
- After editing the backend `.env`: `docker compose -f docker-compose.prod.yml up -d backend`.

### "CORS error" in the browser console (F12 → Console)
- Same fix as above: check `CORS_ORIGINS`.

### `https://api.proctorx.xyz` doesn't load at all
1. Check DNS points to the server: `nslookup api.proctorx.xyz` (on your laptop).
2. Check Oracle's Security List has ports **80 and 443** (Step 3.4).
3. Check Ubuntu's firewall rules were added (Step 4.3).
4. Check Caddy's logs: `docker compose -f docker-compose.prod.yml logs caddy --tail=100`.

### Backend keeps restarting
```bash
docker compose -f docker-compose.prod.yml logs backend --tail=100
```
- `Invalid configuration: JWT_SECRET must be set...` → your `.env` is missing a secret, or it's under 32 characters.
- `Can't reach database server` → check `DATABASE_URL`/`DIRECT_URL`, the password, and that the Supabase project isn't **paused**.
- `too many connections` / `max clients reached` → lower `DB_POOL_SIZE` (e.g., `5`).

### AI service build fails on `mediapipe`
The server uses an **ARM** processor. If pip says no matching version for `mediapipe==0.10.21`, try loosening the version in `apps/ai-service/requirements.txt` to `mediapipe>=0.10.14` (test locally first), then rebuild.

### Camera or microphone doesn't work
- Browsers only allow camera/mic on **HTTPS** sites. Make sure you're on `https://app.proctorx.xyz`.

### Live screen monitoring doesn't connect on school/campus Wi-Fi
- Many school networks block direct video connections (WebRTC). The fix is a **TURN server** (a relay). You can run one (`coturn`) on the same Oracle server and fill in `TURN_URLS` / `TURN_SECRET` in the backend `.env`. Ask for help setting this up if you need it.

### Server is slow or crashed
```bash
free -h          # memory
df -h            # disk
docker stats     # per-container usage
```
- If disk is full: `docker system prune -f`.
- Reboot as a last resort: `sudo reboot`. Containers start again automatically (`restart: always`). Wait about 1 minute, then SSH back in.

### `Permission denied (publickey)` when SSH-ing
- Make sure you're using `-i "$HOME\.ssh\proctorx_oracle"` and the user is `ubuntu`.
- On Windows, if it complains the key permissions are "too open", run in PowerShell:
  ```powershell
  icacls "$HOME\.ssh\proctorx_oracle" /inheritance:r /grant:r "$($env:USERNAME):R"
  ```

### Supabase project says "Paused"
- Supabase dashboard → your project → **Restore project**. Takes a few minutes.

### I accidentally committed a `.env` or secret to GitHub
1. **Immediately change** the leaked secrets: generate a new `JWT_SECRET`/`INTERNAL_API_KEY`, reset the Supabase database password (**Project Settings → Database**), and regenerate API keys (Gemini, SMTP app password).
2. Remove the file from Git: `git rm --cached apps/backend/.env`, then commit. (The old version still exists in Git history, which is why step 1 matters most.)

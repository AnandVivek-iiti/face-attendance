# Face Attendance System

A full-stack face-attendance system for IIT Indore, enabling professors to take attendance via classroom photo capture, ML face mapping, roll number assignment, and CSV export.

## Architecture (3-Tier)

| Layer | Tech | Role |
|-------|------|------|
| **ML Service** | Python FastAPI + InsightFace (buffalo_l) | Stateless face detection/recognition. Receives classroom gallery per request, returns faces with `faceId`, `bbox`, `detectionConfidence`, `faceQuality`, `studentId` (may be null), `similarity`, `decision` (HIGH/REVIEW/UNKNOWN). |
| **Node Server** | Node.js + Express + MongoDB | Single writer to Mongo. Batched ML call per session. Persists faces+embeddings. Handles auto-absent, assign-face (upserts Student + embedding), CSV export, session image serving. |
| **Client** | React + Vite + Tailwind (glassmorphism theme) | Professor UI: session create, photo upload, face assign, review/export. Student UI: profile, past attendance, requests. Admin: course/Department CRUD, professor provisioning. |

## Professor Provisioning & Sign-In

- An admin creates a course and adds a professor to it (Admin → Courses).
- Each professor gets a **random temporary password** and a **one-time emailed sign-in link**; the admin can copy/share both when email is not configured.
- Professors sign in with the emailed link or the shared password, then set their own password.
- `npm run user:create` (in `server/`) bootstraps the first admin account.

## Professors Flow

1. **Create Session** – professor logs in, creates a new attendance session for ME217, uploads 4–5 classroom photos.
2. **ML Analysis** – server sends batch to ML service (`/analyze-classroom`). All faces returned with `faceId`, `bbox`, `detectionConfidence`, `faceQuality`, `studentId` (null = unknown), `similarity`, `decision`.
3. **Assign Roll Numbers** – professor verifies each face. For unknown faces: assign a new roll number → creates `Student` record + stores face embedding as reference. For known faces: confirm assignment.
4. **Next Session** – students matching from previous embeddings are auto-marked present. Anyone not detected is auto-marked absent.
5. **Finalize** – confirms attendance; CSV export available (per-session + full student×session matrix).

## Student Self-Service (out of professor-scope)

- First login with `@iiti.ac.in` email + any 8+ char password auto-creates account.
- Profile: upload photo, set roll number, request enrollment if not in course roster.
- Professor approves/rejects requests (creates student + ML embedding on approve).

## API Endpoints (Key Subset)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/login` | Login; first login creates account (`@iiti.ac.in` enforced). |
| `POST` | `/api/courses` | Admin creates a course. |
| `POST` | `/api/courses/professors` | Admin provisions a professor: random temporary password + emailed one-time sign-in link. |
| `POST` | `/api/attendance/sessions` | Professor creates a new attendance session. |
| `POST` | `/api/attendance/sessions/:id/images` | Upload classroom photos for the session. |
| `POST` | `/api/attendance/sessions/:id/analyze` | Batched ML call: returns faces + matches. |
| `POST` | `/api/attendance/sessions/:id/faces/:faceId/assign` | Assign roll number to a face → upserts Student, appends embedding. |
| `GET` | `/api/attendance/sessions/:id` | Get session with faces, records, warnings. |
| `DELETE` | `/api/attendance/sessions/:id` | Professor deletes a session with its photos and records (blocked while analysis is running). |
| `GET` | `/api/files/*` | Serve session images (traversal-protected, CORS). |
| `GET` | `/api/courses/available` | List courses student can enroll in. |
| `GET` | `/api/attendance/sessions/:id/export` | Per-session attendance CSV. |
| `GET` | `/api/attendance/export` | Full student×session matrix CSV. |

## ML Service

- **Port**: 8000
- **Model**: `buffalo_l` (InsightFace, CPU-only, 512-dim embeddings)
- **Endpoints**: `GET /health`, `POST /generate-embedding`, `POST /analyze-classroom`, `POST /crop-face`
- **Stateless**: receives gallery per request, stores nothing.
- **Thresholds**: HIGH ≥ 0.55, REVIEW 0.40–0.55, UNKNOWN < 0.40 (margin 0.05).

## Server (Node)

- **Port**: 5000
- **ML service URL**: `http://127.0.0.1:8000` (configurable via `ML_SERVICE_URL`)
- **CORS**: `credentials: true`, helmet `crossOriginResourcePolicy: cross-origin`
- **Crypto**: passwords (including the random temporary ones) are stored only as a **bcrypt hash** (cost 12); login verifies with `bcrypt.compare`. One-time sign-in links store only a SHA-256 token hash, are single-use, and expire.
- **Env files**: copy the `.env.example` templates to `.env` and fill in the values; see "Environment & Keys" below.

## Client (React + Vite)

- **Port**: 5173
- **Role-based routing**: `/professor/requests`, `/admin/courses`, `/student/profile`, `/student/attendance`
- **Glassmorphism theme** (dark-green) with animations — Phase 1 redesign complete.
- **Build**: `npm run build` produces static assets in `dist/`.
- **Key utils**: `normalize.js` (unwrap fix, SESSION_STATUS align, withCredentials removed), `attendance.js`, `constants.js`, `errors.js`.

## Setup & Run

> Use **one terminal per service** (3 terminals total: ML + server + client).
> `call .venv\Scripts\activate` is **CMD-only** — it fails in PowerShell.
> Pick the block for your shell below.

### 1. ML Service (Python, port 8000)

**Windows PowerShell:**
```powershell
cd ml-service
python -m venv .venv                      # once
.venv\Scripts\Activate.ps1                # every new terminal
# If activation is blocked:
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
pip install -r requirements.txt           # once
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
# Wait ~30–60s for the buffalo_l model to load.
```

**Windows CMD:**
```bat
cd ml-service
python -m venv .venv
.venv\Scripts\activate.bat
pip install -r requirements.txt         
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

**macOS / Linux (bash/zsh):**
```bash
cd ml-service
python3 -m venv .venv          # once
source .venv/bin/activate      # every new terminal
pip install -r requirements.txt  # once
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

**Verify it is up (any OS, second terminal):**
```powershell
# PowerShell:
Invoke-WebRequest -Uri "http://127.0.0.1:8000/health" -UseBasicParsing | Select-Object -ExpandProperty Content
# Expected: {"status":"ok","embeddingModel":"buffalo_l","embeddingDim":512,...}
```
```bash
# macOS / Linux / Git Bash:
curl -s http://127.0.0.1:8000/health
```

### 2. Node Server (port 5000)

Same commands on **all** OSes (PowerShell, CMD, bash):
```bash
cd server
npm install          # once
npm run dev          # starts on http://localhost:5000
```

### 3. Client (port 5173)

Same commands on **all** OSes:
```bash
cd client
npm install          # once
npm run dev          # starts on http://localhost:5173
```

### 4. Create the first admin (once — MongoDB on 27017 must be running)

Same commands on **all** OSes:
```bash
cd server
npm run user:create      # prompts for the admin email + password
```

### Troubleshooting

| Symptom | Meaning | Fix |
|---------|---------|-----|
| `call` is not recognized (PowerShell) | `call` is CMD-only syntax | Use `.venv\Scripts\Activate.ps1` in PowerShell (see above) |
| `[Errno 10048] ... port 8000` / `only one usage of each socket address` | ML service is **already running** — you started it twice | Don't start a second copy. Verify the first one with the `/health` check above and keep using it |
| `Activate.ps1` blocked by execution policy | PowerShell script policy | Run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`, then activate again (process-scope only, no system change) |
| `ECONNREFUSED 127.0.0.1:5000` | Node server isn't running | Start it (`cd server` → `npm run dev`) in its own terminal and leave it running |

## Environment & Keys

Copy `server/.env.example` → `server/.env`, `ml-service/.env.example` → `ml-service/.env`, and `client/.env.example` → `client/.env`, then fill in the values.

| Variable | Where to get it |
|----------|-----------------|
| `MONGODB_URI` | Local: `mongodb://localhost:27017/face_attendance`. Cloud: MongoDB Atlas → Database → Connect → Drivers. |
| `JWT_SECRET` | Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. |
| `ML_API_KEY` / `API_KEY` | Invent a random string; use the **same** value on the server (`ML_API_KEY`) and ML service (`API_KEY`). Sent as the `X-API-Key` header. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID (Web application). |
| `SMTP_USER` / `SMTP_PASS` | Any mailbox. Gmail: enable 2FA → create an **App password**; set `SMTP_HOST=smtp.gmail.com`, `SMTP_USER=<address>`, `SMTP_PASS=<app password>`. |
| `RESEND_API_KEY` / `SENDGRID_API_KEY` / `BREVO_API_KEY` | Failover for hosts that block outbound SMTP (e.g. Render): create an API key at resend.com / sendgrid.com / brevo.com and set the matching variable. Providers are tried automatically in order **SMTP → Resend → SendGrid → Brevo**, and any that fail are skipped. Only ones with a key set are used; optional `EMAIL_PROVIDER` pins a single one. |
| `SERVER_URL` | Public origin of the server (used to build emailed sign-in links); defaults to `http://localhost:5000`. |
| `CLIENT_URL`, `VITE_API_BASE_URL`, `VITE_ASSET_BASE_URL`, `ML_SERVICE_URL` | Your own service URLs (localhost in dev, deployed URLs in production). |

Google OAuth: create a project, configure the OAuth consent screen, add the **Authorized redirect URI** `https://<server-host>/api/auth/google/callback`, then copy the Client ID and secret. The secret is server-side only — never put it in `client/.env`.

## Deployment (Render)

The repo-root `render.yaml` Blueprint defines both services:

- **face-attendance-server** — Node web service (`server/`). Set `MONGODB_URI`, `ML_SERVICE_URL`, `CLIENT_URL`, `TRUST_PROXY=1`, and the Google OAuth vars in the Dashboard.
- **face-attendance-client** — static site (`client/`). Set `VITE_API_BASE_URL` and `VITE_ASSET_BASE_URL` to the server's URL before building.

The static site ships a rewrite rule (`/*` → `/index.html`). Without it, refreshing or deep-linking to any route (e.g. `/login`) returns a 404, because the host only has `index.html` at `/`.

Google sign-in requires `GOOGLE_CALLBACK_URL=https://<server-host>/api/auth/google/callback`, with that exact URL added under **Authorized redirect URIs** in the Google Cloud console.

## Tests

| Suite | Result |
|-------|--------|
| `npm test` (server) | 37 passed, 1 skipped |
| `python -m pytest` (ML) | 49 passed, 7 skipped |
| `npm run build` (client) | 1711 modules, no errors |

## Constraints

- **Env files**: copy the `.env.example` templates to `.env`; never commit real secrets.
- **Professor flow only**: student self-service, admin CRUD (outside professor scope) are documented but not the focus of this integration.
- **MongoDB** must be running on `27017` before server start.
- **CPU-only ML**: no CUDA; expect ~30–60s batch latency per session.

## Future Improvements

- CUDA GPU support for InsightFace.
- Offline attendance mode (cached embeddings).
- Web-based ML service with request queueing.
- Real-time face preview during photo upload.
- SSO integration with IIT identity provider.

# Face Attendance System

A full-stack face-attendance system for IIT Indore, enabling professors to take attendance via classroom photo capture, ML face mapping, roll number assignment, and CSV export.

## Architecture (3-Tier)

| Layer | Tech | Role |
|-------|------|------|
| **ML Service** | Python FastAPI + InsightFace (buffalo_l) | Stateless face detection/recognition. Receives classroom gallery per request, returns faces with `faceId`, `bbox`, `detectionConfidence`, `faceQuality`, `studentId` (may be null), `similarity`, `decision` (HIGH/REVIEW/UNKNOWN). |
| **Node Server** | Node.js + Express + MongoDB | Single writer to Mongo. Batched ML call per session. Persists faces+embeddings. Handles auto-absent, assign-face (upserts Student + embedding), CSV export, session image serving. |
| **Client** | React + Vite + Tailwind (glassmorphism theme) | Professor UI: session create, photo upload, face assign, review/export. Student UI: profile, past attendance, requests. Admin: course/Department CRUD, professor provisioning. |

## Default Test Course

- **Course**: ME217 – INDUSTRIAL DATA ANALYTICS
- **Semester**: 5, **Section**: A
- **Room**: L03
- **Professor**: Pradeep Kundu (`pradeep.kundu@iiti.ac.in`)
- **Auto-generated password** (first login only): `IIT@INDORE#ME217`

> **Professor credentials (placeholder)**: `professor@example.com` / `changeme1234` — change after first login.

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
| `POST` | `/api/courses` | Admin creates course; auto-generates professor password `IIT@INDORE#<CODE>` if `passwordSetByCourse` is null. |
| `POST` | `/api/sessions` | Professor creates a new attendance session. |
| `POST` | `/api/sessions/:id/analyze` | Batched ML call: upload classroom photos → returns faces + embeddings. |
| `POST` | `/api/sessions/:id/faces/:faceId/assign` | Assign roll number to a face → upserts Student, appends embedding. |
| `GET` | `/api/sessions/:id` | Get session with faces, records, warnings. |
| `DELETE` | `/api/attendance/sessions/:id` | Professor deletes a session with its photos and records (blocked while analysis is running). |
| `GET` | `/api/files/*` | Serve session images (traversal-protected, CORS). |
| `GET` | `/api/courses/available` | List courses student can enroll in. |
| `POST` | `/api/export/csv` | Per-session or full student×session matrix CSV. |

## ML Service

- **Port**: 8000
- **Model**: `buffalo_l` (InsightFace, CPU-only, 512-dim embeddings)
- **Endpoints**: `GET /health`, `POST /generate-embedding`, `POST /analyze-classroom`
- **Stateless**: receives gallery per request, stores nothing.
- **Thresholds**: HIGH ≥ 0.55, REVIEW 0.40–0.55, UNKNOWN < 0.40 (margin 0.05).

## Server (Node)

- **Port**: 5000
- **ML service URL**: `http://127.0.0.1:8000` (configurable via `ML_SERVICE_URL`)
- **CORS**: `credentials: true`, helmet `crossOriginResourcePolicy: cross-origin`
- **Crypto**: professor passwords auto-derived `IIT@INDORE#<CODE>` at course creation, then stored as **bcrypt hashes** (`bcrypt.hash`, cost 12); login verifies with `bcrypt.compare`. No plaintext passwords in the DB.
- **Env files**: `server/.env` and `ml-service/.env` **must not be modified**. Code reads `process.env` with defaults (`mlApiKey` defaults to `''`).

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
python -m venv .venv                      & rem once
.venv\Scripts\activate.bat                & rem every new terminal
pip install -r requirements.txt           & rem once
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

### 4. Seed DB (once, MongoDB on 27017 must be running)

Same commands on **all** OSes:
```bash
cd server
npm run seed:professor   # creates ME217 course + placeholder prof
```

### Troubleshooting

| Symptom | Meaning | Fix |
|---------|---------|-----|
| `call` is not recognized (PowerShell) | `call` is CMD-only syntax | Use `.venv\Scripts\Activate.ps1` in PowerShell (see above) |
| `[Errno 10048] ... port 8000` / `only one usage of each socket address` | ML service is **already running** — you started it twice | Don't start a second copy. Verify the first one with the `/health` check above and keep using it |
| `Activate.ps1` blocked by execution policy | PowerShell script policy | Run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`, then activate again (process-scope only, no system change) |
| `ECONNREFUSED 127.0.0.1:5000` | Node server isn't running | Start it (`cd server` → `npm run dev`) in its own terminal and leave it running |

## Tests

| Suite | Result |
|-------|--------|
| `npm test` (server) | 19 passed, 1 skipped |
| `python -m pytest` (ML) | 42 passed, 7 skipped |
| `npm run build` (client) | 1704 modules, no errors |

## Constraints

- **Env files**: `server/.env`, `ml-service/.env` — **do not edit**. Code may read `process.env` with defaults.
- **Professor flow only**: student self-service, admin CRUD (outside professor scope) are documented but not the focus of this integration.
- **MongoDB** must be running on `27017` before server start.
- **CPU-only ML**: no CUDA; expect ~30–60s batch latency per session.

## Future Improvements

- CUDA GPU support for InsightFace.
- Offline attendance mode (cached embeddings).
- Web-based ML service with request queueing.
- Real-time face preview during photo upload.
- SSO integration with IIT identity provider.

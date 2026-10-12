# Face Attendance ML Service

FastAPI service for classroom face analysis: image quality, detection, per-face quality, embeddings, identity matching and confidence decisions. It stores nothing and writes no attendance records.

## Setup

```
python -m venv .venv
.venv\Scripts\activate          # Windows
source .venv/bin/activate       # macOS / Linux
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

First start downloads the `buffalo_l` model pack (about 280 MB) into `INSIGHTFACE_ROOT`.
GPU: `pip install -r requirements-gpu.txt` and leave `DEVICE=auto`.
Docker: `docker build -t face-ml . && docker run -p 8000:8000 face-ml`.

If `pip install insightface` fails to compile on Windows, install Microsoft C++ Build Tools or use the Docker image.

## Endpoints

| method | path | purpose |
|---|---|---|
| GET | `/health` | model name, embedding dimension, active ONNX providers |
| POST | `/generate-embedding` | one reference image in, one embedding out (registration) |
| POST | `/analyze-classroom` | classroom images plus enrolled embeddings in, decisions out |

Errors use `{"error": {"code": "...", "message": "..."}}`. When `API_KEY` is set, send it as `X-API-Key`.

### POST /analyze-classroom

`multipart/form-data`:

- `images`: 1 to `MAX_IMAGES_PER_REQUEST` files (JPEG, PNG, WebP)
- `students`: JSON array, each item `{"studentId": "...", "embedding": [512 floats]}` or `{"studentId": "...", "embeddings": [[...], [...]]}`
- `embeddingModel` (optional): rejected with 409 if it differs from the loaded model

```
curl -X POST http://localhost:8000/analyze-classroom \
  -F "images=@photo1.jpg;type=image/jpeg" \
  -F "images=@photo2.jpg;type=image/jpeg" \
  -F "embeddingModel=buffalo_l" \
  -F "students=</path/to/students.json"
```

Response fields follow the agreed contract. Notes:

- `summary.detectedFaces` always equals `highConfidence + needsReview + unknown` and counts faces in `faces`.
- With several images, `faceId` is `img<N>_face_<NNN>`; with one image it is `face_<NNN>`. `bbox` refers to that image.
- A student appears at most once. The strongest observation wins (decision rank, then similarity weighted by face quality).
- `similarity` is `0.0` for faces rejected on quality before embedding.
- An unusable image returns `status: "unusable"`, a message, empty `faces` and zero counts.
- Several images aggregate to `unusable` only if all are; skipped images downgrade the status to `poor`.

### POST /generate-embedding

`multipart/form-data` with `image`. Returns `embedding` (L2-normalised, 512 floats), `embeddingModel`, `embeddingDim`, `faceQuality`, `detectionConfidence`, `bbox`.
Error codes: `NO_FACE_DETECTED`, `MULTIPLE_FACES_DETECTED`, `FACE_TOO_SMALL`, `FACE_TOO_BLURRY`, `FACE_POOR_QUALITY`, `IMAGE_UNUSABLE`, `INVALID_IMAGE`, `FILE_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`.
Store `embeddingModel` next to each embedding and send it back in `/analyze-classroom`.

## Decision rules

1. Faces below `FACE_REJECT_*` limits (tiny, very blurry, extreme exposure, mostly outside frame) are `unknown` and never claim a student.
2. Each remaining face is matched to enrolled students; a student can be claimed by only one face per image (greedy by similarity).
3. Similarity below `REVIEW_THRESHOLD` is `unknown`.
4. `high_confidence` requires similarity at or above `HIGH_CONFIDENCE_THRESHOLD`, a clean quality tier (size, sharpness, pose, visibility) and a margin of at least `MIN_MATCH_MARGIN` over the next-best student. Anything else above the review threshold is `needs_review`.

## Environment variables

See `.env.example`. Thresholds are starting points; calibrate with `scripts/evaluation/`.

## Scripts

- `scripts/import-facemark/`: inspect or export embeddings from the original FaceMark ZIP (read-only).
- `scripts/evaluation/`: see its README.

## Tests

```
pip install -r requirements-dev.txt
pytest tests
FACE_SAMPLE_IMAGE=/path/to/single_face.jpg pytest tests
```

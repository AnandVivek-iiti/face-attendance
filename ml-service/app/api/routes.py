import hmac
import json
import uuid

from fastapi import APIRouter, Depends, File, Form, Header, Request, UploadFile
from pydantic import ValidationError

from app.api.schemas import (
    AnalyzeResponse,
    CropResponse,
    HealthResponse,
    ReferenceEmbeddingResponse,
    StudentIn,
)
from app.config import Settings
from app.errors import AppError
from app.utils.embedding_utils import EnrolledStudent, to_embedding_matrix
from app.utils.image_utils import crop_face_jpeg, decode_image, validate_upload

router = APIRouter()


def settings_dep(request: Request) -> Settings:
    return request.app.state.settings


def require_api_key(request: Request, x_api_key: str | None = Header(default=None)) -> None:
    expected = request.app.state.settings.api_key
    if expected and not hmac.compare_digest(x_api_key or "", expected):
        raise AppError("UNAUTHORIZED", "Invalid or missing API key", 401)


def read_image(upload: UploadFile, settings: Settings):
    data = upload.file.read(settings.max_image_bytes + 1)
    validate_upload(data, upload.content_type, settings.max_image_bytes)
    return decode_image(data, settings.max_image_pixels)


def parse_students(raw: str, settings: Settings, dim: int, allow_empty: bool = False) -> list[EnrolledStudent]:
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        raise AppError("INVALID_STUDENTS", "students must be a valid JSON array", 422)
    if not isinstance(payload, list):
        raise AppError("INVALID_STUDENTS", "students must be a JSON array", 422)
    # An empty gallery is legitimate on a course's first session: the service
    # still detects faces and returns embeddings so the roster can be built.
    if not payload and not allow_empty:
        raise AppError("INVALID_STUDENTS", "students must be a non-empty array", 422)
    if len(payload) > settings.max_students_per_request:
        raise AppError("TOO_MANY_STUDENTS", "Too many students in one request", 413)
    students = []
    for item in payload:
        try:
            parsed = StudentIn.model_validate(item)
        except ValidationError:
            raise AppError("INVALID_STUDENTS", "Each student needs a valid studentId and embedding", 422)
        vectors = parsed.embeddings if parsed.embeddings else ([parsed.embedding] if parsed.embedding else None)
        if not vectors:
            raise AppError("INVALID_STUDENTS", f"Student {parsed.studentId} has no embedding", 422)
        students.append(EnrolledStudent(parsed.studentId, to_embedding_matrix(vectors, dim, parsed.studentId)))
    return students


@router.get("/health", response_model=HealthResponse)
def health(request: Request):
    registry = request.app.state.registry
    return HealthResponse(
        status="ok",
        embeddingModel=registry.model_name,
        embeddingDim=registry.recognizer.embedding_dim,
        providers=registry.active_providers,
    )


@router.post("/analyze-classroom", response_model=AnalyzeResponse, dependencies=[Depends(require_api_key)])
def analyze_classroom(
    request: Request,
    images: list[UploadFile] = File(...),
    students: str = Form(...),
    embeddingModel: str | None = Form(default=None),
    includeEmbeddings: bool = Form(default=False),
    allowEmptyStudents: bool = Form(default=False),
    settings: Settings = Depends(settings_dep),
):
    registry = request.app.state.registry
    if embeddingModel and embeddingModel != registry.model_name:
        raise AppError("EMBEDDING_MODEL_MISMATCH",
                       f"Stored embeddings were produced by {embeddingModel}; service runs {registry.model_name}", 409)
    if not images or len(images) > settings.max_images_per_request:
        raise AppError("INVALID_IMAGE_COUNT", f"Provide between 1 and {settings.max_images_per_request} images", 422)
    enrolled = parse_students(students, settings, registry.recognizer.embedding_dim, allow_empty=allowEmptyStudents)
    decoded = [read_image(upload, settings) for upload in images]
    return request.app.state.attendance.analyze(
        decoded, enrolled, uuid.uuid4().hex[:12], include_embeddings=includeEmbeddings
    )


@router.post("/crop-face", response_model=CropResponse, dependencies=[Depends(require_api_key)])
def crop_face(
    request: Request,
    image: UploadFile = File(...),
    boxes: str = Form(...),
    settings: Settings = Depends(settings_dep),
):
    try:
        parsed = json.loads(boxes)
    except json.JSONDecodeError:
        raise AppError("INVALID_BOXES", "boxes must be a valid JSON array", 422)
    if not isinstance(parsed, list) or not parsed:
        raise AppError("INVALID_BOXES", "boxes must be a non-empty JSON array", 422)
    decoded = read_image(image, settings)
    return CropResponse(crops=[crop_face_jpeg(decoded, box) for box in parsed])


@router.post("/generate-embedding", response_model=ReferenceEmbeddingResponse, dependencies=[Depends(require_api_key)])
def generate_embedding(
    request: Request,
    image: UploadFile = File(...),
    settings: Settings = Depends(settings_dep),
):
    decoded = read_image(image, settings)
    result = request.app.state.reference.generate(decoded)
    return ReferenceEmbeddingResponse(
        embedding=result.embedding,
        embeddingModel=result.model,
        embeddingDim=result.dimension,
        faceQuality=result.face_quality,
        detectionConfidence=result.detection_confidence,
        bbox=result.bbox,
    )

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


def read_bytes(upload: UploadFile, settings: Settings) -> bytes:
    data = upload.file.read(settings.max_image_bytes + 1)
    validate_upload(data, upload.content_type, settings.max_image_bytes)
    return data


def read_image(upload: UploadFile, settings: Settings):
    return decode_image(read_bytes(upload, settings), settings.max_image_pixels)


def parse_students(raw: str, settings: Settings, dim: int, allow_empty: bool = False,
                   model_name: str | None = None) -> tuple[list[EnrolledStudent], list[dict]]:
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        raise AppError("INVALID_STUDENTS", "students must be a valid JSON array", 422)
    if not isinstance(payload, list):
        raise AppError("INVALID_STUDENTS", "students must be a JSON array", 422)
    # An empty gallery is legitimate on a course's first session: the service still detects faces and returns embeddings so the roster can be...
    if not payload and not allow_empty:
        raise AppError("INVALID_STUDENTS", "students must be a non-empty array", 422)
    if len(payload) > settings.max_students_per_request:
        raise AppError("TOO_MANY_STUDENTS", "Too many students in one request", 413)
    students = []
    excluded: list[dict] = []
    for item in payload:
        try:
            parsed = StudentIn.model_validate(item)
        except ValidationError:
            raise AppError("INVALID_STUDENTS", "Each student needs a valid studentId and embedding", 422)
        vectors = parsed.embeddings if parsed.embeddings else ([parsed.embedding] if parsed.embedding else None)
        if not vectors:
            raise AppError("INVALID_STUDENTS", f"Student {parsed.studentId} has no embedding", 422)
        if model_name and parsed.embeddingModel and parsed.embeddingModel != model_name:
            # Never compare across models: leave the student out (they can only come back as unknown) and say so.
            excluded.append({"studentId": parsed.studentId, "code": "EMBEDDING_MODEL_MISMATCH",
                             "message": f"Embedding produced by {parsed.embeddingModel}; service runs {model_name}"})
            continue
        students.append(EnrolledStudent(parsed.studentId, to_embedding_matrix(vectors, dim, parsed.studentId)))
    return students, excluded


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
    if settings.require_embedding_model and not embeddingModel:
        raise AppError("EMBEDDING_MODEL_REQUIRED", "embeddingModel must state which model produced the stored embeddings", 422)
    if embeddingModel and embeddingModel != registry.model_name:
        raise AppError("EMBEDDING_MODEL_MISMATCH",
                       f"Stored embeddings were produced by {embeddingModel}; service runs {registry.model_name}", 409)
    if not images or len(images) > settings.max_images_per_request:
        raise AppError("INVALID_IMAGE_COUNT", f"Provide between 1 and {settings.max_images_per_request} images", 422)
    enrolled, excluded = parse_students(students, settings, registry.recognizer.embedding_dim,
                                        allow_empty=allowEmptyStudents, model_name=registry.model_name)
    if not enrolled and excluded and not allowEmptyStudents:
        raise AppError("EMBEDDING_MODEL_MISMATCH", "Every supplied embedding was produced by a different model", 409)
    payloads = [read_bytes(upload, settings) for upload in images]
    return request.app.state.attendance.analyze_encoded(
        payloads, enrolled, uuid.uuid4().hex[:12], include_embeddings=includeEmbeddings, excluded=tuple(excluded)
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
    result = request.app.state.reference.generate_from_bytes(read_bytes(image, settings))
    return ReferenceEmbeddingResponse(
        embedding=result.embedding,
        embeddingModel=result.model,
        embeddingDim=result.dimension,
        faceQuality=result.face_quality,
        detectionConfidence=result.detection_confidence,
        bbox=result.bbox,
    )

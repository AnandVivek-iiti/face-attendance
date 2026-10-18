from pydantic import BaseModel, Field


class ImageQualityOut(BaseModel):
    status: str
    blurScore: float | None = None
    brightnessScore: float | None = None
    message: str | None = None


class PerImageQualityOut(ImageQualityOut):
    index: int


class FaceOut(BaseModel):
    faceId: str
    bbox: list[int]
    detectionConfidence: float
    faceQuality: float
    studentId: str | None
    similarity: float
    decision: str
    embedding: list[float] | None = Field(default=None, exclude_if=lambda v: v is None)


class SummaryOut(BaseModel):
    detectedFaces: int
    highConfidence: int
    needsReview: int
    unknown: int


class AnalyzeResponse(BaseModel):
    imageQuality: ImageQualityOut
    imageQualities: list[PerImageQualityOut] = []
    faces: list[FaceOut]
    summary: SummaryOut


class StudentIn(BaseModel):
    studentId: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_.\-]+$")
    embedding: list[float] | None = None
    embeddings: list[list[float]] | None = None


class ReferenceEmbeddingResponse(BaseModel):
    embedding: list[float]
    embeddingModel: str
    embeddingDim: int
    faceQuality: float
    detectionConfidence: float
    bbox: list[int]


class CropResponse(BaseModel):
    # One base64 JPEG per requested box, in the same order.
    crops: list[str | None]


class HealthResponse(BaseModel):
    status: str
    embeddingModel: str
    embeddingDim: int
    providers: list[str]

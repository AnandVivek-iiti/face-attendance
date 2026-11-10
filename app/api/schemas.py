from pydantic import BaseModel, Field


class ImageQualityOut(BaseModel):
    status: str
    blurScore: float | None = None
    brightnessScore: float | None = None
    message: str | None = None


class PerImageQualityOut(ImageQualityOut):
    index: int
    issues: list[str] = []


class ReasonOut(BaseModel):
    code: str
    gate: str
    message: str


class DecisionDetailOut(BaseModel):
    identityPassed: bool
    qualityPassed: bool
    similarity: float
    margin: float
    faceTier: str
    faceSide: float
    faceSharpness: float
    faceFrontalness: float
    faceVisibility: float
    imageStatus: str | None = None
    reasons: list[ReasonOut] = []


class CandidateOut(BaseModel):
    studentId: str
    similarity: float


class PolicyOut(BaseModel):
    version: int
    highConfidenceThreshold: float
    reviewThreshold: float
    minMatchMargin: float
    faceHighMinSide: int
    faceHighMinSharpness: float
    faceHighMinFrontalness: float
    faceHighMinQuality: float
    requireGoodImageForHigh: bool


class FaceOut(BaseModel):
    faceId: str
    bbox: list[int]
    detectionConfidence: float
    faceQuality: float
    qualityTier: str = "unknown"
    matchMargin: float = 0.0
    secondBestSimilarity: float | None = None
    clusterId: str | None = None
    studentId: str | None
    similarity: float
    decision: str
    decisionDetail: DecisionDetailOut | None = None
    candidates: list[CandidateOut] = []
    embedding: list[float] | None = Field(default=None, exclude_if=lambda v: v is None)


class SummaryOut(BaseModel):
    detectedFaces: int
    highConfidence: int
    needsReview: int
    unknown: int
    duplicateObservations: int = 0
    reviewReasons: dict[str, int] = {}


class ExcludedStudentOut(BaseModel):
    studentId: str
    code: str
    message: str


class AnalyzeResponse(BaseModel):
    embeddingModel: str
    embeddingDim: int
    excludedStudents: list[ExcludedStudentOut] = []
    policy: PolicyOut | None = None
    imageQuality: ImageQualityOut
    imageQualities: list[PerImageQualityOut] = []
    faces: list[FaceOut]
    summary: SummaryOut


class StudentIn(BaseModel):
    studentId: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_.\-]+$")
    embedding: list[float] | None = None
    embeddings: list[list[float]] | None = None
    # Model that produced this student's embedding(s). A mismatch excludes the student instead of comparing across models.
    embeddingModel: str | None = Field(default=None, max_length=128)


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

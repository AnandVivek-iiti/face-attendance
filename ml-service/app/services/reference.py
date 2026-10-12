from dataclasses import dataclass

import numpy as np

from app.config import Settings
from app.errors import AppError
from app.models.registry import ModelRegistry
from app.services.detection import DetectionService
from app.services.quality_check import assess_face, assess_image
from app.services.recognition import RecognitionService
from app.utils.image_utils import pad_border

PAD_RATIO = 0.5


@dataclass(frozen=True)
class ReferenceEmbedding:
    embedding: list[float]
    model: str
    dimension: int
    face_quality: float
    detection_confidence: float
    bbox: list[int]


class ReferenceService:
    def __init__(self, registry: ModelRegistry, settings: Settings):
        self._settings = settings
        self._model_name = registry.model_name
        self._detection = DetectionService(registry.detector)
        self._recognition = RecognitionService(registry.recognizer, settings)

    def generate(self, image: np.ndarray) -> ReferenceEmbedding:
        settings = self._settings
        image_quality = assess_image(image, settings)
        if image_quality.status == "unusable" and image_quality.reason != "blur":
            raise AppError("IMAGE_UNUSABLE", image_quality.message, 422)

        faces = self._detection.detect(image)
        working = image
        if not faces and settings.reference_pad_fallback:
            working = pad_border(image, PAD_RATIO)
            faces = self._detection.detect(working)
        if not faces:
            raise AppError("NO_FACE_DETECTED", "No face was detected in the reference image.", 422)

        areas = [float((f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1])) for f in faces]
        largest = int(np.argmax(areas))
        significant = [a for a in areas if a >= settings.reference_secondary_face_area_ratio * areas[largest]]
        if len(significant) > 1:
            raise AppError("MULTIPLE_FACES_DETECTED", "Reference image must contain exactly one face.", 422)

        face = faces[largest]
        aligned = self._recognition.align(working, face.keypoints)
        quality = assess_face(face, working, settings)
        self._validate_reference_quality(face.score, quality)

        embedding = self._recognition.embed([aligned])[0]
        height, width = working.shape[:2]
        bbox = [int(max(0, v)) for v in face.bbox]
        bbox[2], bbox[3] = min(bbox[2], width), min(bbox[3], height)
        return ReferenceEmbedding(
            embedding=[float(v) for v in embedding],
            model=self._model_name,
            dimension=int(embedding.shape[0]),
            face_quality=quality.score,
            detection_confidence=round(face.score, 3),
            bbox=bbox,
        )

    def _validate_reference_quality(self, detection_score: float, quality) -> None:
        settings = self._settings
        if quality.side < settings.reference_min_face_side:
            raise AppError("FACE_TOO_SMALL", "Face in the reference image is too small.", 422)
        if quality.sharpness < settings.reference_min_face_sharpness:
            raise AppError("FACE_TOO_BLURRY", "Face in the reference image is too blurry.", 422)
        if detection_score < settings.reference_min_detection_score or quality.frontalness < settings.reference_min_frontalness:
            raise AppError("FACE_POOR_QUALITY", "Face must be clearly visible and facing the camera.", 422)
        if quality.tier == "reject":
            raise AppError("FACE_POOR_QUALITY", "Face quality is too low for registration.", 422)

import logging
import threading
from dataclasses import dataclass

import numpy as np

from app.config import Settings
from app.models.registry import ModelRegistry
from app.services.detection import DetectionService, clamp_bbox
from app.services.quality_check import FaceQuality, ImageQuality, assess_face, assess_image
from app.services.recognition import HIGH, REVIEW, UNKNOWN, RecognitionService
try:
    from app.utils.debug_crops import FaceCropWriter
except ModuleNotFoundError:  # optional debug helper; keep the service importable without it
    class FaceCropWriter:  # type: ignore[no-redef]
        def __init__(self, *args, **kwargs) -> None:
            pass

        def save(self, *args, **kwargs) -> None:
            pass
from app.utils.embedding_utils import EnrolledStudent, build_gallery

logger = logging.getLogger(__name__)
DECISION_RANK = {HIGH: 0, REVIEW: 1, UNKNOWN: 2}


@dataclass
class Observation:
    face_id: str
    image_index: int
    bbox: list[int]
    detection_confidence: float
    face_quality: float
    student_id: str | None
    similarity: float
    decision: str
    embedding: np.ndarray | None = None

    @property
    def evidence(self) -> float:
        return self.similarity * (0.5 + 0.5 * self.face_quality)


class AttendanceService:
    def __init__(self, registry: ModelRegistry, settings: Settings):
        self._settings = settings
        self._detection = DetectionService(
            registry.detector,
            tiling=settings.detection_tiling,
            tile_side=settings.detection_tile_side,
            overlap=settings.detection_tile_overlap,
        )
        self._recognition = RecognitionService(registry.recognizer, settings)
        self._crops = FaceCropWriter(settings.save_face_crops, settings.crop_path)
        self._gate = threading.BoundedSemaphore(settings.max_concurrent_inferences)

    def analyze(self, images: list[np.ndarray], students: list[EnrolledStudent], request_id: str,
                include_embeddings: bool = False) -> dict:
        qualities = [assess_image(image, self._settings) for image in images]
        usable = [i for i, quality in enumerate(qualities) if quality.status != "unusable"]
        image_quality = self._aggregate_image_quality(qualities)
        if not usable:
            return self._response(image_quality, [], include_embeddings, qualities)

        gallery = build_gallery(students)
        multi = len(images) > 1
        observations: list[Observation] = []
        with self._gate:
            for index in usable:
                observations.extend(
                    self._analyze_image(images[index], index, multi, gallery, request_id, include_embeddings)
                )

        for observation in observations:
            self._save_crop(request_id, images[observation.image_index], observation)
        faces = self._deduplicate(observations)
        logger.info("request=%s images=%d usable=%d faces=%d returned=%d",
                    request_id, len(images), len(usable), len(observations), len(faces))
        return self._response(image_quality, faces, include_embeddings, qualities)

    def _analyze_image(self, image: np.ndarray, index: int, multi: bool, gallery, request_id: str,
                       include_embeddings: bool = False) -> list[Observation]:
        raw_faces = self._detection.detect(image)
        height, width = image.shape[:2]
        records = []
        for position, face in enumerate(raw_faces, start=1):
            aligned = self._recognition.align(image, face.keypoints)
            quality = assess_face(face, image, self._settings)
            face_id = f"img{index + 1}_face_{position:03d}" if multi else f"face_{position:03d}"
            records.append((face_id, face, aligned, quality))

        eligible = [r for r in records if r[3].side >= self._settings.min_embed_face_side]
        embeddings = self._recognition.embed([r[2] for r in eligible])
        matches = self._recognition.match(embeddings, gallery)
        match_by_id = {r[0]: m for r, m in zip(eligible, matches)}
        embedding_by_id = {r[0]: e for r, e in zip(eligible, embeddings)} if include_embeddings else {}

        observations = []
        for face_id, face, _, quality in records:
            match = match_by_id.get(face_id)
            embedding = embedding_by_id.get(face_id)
            if match is None:
                observations.append(
                    self._observation(face_id, index, face, quality, None, 0.0, UNKNOWN, width, height, embedding)
                )
                continue
            decision = self._recognition.decide(match, quality.tier)
            student_id = match.student_id if decision != UNKNOWN else None
            observations.append(
                self._observation(face_id, index, face, quality, student_id, match.similarity, decision,
                                  width, height, embedding)
            )
        return observations

    @staticmethod
    def _observation(face_id: str, index: int, face, quality: FaceQuality, student_id: str | None,
                     similarity: float, decision: str, width: int, height: int,
                     embedding: np.ndarray | None = None) -> Observation:
        return Observation(
            face_id=face_id,
            image_index=index,
            bbox=clamp_bbox(face.bbox, width, height),
            detection_confidence=round(face.score, 3),
            face_quality=quality.score,
            student_id=student_id,
            similarity=round(similarity, 4),
            decision=decision,
            embedding=embedding,
        )

    @staticmethod
    def _deduplicate(observations: list[Observation]) -> list[Observation]:
        best: dict[str, Observation] = {}
        for observation in observations:
            if observation.student_id is None:
                continue
            current = best.get(observation.student_id)
            if current is None or (DECISION_RANK[observation.decision], -observation.evidence) < (
                DECISION_RANK[current.decision], -current.evidence
            ):
                best[observation.student_id] = observation
        kept = [o for o in observations if o.student_id is None or best[o.student_id] is o]
        return sorted(kept, key=lambda o: (o.image_index, o.face_id))

    def _save_crop(self, request_id: str, image: np.ndarray, observation: Observation) -> None:
        self._crops.save(request_id, image, observation.face_id, observation.bbox,
                         observation.decision, observation.student_id, observation.similarity)

    @staticmethod
    def _aggregate_image_quality(qualities: list[ImageQuality]) -> ImageQuality:
        usable = [q for q in qualities if q.status != "unusable"]
        blur = float(np.median([q.blur_score for q in qualities]))
        brightness = float(np.mean([q.brightness_score for q in qualities]))
        if not usable:
            return ImageQuality("unusable", round(blur, 2), round(brightness, 3), qualities[0].message)
        skipped = len(qualities) - len(usable)
        if skipped:
            message = f"{skipped} of {len(qualities)} images were unusable and were skipped."
            return ImageQuality("poor", round(blur, 2), round(brightness, 3), message)
        worst = next((q for q in qualities if q.status == "poor"), None)
        if worst:
            return ImageQuality("poor", round(blur, 2), round(brightness, 3), worst.message)
        return ImageQuality("good", round(blur, 2), round(brightness, 3), None)

    @staticmethod
    def _response(image_quality: ImageQuality, faces: list[Observation], include_embeddings: bool = False,
                  qualities: list[ImageQuality] | None = None) -> dict:
        counts = {HIGH: 0, REVIEW: 0, UNKNOWN: 0}
        for face in faces:
            counts[face.decision] += 1

        def face_payload(f: Observation) -> dict:
            payload = {
                "faceId": f.face_id,
                "bbox": f.bbox,
                "detectionConfidence": f.detection_confidence,
                "faceQuality": f.face_quality,
                "studentId": f.student_id,
                "similarity": f.similarity,
                "decision": f.decision,
            }
            if include_embeddings and f.embedding is not None:
                payload["embedding"] = f.embedding.astype("float32").tolist()
            return payload

        return {
            "imageQuality": {
                "status": image_quality.status,
                "blurScore": image_quality.blur_score,
                "brightnessScore": image_quality.brightness_score,
                "message": image_quality.message,
            },
            "imageQualities": [
                {
                    "index": index,
                    "status": quality.status,
                    "blurScore": quality.blur_score,
                    "brightnessScore": quality.brightness_score,
                    "message": quality.message,
                }
                for index, quality in enumerate(qualities or [])
            ],
            "faces": [face_payload(f) for f in faces],
            "summary": {
                "detectedFaces": len(faces),
                "highConfidence": counts[HIGH],
                "needsReview": counts[REVIEW],
                "unknown": counts[UNKNOWN],
            },
        }

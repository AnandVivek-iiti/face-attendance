import logging
from dataclasses import dataclass

import numpy as np

from app.config import Settings
from app.errors import AppError
from app.models.registry import ModelRegistry
from app.services.detection import DetectionService, clamp_bbox
from app.services.quality_check import FaceQuality, ImageQuality, assess_face, assess_image
from app.services.recognition import (
    HIGH, POLICY_VERSION, REVIEW, UNKNOWN, Candidate, Decision, RecognitionService,
)
try:
    from app.utils.debug_crops import FaceCropWriter
except ModuleNotFoundError:  # optional debug helper; keep the service importable without it
    class FaceCropWriter:  # type: ignore[no-redef]
        def __init__(self, *args, **kwargs) -> None:
            pass

        def save(self, *args, **kwargs) -> None:
            pass
from app.utils.embedding_utils import EnrolledStudent, build_gallery
from app.utils.image_utils import decode_image

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
    quality_tier: str = "unknown"
    match_margin: float = 0.0
    quality: FaceQuality | None = None
    detail: Decision | None = None
    candidates: tuple[Candidate, ...] = ()
    cluster_id: str | None = None
    second_best: float | None = None

    @property
    def evidence(self) -> float:
        return self.similarity * (0.5 + 0.5 * self.face_quality)


class AttendanceService:
    def __init__(self, registry: ModelRegistry, settings: Settings):
        self._settings = settings
        self._registry = registry
        self._model_name = registry.model_name
        self._embedding_dim = registry.recognizer.embedding_dim
        self._detection = DetectionService(
            registry.detector,
            tiling=settings.detection_tiling,
            tile_side=settings.detection_tile_side,
            overlap=settings.detection_tile_overlap,
        )
        self._recognition = RecognitionService(registry.recognizer, settings)
        self._crops = FaceCropWriter(settings.save_face_crops, settings.crop_path)

    def analyze(self, images: list[np.ndarray], students: list[EnrolledStudent], request_id: str,
                include_embeddings: bool = False, excluded: tuple[dict, ...] = ()) -> dict:
        with self._registry.inference_slot():
            return self._analyze(images, students, request_id, include_embeddings, excluded)

    def analyze_encoded(self, payloads: list[bytes], students: list[EnrolledStudent], request_id: str,
                        include_embeddings: bool = False, excluded: tuple[dict, ...] = ()) -> dict:
        """Decode inside the inference slot: decoded pixels (up to MAX_IMAGE_PIXELS each) are the largest memory
        cost, and decoding before the slot let concurrent requests all hold them at once."""
        with self._registry.inference_slot():
            images = [decode_image(data, self._settings.max_image_pixels) for data in payloads]
            return self._analyze(images, students, request_id, include_embeddings, excluded)

    def _analyze(self, images: list[np.ndarray], students: list[EnrolledStudent], request_id: str,
                 include_embeddings: bool, excluded: tuple[dict, ...]) -> dict:
        qualities = [assess_image(image, self._settings) for image in images]
        usable = [i for i, quality in enumerate(qualities) if quality.status != "unusable"]
        image_quality = self._aggregate_image_quality(qualities)
        if not usable:
            return self._response(image_quality, [], include_embeddings, qualities, excluded=excluded)

        gallery = build_gallery(students)
        multi = len(images) > 1
        observations: list[Observation] = []
        for index in usable:
            observations.extend(
                self._analyze_image(images[index], index, multi, gallery, request_id, qualities[index],
                                    include_embeddings)
            )

        for observation in observations:
            self._save_crop(request_id, images[observation.image_index], observation)
        faces = self._deduplicate(observations)
        self._cluster_unknowns(faces)
        logger.info("request=%s images=%d usable=%d faces=%d returned=%d excluded_students=%d",
                    request_id, len(images), len(usable), len(observations), len(faces), len(excluded))
        return self._response(image_quality, faces, include_embeddings, qualities,
                              duplicates=len(observations) - len(faces), excluded=excluded)

    def _analyze_image(self, image: np.ndarray, index: int, multi: bool, gallery, request_id: str,
                       image_quality: ImageQuality, include_embeddings: bool = False) -> list[Observation]:
        detected = self._detection.detect(image)
        raw_faces = [f for f in detected if f.score >= self._settings.detection_threshold]
        if len(raw_faces) != len(detected):
            logger.info("request=%s image=%d dropped %d detections below DETECTION_THRESHOLD=%.2f",
                        request_id, index + 1, len(detected) - len(raw_faces), self._settings.detection_threshold)
        height, width = image.shape[:2]
        records = []
        for position, face in enumerate(raw_faces, start=1):
            aligned = self._recognition.align(image, face.keypoints)
            quality = assess_face(face, image, self._settings)
            face_id = f"img{index + 1}_face_{position:03d}" if multi else f"face_{position:03d}"
            records.append((face_id, face, aligned, quality))

        eligible = [r for r in records
                    if r[3].side >= self._settings.min_embed_face_side and r[3].tier != "reject"]
        embeddings = self._recognition.embed([r[2] for r in eligible])
        matches = self._recognition.match(embeddings, gallery)
        match_by_id = {r[0]: m for r, m in zip(eligible, matches)}
        embedding_by_id = {r[0]: e for r, e in zip(eligible, embeddings)}

        observations = []
        for face_id, face, _, quality in records:
            match = match_by_id.get(face_id)
            detail = self._recognition.decide(match, quality, image_quality)
            student_id = match.student_id if match is not None and detail.decision != UNKNOWN else None
            observations.append(self._observation(
                face_id, index, face, quality, student_id,
                match.similarity if match is not None else 0.0, detail, width, height,
                embedding_by_id.get(face_id), match.margin if match is not None else 0.0,
                match.candidates if match is not None else (),
                match.second_best if match is not None else None,
            ))
        return observations

    @staticmethod
    def _observation(face_id: str, index: int, face, quality: FaceQuality, student_id: str | None,
                     similarity: float, detail: Decision, width: int, height: int,
                     embedding: np.ndarray | None = None, match_margin: float = 0.0,
                     candidates: tuple[Candidate, ...] = (), second_best: float | None = None) -> Observation:
        return Observation(
            face_id=face_id,
            image_index=index,
            bbox=clamp_bbox(face.bbox, width, height),
            detection_confidence=round(face.score, 3),
            face_quality=quality.score,
            student_id=student_id,
            similarity=round(similarity, 4),
            decision=detail.decision,
            embedding=embedding,
            quality_tier=quality.tier,
            match_margin=round(float(match_margin), 4),
            quality=quality,
            detail=detail,
            candidates=candidates,
            second_best=None if second_best is None else round(float(second_best), 4),
        )

    @staticmethod
    def _deduplicate(observations: list[Observation]) -> list[Observation]:
        best_by_student: dict[str, Observation] = {}
        for observation in observations:
            if observation.student_id is None:
                continue
            # One entry per student for the whole request (matches the documented contract); within a single image
            # the roster assignment already guarantees this, so the real work is across images.
            key = observation.student_id
            current = best_by_student.get(key)
            if current is None or (DECISION_RANK[observation.decision], -observation.evidence) < (
                DECISION_RANK[current.decision], -current.evidence
            ):
                best_by_student[key] = observation
        kept_ids = {id(observation) for observation in best_by_student.values()}
        kept = [o for o in observations if o.student_id is None or id(o) in kept_ids]
        return sorted(kept, key=lambda o: (o.image_index, o.face_id))

    def _cluster_unknowns(self, faces: list[Observation]) -> None:
        """Give unknown faces that are probably one person seen in several photos the same clusterId. Nothing is dropped."""
        threshold = self._settings.unknown_cluster_threshold
        centres: list[np.ndarray] = []
        for face in faces:
            if face.student_id is not None or face.embedding is None:
                continue
            scores = [float(face.embedding @ c) for c in centres]
            if scores and max(scores) >= threshold:
                face.cluster_id = f"u{int(np.argmax(scores)) + 1}"
            else:
                centres.append(face.embedding)
                face.cluster_id = f"u{len(centres)}"

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

    def _policy(self) -> dict:
        s = self._settings
        return {
            "version": POLICY_VERSION,
            "highConfidenceThreshold": s.high_confidence_threshold,
            "reviewThreshold": s.review_threshold,
            "minMatchMargin": s.min_match_margin,
            "faceHighMinSide": s.face_high_min_side,
            "faceHighMinSharpness": s.face_high_min_sharpness,
            "faceHighMinFrontalness": s.face_high_min_frontalness,
            "faceHighMinQuality": s.face_high_min_quality,
            "requireGoodImageForHigh": s.high_requires_good_image,
        }

    def _response(self, image_quality: ImageQuality, faces: list[Observation], include_embeddings: bool = False,
                  qualities: list[ImageQuality] | None = None, duplicates: int = 0,
                  excluded: tuple[dict, ...] = ()) -> dict:
        counts = {HIGH: 0, REVIEW: 0, UNKNOWN: 0}
        review_reasons: dict[str, int] = {}
        for face in faces:
            counts[face.decision] += 1
            if face.decision == REVIEW and face.detail is not None:
                for reason in face.detail.reasons:
                    review_reasons[reason.code] = review_reasons.get(reason.code, 0) + 1

        def detail_payload(f: Observation) -> dict | None:
            if f.detail is None or f.quality is None:
                return None
            q = f.quality
            return {
                "identityPassed": f.detail.identity_passed,
                "qualityPassed": f.detail.quality_passed,
                "similarity": f.similarity,
                "margin": f.match_margin,
                "faceTier": q.tier,
                "faceSide": round(q.side, 1),
                "faceSharpness": round(q.sharpness, 3),
                "faceFrontalness": round(q.frontalness, 3),
                "faceVisibility": round(q.visibility, 3),
                "imageStatus": qualities[f.image_index].status if qualities else None,
                "reasons": [
                    {"code": r.code, "gate": r.gate, "message": r.message} for r in f.detail.reasons
                ],
            }

        def face_payload(f: Observation) -> dict:
            payload = {
                "faceId": f.face_id,
                "bbox": f.bbox,
                "detectionConfidence": f.detection_confidence,
                "faceQuality": f.face_quality,
                "qualityTier": f.quality_tier,
                "matchMargin": f.match_margin,
                "secondBestSimilarity": f.second_best,
                "clusterId": f.cluster_id,
                "studentId": f.student_id,
                "similarity": f.similarity,
                "decision": f.decision,
                "decisionDetail": detail_payload(f),
                "candidates": [{"studentId": c.student_id, "similarity": c.similarity} for c in f.candidates],
            }
            if include_embeddings and f.embedding is not None:
                payload["embedding"] = f.embedding.astype("float32").tolist()
            return payload

        return {
            "embeddingModel": self._model_name,
            "embeddingDim": self._embedding_dim,
            "excludedStudents": list(excluded),
            "policy": self._policy(),
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
                    "issues": list(quality.issues),
                }
                for index, quality in enumerate(qualities or [])
            ],
            "faces": [face_payload(f) for f in faces],
            "summary": {
                "detectedFaces": len(faces),
                "highConfidence": counts[HIGH],
                "needsReview": counts[REVIEW],
                "unknown": counts[UNKNOWN],
                "duplicateObservations": duplicates,
                "reviewReasons": review_reasons,
            },
        }

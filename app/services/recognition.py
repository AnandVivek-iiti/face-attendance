from dataclasses import dataclass

import numpy as np

from app.config import Settings
from app.models.face_recognizer import FaceRecognizer
from app.utils.embedding_utils import Gallery, student_similarity

HIGH = "high_confidence"
REVIEW = "needs_review"
UNKNOWN = "unknown"


@dataclass(frozen=True)
class Match:
    student_id: str | None
    similarity: float
    margin: float


class RecognitionService:
    def __init__(self, recognizer: FaceRecognizer, settings: Settings):
        self._recognizer = recognizer
        self._settings = settings

    def align(self, image: np.ndarray, keypoints: np.ndarray) -> np.ndarray:
        return self._recognizer.align(image, keypoints)

    def embed(self, aligned_crops: list[np.ndarray]) -> np.ndarray:
        return self._recognizer.embed(aligned_crops, flip=self._settings.embed_flip)

    def match(self, embeddings: np.ndarray, gallery: Gallery) -> list[Match]:
        if embeddings.shape[0] == 0:
            return []
        # A course's first session has no roster yet: every face is unmatched so the professor can build the list by hand.
        if gallery.matrix.shape[0] == 0:
            return [Match(None, 0.0, 0.0) for _ in range(embeddings.shape[0])]
        scores = student_similarity(embeddings, gallery, self._settings.gallery_pooling)
        assigned = self._assign_unique(scores)
        matches = []
        for face_index in range(scores.shape[0]):
            student_index = assigned.get(face_index)
            if student_index is None:
                claimed = set(assigned.values())
                free = [j for j in range(scores.shape[1]) if j not in claimed]
                best = float(scores[face_index, free].max()) if free else 0.0
                matches.append(Match(None, best, 0.0))
                continue
            similarity = float(scores[face_index, student_index])
            others = np.delete(scores[face_index], student_index)
            margin = similarity - float(others.max()) if others.size else 1.0
            matches.append(Match(gallery.student_ids[student_index], similarity, margin))
        return matches

    def _assign_unique(self, scores: np.ndarray) -> dict[int, int]:
        order = np.argsort(-scores, axis=None)
        faces_taken: set[int] = set()
        students_taken: set[int] = set()
        assigned: dict[int, int] = {}
        for flat in order:
            face_index, student_index = divmod(int(flat), scores.shape[1])
            if scores[face_index, student_index] < self._settings.review_threshold:
                break
            if face_index in faces_taken or student_index in students_taken:
                continue
            assigned[face_index] = student_index
            faces_taken.add(face_index)
            students_taken.add(student_index)
        return assigned

    def decide(self, match: Match, quality_tier: str) -> str:
        settings = self._settings
        if match.student_id is None or match.similarity < settings.review_threshold:
            return UNKNOWN
        if (
            match.similarity >= settings.quality_bypass_similarity
            and match.margin >= settings.quality_bypass_margin
        ):
            return HIGH
        if (
            quality_tier == "ok"
            and match.similarity >= settings.high_confidence_threshold
            and match.margin >= settings.min_match_margin
        ):
            return HIGH
        return REVIEW
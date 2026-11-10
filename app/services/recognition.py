from dataclasses import dataclass, field

import numpy as np

from app.config import Settings
from app.models.face_recognizer import FaceRecognizer
from app.services.quality_check import FaceQuality, ImageQuality
from app.services.reasons import IDENTITY, QUALITY, Reason
from app.utils.embedding_utils import Gallery, student_similarity

HIGH = "high_confidence"
REVIEW = "needs_review"
UNKNOWN = "unknown"

POLICY_VERSION = 2


@dataclass(frozen=True)
class Candidate:
    student_id: str
    similarity: float


@dataclass(frozen=True)
class Match:
    student_id: str | None
    similarity: float
    margin: float
    student_margin: float = 1.0
    face_margin: float = 1.0
    contested_with: str | None = None
    candidates: tuple[Candidate, ...] = field(default_factory=tuple)
    second_best: float | None = None
    invalid_embedding: bool = False


@dataclass(frozen=True)
class Decision:
    decision: str
    identity_passed: bool
    quality_passed: bool
    reasons: tuple[Reason, ...]


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
        # A non-finite or zero-norm query embedding must never reach the comparisons below: every `<` against NaN is
        # False, which would let it pass every threshold. Such faces are reported as unknown.
        norms = np.linalg.norm(np.nan_to_num(embeddings, nan=0.0, posinf=0.0, neginf=0.0), axis=1)
        valid = np.isfinite(embeddings).all(axis=1) & (norms > 1e-6)
        if gallery.matrix.shape[0] == 0:
            return [Match(None, 0.0, 0.0, invalid_embedding=not bool(ok)) for ok in valid]
        scores = student_similarity(np.where(valid[:, None], embeddings, 0.0).astype(np.float32), gallery,
                                    self._settings.gallery_pooling)
        scores = np.where(np.isfinite(scores), scores, -1.0)
        scores[~valid, :] = -1.0
        assigned = self._assign_unique(scores)
        owner_of_student = {student: face for face, student in assigned.items()}
        matches = [self._match_face(face, scores, gallery, assigned, owner_of_student)
                   for face in range(scores.shape[0])]
        return [m if ok else Match(None, 0.0, 0.0, invalid_embedding=True) for m, ok in zip(matches, valid)]

    def _match_face(self, face: int, scores: np.ndarray, gallery: Gallery, assigned: dict[int, int],
                    owner_of_student: dict[int, int]) -> Match:
        s = self._settings
        row = scores[face]
        ranked = np.argsort(-row)
        candidates = tuple(
            Candidate(gallery.student_ids[int(j)], round(float(row[j]), 4))
            for j in ranked[:s.candidate_count] if row[j] >= s.review_threshold
        )
        student = assigned.get(face)
        if student is None:
            best = int(ranked[0])
            best_similarity = float(row[best])
            owner = owner_of_student.get(best)
            contested = (
                owner is not None
                and best_similarity >= s.review_threshold
                and float(scores[owner, best]) - best_similarity <= s.contested_review_gap
            )
            runner_up = float(row[ranked[1]]) if ranked.size > 1 else None
            return Match(None, best_similarity, 0.0, candidates=candidates,
                         contested_with=gallery.student_ids[best] if contested else None, second_best=runner_up)
        similarity = float(row[student])
        other_students = np.delete(row, student)
        student_margin = similarity - float(other_students.max()) if other_students.size else 1.0
        other_faces = np.delete(scores[:, student], face)
        face_margin = similarity - float(other_faces.max()) if other_faces.size else 1.0
        return Match(gallery.student_ids[student], similarity, min(student_margin, face_margin),
                     student_margin, face_margin, candidates=candidates,
                     second_best=float(other_students.max()) if other_students.size else None)

    def _assign_unique(self, scores: np.ndarray) -> dict[int, int]:
        floor = self._settings.review_threshold
        order = np.argsort(-scores, axis=None)
        faces_taken: set[int] = set()
        students_taken: set[int] = set()
        assigned: dict[int, int] = {}
        for flat in order:
            face_index, student_index = divmod(int(flat), scores.shape[1])
            if scores[face_index, student_index] < floor:
                break
            if face_index in faces_taken or student_index in students_taken:
                continue
            assigned[face_index] = student_index
            faces_taken.add(face_index)
            students_taken.add(student_index)
        return assigned

    def decide(self, match: Match | None, face: FaceQuality, image: ImageQuality) -> Decision:
        s = self._settings
        if face.tier == "reject" or match is None:
            reasons = face.issues or (Reason("face_unreadable", QUALITY, "Face could not be read reliably."),)
            return Decision(UNKNOWN, False, False, tuple(reasons))

        if match.invalid_embedding:
            return Decision(UNKNOWN, False, False, (Reason("embedding_invalid", IDENTITY,
                            "The model returned an unusable embedding for this face."),))

        quality_reasons = list(face.issues) if face.tier != "ok" else []
        if face.tier != "ok" and not quality_reasons:
            quality_reasons.append(Reason("face_low_quality_score", QUALITY, "Face quality is below the automatic-confirmation tier."))
        if s.high_requires_good_image and image.status != "good":
            quality_reasons.append(self._image_reason(image))
        quality_passed = not quality_reasons

        if match.student_id is None and match.contested_with is None:
            return Decision(UNKNOWN, False, quality_passed, (self._below_review(match),) + tuple(quality_reasons))
        if match.student_id is None:
            reasons = (self._contested_reason(match),) + tuple(quality_reasons)
            return Decision(REVIEW, False, quality_passed, reasons)

        identity_reasons = self._identity_reasons(match)
        identity_passed = not identity_reasons
        if identity_passed and quality_passed:
            return Decision(HIGH, True, True, ())
        return Decision(REVIEW, identity_passed, quality_passed, tuple(identity_reasons) + tuple(quality_reasons))

    def _identity_reasons(self, match: Match) -> list[Reason]:
        s = self._settings
        found = []
        # Written as `not (x >= limit)` so a NaN can never pass.
        if not match.similarity >= s.high_confidence_threshold:
            found.append(Reason(
                "similarity_below_high", IDENTITY,
                f"Match score {match.similarity:.2f} is under the {s.high_confidence_threshold:.2f} needed for automatic confirmation.",
            ))
        if not match.student_margin >= s.min_match_margin:
            found.append(Reason(
                "close_runner_up", IDENTITY,
                f"Another student scores within {max(match.student_margin, 0.0):.2f} of this match (needs a gap of {s.min_match_margin:.2f}).",
            ))
        if not match.face_margin >= s.min_match_margin:
            found.append(Reason(
                "contested_by_other_face", IDENTITY,
                f"Another face in this photo scores within {max(match.face_margin, 0.0):.2f} for the same student (needs a gap of {s.min_match_margin:.2f}).",
            ))
        return found

    def _below_review(self, match: Match) -> Reason:
        s = self._settings
        if match.similarity <= 0.0:
            return Reason("no_roster_match", IDENTITY, "No enrolled student matches this face.")
        if match.similarity >= s.review_threshold:
            return Reason("claimed_by_stronger_face", IDENTITY,
                          "The closest student matches another face in this photo much better.")
        return Reason(
            "similarity_below_review", IDENTITY,
            f"Best match score {match.similarity:.2f} is under the {s.review_threshold:.2f} needed to suggest a student.",
        )

    @staticmethod
    def _contested_reason(match: Match) -> Reason:
        return Reason(
            "contested_by_other_face", IDENTITY,
            f"Closest student {match.contested_with} was claimed by a stronger face in this photo; "
            f"this face scores {match.similarity:.2f} for them.",
        )

    @staticmethod
    def _image_reason(image: ImageQuality) -> Reason:
        detail = ", ".join(image.issues).replace("_", " ") if image.issues else "overall quality"
        return Reason("image_quality_poor", QUALITY,
                      f"The photo is rated poor ({detail}), so matches in it need confirmation.")

import numpy as np

from app.config import Settings
from app.services.recognition import HIGH, REVIEW, UNKNOWN, Match, RecognitionService
from app.utils.embedding_utils import EnrolledStudent, build_gallery, l2_normalize


def service(**overrides):
    settings = Settings(high_confidence_threshold=0.6, review_threshold=0.2, min_match_margin=0.05,
                        auto_present_threshold=0.3, **overrides)
    return RecognitionService(recognizer=None, settings=settings)


def vec(*values):
    return l2_normalize(np.array([values], dtype=np.float32))[0]


def test_decision_thresholds():
    s = service()
    assert s.decide(Match("A", 0.8, 0.5), "ok") == HIGH
    assert s.decide(Match("A", 0.5, 0.5), "ok") == HIGH
    assert s.decide(Match("A", 0.3, 0.5), "ok") == HIGH
    assert s.decide(Match("A", 0.25, 0.5), "ok") == REVIEW
    assert s.decide(Match("A", 0.1, 0.5), "ok") == UNKNOWN
    assert s.decide(Match(None, 0.9, 0.0), "ok") == UNKNOWN


def test_thirty_percent_is_present_regardless_of_quality_or_margin():
    s = service()
    assert s.decide(Match("A", 0.31, 0.0), "low") == HIGH
    assert s.decide(Match("A", 0.31, 0.0), "reject") == HIGH
    assert s.decide(Match("A", 0.95, 0.01), "ok") == HIGH


def test_two_faces_cannot_claim_the_same_student():
    gallery = build_gallery([EnrolledStudent("A", vec(1, 0, 0)[None]), EnrolledStudent("B", vec(0, 1, 0)[None])])
    faces = np.stack([vec(1, 0.1, 0), vec(1, 0.3, 0)])
    matches = service().match(faces, gallery)
    claimed = [m.student_id for m in matches if m.student_id]
    assert len(claimed) == len(set(claimed))
    assert matches[0].student_id == "A"


def test_maximum_similarity_below_threshold_is_not_identified():
    gallery = build_gallery([EnrolledStudent("A", vec(1, 0, 0)[None])])
    matches = service().match(np.stack([vec(0, 1, 0)]), gallery)
    assert matches[0].student_id is None

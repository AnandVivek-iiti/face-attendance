"""Decision-policy tests that need no model: synthetic embeddings and hand-built quality records."""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

import numpy as np
import pytest

from app.config import Settings
from app.services.quality_check import FaceQuality, ImageQuality
from app.services.recognition import HIGH, REVIEW, UNKNOWN, RecognitionService
from app.utils.embedding_utils import EnrolledStudent, build_gallery, l2_normalize

DIM = 512
GOOD_FACE = FaceQuality(0.9, "ok", 100, 0.5, 0.5, 1.0, 1.0)
LOW_FACE = FaceQuality(0.6, "low", 35, 0.2, 0.5, 1.0, 1.0)
REJECT_FACE = FaceQuality(0.1, "reject", 10, 0.05, 0.5, 1.0, 1.0)
GOOD_IMAGE = ImageQuality("good", 200.0, 0.5, None)
POOR_IMAGE = ImageQuality("poor", 50.0, 0.5, "poor", issues=("blurry",))


def unit(seed):
    return l2_normalize(np.random.default_rng(seed).normal(size=(1, DIM)).astype(np.float32))


def blend(a, b, w):
    """Unit vector with cosine ~w to a (b random-orthogonal-ish)."""
    return l2_normalize(w * a + np.sqrt(1 - w * w) * b)


def pinned(**overrides):
    """Explicit values (init kwargs beat env vars and .env) so these tests never depend on the machine."""
    base = dict(high_confidence_threshold=0.55, review_threshold=0.40, min_match_margin=0.05,
                high_requires_good_image=False, face_reject_min_side=18, face_high_min_side=18, min_embed_face_side=18)
    return Settings(**{**base, **overrides})


@pytest.fixture
def svc():
    return RecognitionService(None, pinned())


def gallery(n=5):
    return build_gallery([EnrolledStudent(f"S{i}", unit(i)) for i in range(n)])


def decide(svc, query, g, face=GOOD_FACE, image=GOOD_IMAGE):
    m = svc.match(query, g)[0]
    return m, svc.decide(m, face, image)


def test_exact_match_is_high(svc):
    g = gallery()
    m, d = decide(svc, unit(2), g)
    assert (m.student_id, d.decision) == ("S2", HIGH)
    assert m.second_best is not None and m.second_best < 0.3


def test_unrelated_face_is_unknown(svc):
    _, d = decide(svc, unit(999), gallery())
    assert d.decision == UNKNOWN


def test_borderline_similarity_goes_to_review(svc):
    g = gallery()
    q = blend(unit(1), unit(500), 0.47)  # between review (0.40) and high (0.55)
    m, d = decide(svc, q, g)
    assert m.student_id == "S1" and d.decision == REVIEW
    assert "similarity_below_high" in [r.code for r in d.reasons]


def test_close_runner_up_goes_to_review(svc):
    a, b = unit(10), unit(11)
    g = build_gallery([EnrolledStudent("A", a), EnrolledStudent("B", blend(a, b, 0.97))])
    _, d = decide(svc, a, g)
    assert d.decision == REVIEW
    assert "close_runner_up" in [r.code for r in d.reasons]


def test_poor_image_blocks_high_only_when_configured():
    strict = RecognitionService(None, pinned(high_requires_good_image=True))
    _, d = decide(strict, unit(3), gallery(), image=POOR_IMAGE)
    assert d.decision == REVIEW and d.identity_passed and not d.quality_passed


def test_poor_image_default_still_needs_clean_face_and_identity(svc):
    g = gallery()
    assert decide(svc, unit(3), g, image=POOR_IMAGE)[1].decision == HIGH
    assert decide(svc, unit(3), g, face=LOW_FACE, image=POOR_IMAGE)[1].decision == REVIEW
    assert decide(svc, blend(unit(1), unit(500), 0.47), g, image=POOR_IMAGE)[1].decision == REVIEW


def test_low_quality_face_never_high(svc):
    _, d = decide(svc, unit(3), gallery(), face=LOW_FACE)
    assert d.decision == REVIEW


def test_rejected_face_is_unknown_even_with_perfect_similarity(svc):
    _, d = decide(svc, unit(3), gallery(), face=REJECT_FACE)
    assert d.decision == UNKNOWN


@pytest.mark.parametrize("bad", [np.nan, np.inf, -np.inf])
def test_non_finite_query_embedding_is_unknown(svc, bad):
    """Regression: NaN used to pass every `<` threshold test and come back high_confidence."""
    q = np.full((1, DIM), bad, dtype=np.float32)
    m, d = decide(svc, q, gallery())
    assert m.student_id is None and d.decision == UNKNOWN
    assert [r.code for r in d.reasons] == ["embedding_invalid"]


def test_zero_query_embedding_is_unknown(svc):
    m, d = decide(svc, np.zeros((1, DIM), np.float32), gallery())
    assert d.decision == UNKNOWN and m.student_id is None


def test_one_bad_row_does_not_affect_good_rows(svc):
    g = gallery()
    q = np.vstack([unit(1), np.full((1, DIM), np.nan, np.float32), unit(3)])
    ms = svc.match(q, g)
    ds = [svc.decide(m, GOOD_FACE, GOOD_IMAGE).decision for m in ms]
    assert [m.student_id for m in ms] == ["S1", None, "S3"]
    assert ds == [HIGH, UNKNOWN, HIGH]


def test_two_faces_same_student_neither_is_high(svc):
    a = unit(20)
    g = build_gallery([EnrolledStudent("A", a), EnrolledStudent("B", unit(21))])
    q = np.vstack([a, blend(a, unit(22), 0.97)])
    ms = svc.match(q, g)
    decisions = [svc.decide(m, GOOD_FACE, GOOD_IMAGE).decision for m in ms]
    assert HIGH not in decisions


def test_empty_gallery_everything_unknown(svc):
    g = build_gallery([])
    m, d = decide(svc, unit(1), g)
    assert d.decision == UNKNOWN and m.student_id is None


def test_stronger_face_claims_student_other_face_not_high(svc):
    a = unit(30)
    g = build_gallery([EnrolledStudent("A", a), EnrolledStudent("B", unit(31))])
    q = np.vstack([a, blend(a, unit(32), 0.62)])
    ms = svc.match(q, g)
    d1, d2 = (svc.decide(m, GOOD_FACE, GOOD_IMAGE) for m in ms)
    assert (ms[0].student_id, d1.decision) == ("A", HIGH)
    assert d2.decision != HIGH


def test_attendance_service_works_with_minimal_registry_and_accepts_bytes():
    """Test doubles that lack model_name / inference_slot must keep working; raw bytes are decoded inside analyze()."""
    import cv2
    from app.models.face_detector import RawFace
    from app.services.attendance import AttendanceService

    class Detector:
        def detect(self, image):
            return []

    class Recognizer:  # no embedding_dim attribute on purpose
        def embed(self, crops, flip=False):
            return np.zeros((0, DIM), np.float32)

    class Registry:
        detector = Detector()
        recognizer = Recognizer()

    service = AttendanceService(Registry(), pinned())
    ok, buf = cv2.imencode(".jpg", np.full((480, 640, 3), 128, np.uint8))
    body = service.analyze([buf.tobytes()], [], "req1")
    assert body["summary"]["detectedFaces"] == 0 and body["faces"] == []
    assert body["embeddingModel"] == pinned().insightface_model


def _face_of(width, height, image):
    from app.models.face_detector import RawFace
    x, y = 100.0, 100.0
    kp = np.array([[x + width * .3, y + height * .35], [x + width * .7, y + height * .35],
                   [x + width * .5, y + height * .55], [x + width * .35, y + height * .75],
                   [x + width * .65, y + height * .75]], dtype=np.float32)
    return RawFace(bbox=np.array([x, y, x + width, y + height], dtype=np.float32), score=0.95, keypoints=kp)


def test_25x18_face_is_not_rejected_or_flagged_small_but_17px_is_rejected():
    from app.services.quality_check import assess_face
    img = np.random.default_rng(3).integers(0, 255, (600, 600, 3), dtype=np.uint8)
    s = pinned()
    codes = lambda q: {r.code for r in q.issues}
    q = assess_face(_face_of(25, 18, img), img, s)
    assert q.side == 18 and not ({"face_too_small", "face_small"} & codes(q))
    assert "face_too_small" in codes(assess_face(_face_of(25, 17, img), img, s))
    # reported bbox is rounded to whole pixels, so 17.6 px counts as 18
    assert "face_too_small" not in codes(assess_face(_face_of(25, 17.6, img), img, s))


def test_embed_floor_may_not_exceed_reject_floor():
    with pytest.raises(ValueError):
        Settings(face_reject_min_side=18, min_embed_face_side=20)
    with pytest.raises(ValueError):
        Settings(face_reject_min_side=20, face_high_min_side=18)

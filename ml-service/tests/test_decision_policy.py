import numpy as np
import pytest

from app.api.schemas import AnalyzeResponse
from app.config import Settings
from app.models.face_detector import RawFace
from app.services.attendance import AttendanceService
from app.services.quality_check import FaceQuality, ImageQuality, assess_face, assess_image
from app.services.recognition import HIGH, REVIEW, UNKNOWN, Match, RecognitionService
from app.services.reasons import Reason
from app.utils.embedding_utils import EnrolledStudent, build_gallery, l2_normalize


def settings(**overrides) -> Settings:
    return Settings(_env_file=None, detection_tiling=False, **overrides)


def service(**overrides) -> RecognitionService:
    return RecognitionService(recognizer=None, settings=settings(**overrides))


def face(tier="ok", issues=()):
    return FaceQuality(0.8, tier, 90.0, 0.6, 0.5, 0.9, 1.0, tuple(issues))


GOOD_IMAGE = ImageQuality("good", 500.0, 0.5, None)
POOR_IMAGE = ImageQuality("poor", 60.0, 0.5, "poor", None, ("blurry",))


def codes(decision):
    return [r.code for r in decision.reasons]


def test_high_requires_identity_and_quality():
    d = service().decide(Match("s1", 0.70, 0.30, 0.30, 0.30), face(), GOOD_IMAGE)
    assert d.decision == HIGH
    assert d.identity_passed and d.quality_passed
    assert d.reasons == ()


def test_strong_identity_with_weak_face_quality_goes_to_review():
    low = face("low", [Reason("face_turned_away", "quality", "turned")])
    d = service().decide(Match("s1", 0.90, 0.50, 0.50, 0.50), low, GOOD_IMAGE)
    assert d.decision == REVIEW
    assert d.identity_passed and not d.quality_passed
    assert codes(d) == ["face_turned_away"]


def test_poor_photo_blocks_high_but_can_be_switched_off():
    match = Match("s1", 0.90, 0.50, 0.50, 0.50)
    blocked = service().decide(match, face(), POOR_IMAGE)
    assert blocked.decision == REVIEW and codes(blocked) == ["image_quality_poor"]
    relaxed = service(high_requires_good_image=False).decide(match, face(), POOR_IMAGE)
    assert relaxed.decision == HIGH


def test_similarity_between_review_and_high_is_review():
    d = service().decide(Match("s1", 0.47, 0.30, 0.30, 0.30), face(), GOOD_IMAGE)
    assert d.decision == REVIEW
    assert codes(d) == ["similarity_below_high"]
    assert not d.identity_passed and d.quality_passed


def test_close_runner_up_is_review_even_with_high_similarity():
    d = service().decide(Match("s1", 0.80, 0.02, 0.02, 0.60), face(), GOOD_IMAGE)
    assert d.decision == REVIEW and codes(d) == ["close_runner_up"]


def test_all_failures_are_reported_together():
    low = face("low", [Reason("face_soft", "quality", "soft")])
    d = service().decide(Match("s1", 0.45, 0.01, 0.01, 0.01), low, POOR_IMAGE)
    assert d.decision == REVIEW
    assert set(codes(d)) == {"similarity_below_high", "close_runner_up", "contested_by_other_face",
                             "face_soft", "image_quality_poor"}


def test_reject_tier_never_claims_a_student():
    bad = face("reject", [Reason("face_too_small", "quality", "tiny")])
    d = service().decide(Match("s1", 0.95, 0.5, 0.5, 0.5), bad, GOOD_IMAGE)
    assert d.decision == UNKNOWN and codes(d) == ["face_too_small"]
    assert service().decide(None, bad, GOOD_IMAGE).decision == UNKNOWN


def test_unmatched_face_is_unknown_with_reason():
    d = service().decide(Match(None, 0.20, 0.0), face(), GOOD_IMAGE)
    assert d.decision == UNKNOWN and codes(d) == ["similarity_below_review"]
    empty = service().decide(Match(None, 0.0, 0.0), face(), GOOD_IMAGE)
    assert codes(empty) == ["no_roster_match"]


def unit(*values):
    return l2_normalize(np.array([values], dtype=np.float32))[0]


def gallery_for(vectors: dict[str, np.ndarray]):
    return build_gallery([EnrolledStudent(sid, v[None, :]) for sid, v in vectors.items()])


def blend(a, b, weight):
    return l2_normalize((weight * a + (1 - weight) * b)[None, :])[0]


def test_match_reports_ranked_candidates_above_review_floor():
    a, b, c = np.eye(4)[0], np.eye(4)[1], np.eye(4)[2]
    gallery = gallery_for({"A": a, "B": b, "C": c})
    probe = blend(a, b, 0.6)
    match = service().match(np.stack([probe]), gallery)[0]
    assert match.student_id == "A"
    assert [x.student_id for x in match.candidates][:2] == ["A", "B"]
    assert match.student_margin == pytest.approx(match.similarity - float(probe @ b), abs=1e-6)


def test_two_close_faces_for_one_student_both_go_to_review():
    a, b = np.eye(4)[0], np.eye(4)[1]
    gallery = gallery_for({"A": a, "B": b})
    near_one = blend(a, b, 0.97)
    near_two = blend(a, b, 0.96)
    svc = service()
    matches = svc.match(np.stack([near_one, near_two]), gallery)
    decisions = [svc.decide(m, face(), GOOD_IMAGE) for m in matches]
    assert [d.decision for d in decisions] == [REVIEW, REVIEW]
    assert matches[0].student_id == "A" and matches[1].student_id is None
    assert matches[1].contested_with == "A"
    assert "contested_by_other_face" in codes(decisions[0])
    assert codes(decisions[1])[0] == "contested_by_other_face"
    assert [c.student_id for c in matches[1].candidates][0] == "A"


def test_far_weaker_second_face_is_unknown_not_review():
    a, b = np.eye(4)[0], np.eye(4)[1]
    gallery = gallery_for({"A": a, "B": b})
    strong = blend(a, b, 0.99)
    weak = blend(a, np.eye(4)[3], 0.5)
    svc = service()
    matches = svc.match(np.stack([strong, weak]), gallery)
    assert matches[0].student_id == "A"
    assert matches[1].student_id is None and matches[1].contested_with is None
    assert svc.decide(matches[1], face(), GOOD_IMAGE).decision == UNKNOWN


def test_empty_roster_returns_unmatched():
    gallery = build_gallery([])
    matches = service().match(np.stack([np.eye(4)[0]]), gallery)
    assert matches[0].student_id is None and matches[0].candidates == ()


def keypoints(side):
    cx, cy = 100.0, 100.0
    return np.array([[cx - side * 0.2, cy - side * 0.1], [cx + side * 0.2, cy - side * 0.1],
                     [cx, cy + side * 0.05], [cx - side * 0.15, cy + side * 0.25],
                     [cx + side * 0.15, cy + side * 0.25]], dtype=np.float32)


def raw_face(side, score=0.9, x=60.0, y=60.0):
    bbox = np.array([x, y, x + side, y + side], dtype=np.float32)
    return RawFace(bbox=bbox, score=score, keypoints=keypoints(side) + np.array([x - 60 + 0, y - 60 + 0], dtype=np.float32))


def textured_image(width=900, height=700, seed=1):
    rng = np.random.default_rng(seed)
    return rng.integers(30, 220, (height, width, 3), dtype=np.uint8)


def test_assess_face_lists_reasons_for_each_tier():
    s = settings()
    image = textured_image()
    tiny = assess_face(raw_face(10), image, s)
    assert tiny.tier == "reject" and "face_too_small" in [r.code for r in tiny.issues]
    small = assess_face(raw_face(30), image, s)
    assert small.tier == "low" and "face_small" in [r.code for r in small.issues]
    clear = assess_face(raw_face(120), image, s)
    assert clear.tier == "ok" and clear.issues == ()


def test_assess_image_reports_poor_causes():
    s = settings()
    assert assess_image(textured_image(), s).status == "good"
    small = assess_image(textured_image(400, 340), s)
    assert small.status == "poor" and small.issues == ("low_resolution",)


class FakeDetector:
    def __init__(self, faces):
        self._faces = faces

    def detect(self, image):
        return list(self._faces)


class FakeRecognizer:
    crop_size = 112
    embedding_dim = 4

    def __init__(self, vectors):
        self._vectors = vectors

    def align(self, image, keypoints):
        return np.zeros((112, 112, 3), dtype=np.uint8)

    def embed(self, crops, flip=False):
        return np.stack(self._vectors[: len(crops)]) if crops else np.zeros((0, 4), dtype=np.float32)


class FakeRegistry:
    def __init__(self, faces, vectors):
        self.detector = FakeDetector(faces)
        self.recognizer = FakeRecognizer(vectors)


def run_analyze(faces, vectors, roster, image=None, **overrides):
    cfg = settings(**overrides)
    attendance = AttendanceService(FakeRegistry(faces, vectors), cfg)
    students = [EnrolledStudent(sid, v[None, :]) for sid, v in roster.items()]
    images = [image if image is not None else textured_image()]
    return attendance.analyze(images, students, "req-test")


def test_end_to_end_payload_is_transparent_and_valid():
    a, b = np.eye(4)[0], np.eye(4)[1]
    faces = [raw_face(120, x=60, y=60), raw_face(120, x=300, y=60), raw_face(30, x=560, y=60), raw_face(10, x=700, y=60)]
    vectors = [blend(a, b, 0.99), blend(b, a, 0.99), blend(a, b, 0.7), a]
    result = run_analyze(faces, vectors, {"A": a, "B": b})
    parsed = AnalyzeResponse.model_validate(result)
    by_id = {f.faceId: f for f in parsed.faces}
    assert by_id["face_001"].decision == HIGH and by_id["face_001"].studentId == "A"
    assert by_id["face_002"].decision == HIGH and by_id["face_002"].studentId == "B"
    assert by_id["face_003"].decision == REVIEW
    assert by_id["face_003"].decisionDetail.qualityPassed is False
    assert any(r.code == "face_small" for r in by_id["face_003"].decisionDetail.reasons)
    assert by_id["face_004"].decision == UNKNOWN and by_id["face_004"].studentId is None
    assert by_id["face_004"].decisionDetail.reasons[0].code == "face_too_small"
    assert parsed.policy.version == 2 and parsed.policy.requireGoodImageForHigh is True
    assert parsed.summary.highConfidence == 2 and parsed.summary.needsReview == 1
    assert parsed.summary.reviewReasons.get("face_small") == 1


def test_poor_photo_sends_otherwise_clean_matches_to_review():
    a, b = np.eye(4)[0], np.eye(4)[1]
    blurry = textured_image(500, 420)
    result = run_analyze([raw_face(120)], [blend(a, b, 0.99)], {"A": a, "B": b}, image=blurry)
    face_out = result["faces"][0]
    assert face_out["decision"] == REVIEW
    assert face_out["decisionDetail"]["identityPassed"] is True
    assert [r["code"] for r in face_out["decisionDetail"]["reasons"]] == ["image_quality_poor"]

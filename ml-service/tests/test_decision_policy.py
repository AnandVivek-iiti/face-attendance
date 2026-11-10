"""Decision policy and matching, without loading any model (the recognizer is only needed for align/embed)."""
import numpy as np
import pytest

from app.config import Settings
from app.services.quality_check import FaceQuality, ImageQuality
from app.services.recognition import HIGH, REVIEW, UNKNOWN, Match, RecognitionService
from app.utils.embedding_utils import EnrolledStudent, build_gallery, l2_normalize


@pytest.fixture
def svc():
    return RecognitionService(recognizer=None, settings=Settings(api_key="k"))


def good_face(**kw):
    base = dict(score=0.8, tier="ok", side=90.0, sharpness=0.5, brightness=0.5, frontalness=0.9, visibility=1.0, issues=())
    base.update(kw)
    return FaceQuality(**base)


GOOD = ImageQuality("good", 200.0, 0.5, None)
POOR = ImageQuality("poor", 20.0, 0.5, "soft", issues=("blurry",))


def match(sim=0.7, margin=0.4, student="S1", **kw):
    return Match(student, sim, min(margin, kw.get("face_margin", 1.0)), margin, kw.get("face_margin", 1.0),
                 second_best=sim - margin)


def test_clean_strong_match_is_high(svc):
    assert svc.decide(match(), good_face(), GOOD).decision == HIGH


@pytest.mark.parametrize("sim", [0.54, 0.45, 0.40])
def test_similarity_below_high_threshold_needs_review(svc, sim):
    d = svc.decide(match(sim=sim), good_face(), GOOD)
    assert d.decision == REVIEW and any(r.code == "similarity_below_high" for r in d.reasons)


def test_small_margin_to_runner_up_needs_review(svc):
    d = svc.decide(match(sim=0.8, margin=0.02), good_face(), GOOD)
    assert d.decision == REVIEW and any(r.code == "close_runner_up" for r in d.reasons)


def test_contested_by_another_face_needs_review(svc):
    d = svc.decide(match(sim=0.8, margin=0.5, face_margin=0.01), good_face(), GOOD)
    assert d.decision == REVIEW and any(r.code == "contested_by_other_face" for r in d.reasons)


def test_high_similarity_but_poor_image_still_needs_review(svc):
    d = svc.decide(match(sim=0.95), good_face(), POOR)
    assert d.decision == REVIEW and any(r.code == "image_quality_poor" for r in d.reasons)


def test_low_quality_face_needs_review_and_rejected_face_is_unknown(svc):
    assert svc.decide(match(sim=0.95), good_face(tier="low"), GOOD).decision == REVIEW
    assert svc.decide(match(sim=0.95), good_face(tier="reject"), GOOD).decision == UNKNOWN


def test_below_review_threshold_is_unknown(svc):
    assert svc.decide(Match(None, 0.2, 0.0), good_face(), GOOD).decision == UNKNOWN


def test_nan_similarity_can_never_be_high(svc):
    assert svc.decide(match(sim=float("nan")), good_face(), GOOD).decision != HIGH


def test_invalid_embedding_is_unknown(svc):
    d = svc.decide(Match(None, 0.0, 0.0, invalid_embedding=True), good_face(), GOOD)
    assert d.decision == UNKNOWN and d.reasons[0].code == "embedding_invalid"


def _unit(seed, dim=512):
    return l2_normalize(np.random.default_rng(seed).normal(size=(1, dim)).astype(np.float32))


def test_matching_picks_right_student_and_reports_margin(svc):
    a, b = _unit(1), _unit(2)
    gallery = build_gallery([EnrolledStudent("A", a), EnrolledStudent("B", b)])
    (m,) = svc.match(a.copy(), gallery)
    assert m.student_id == "A" and m.similarity > 0.99 and m.margin > 0.5 and m.second_best is not None


def test_one_student_can_be_claimed_by_only_one_face(svc):
    a = _unit(1)
    gallery = build_gallery([EnrolledStudent("A", a), EnrolledStudent("B", _unit(2))])
    strong, weaker = a.copy(), l2_normalize(a + 0.15 * _unit(3))
    matches = svc.match(np.vstack([strong, weaker]), gallery)
    assert [m.student_id for m in matches].count("A") == 1


def test_nan_and_zero_query_embeddings_are_reported_invalid(svc):
    gallery = build_gallery([EnrolledStudent("A", _unit(1))])
    bad = np.array([[np.nan] * 512, [0.0] * 512], dtype=np.float32)
    assert all(m.invalid_embedding and m.student_id is None for m in svc.match(bad, gallery))


def test_empty_gallery_never_matches(svc):
    (m,) = svc.match(_unit(1), build_gallery([]))
    assert m.student_id is None

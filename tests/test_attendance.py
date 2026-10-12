from app.services.attendance import AttendanceService, Observation
from app.services.quality_check import ImageQuality


def obs(face_id, image, student, similarity, decision, quality=0.8):
    return Observation(face_id, image, [0, 0, 10, 10], 0.9, quality, student, similarity, decision)


def test_student_appears_once_with_strongest_observation():
    observations = [
        obs("img1_face_001", 0, "A", 0.62, "needs_review"),
        obs("img2_face_004", 1, "A", 0.71, "high_confidence"),
        obs("img2_face_005", 1, "B", 0.80, "high_confidence"),
        obs("img1_face_002", 0, None, 0.1, "unknown"),
    ]
    kept = AttendanceService._deduplicate(observations)
    ids = [o.student_id for o in kept if o.student_id]
    assert sorted(ids) == ["A", "B"]
    assert next(o for o in kept if o.student_id == "A").decision == "high_confidence"
    assert any(o.student_id is None for o in kept)


def test_equal_decisions_prefer_higher_evidence():
    kept = AttendanceService._deduplicate([
        obs("f1", 0, "A", 0.70, "high_confidence", quality=0.6),
        obs("f2", 1, "A", 0.68, "high_confidence", quality=0.95),
    ])
    assert [o.face_id for o in kept] == ["f2"]


def test_summary_is_consistent_and_schema_stable():
    quality = ImageQuality("good", 184.5, 0.78, None)
    body = AttendanceService._response(quality, [obs("face_001", 0, "A", 0.9, "high_confidence")])
    assert set(body) == {"imageQuality", "faces", "summary"}
    assert set(body["faces"][0]) == {"faceId", "bbox", "detectionConfidence", "faceQuality", "studentId", "similarity", "decision"}
    summary = body["summary"]
    assert summary["detectedFaces"] == summary["highConfidence"] + summary["needsReview"] + summary["unknown"]


def test_unusable_response_has_no_faces():
    body = AttendanceService._response(ImageQuality("unusable", 3.0, 0.5, "Image is too blurry to reliably identify students."), [])
    assert body["faces"] == [] and body["summary"]["detectedFaces"] == 0

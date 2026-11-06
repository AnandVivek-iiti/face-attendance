"""Model-backed regression tests for the current pipeline. Real faces: the library's bundled demo photo only, each face
compared only with ITSELF (original vs degraded copy). Everything else is synthetic. No cross-person matching."""
import numpy as np, pytest
from conftest import needs_model
from app.utils.embedding_utils import EnrolledStudent
import synth

pytestmark = needs_model

def unit(rng): v = rng.normal(size=(1, 512)).astype(np.float32); return v / np.linalg.norm(v)

def enrol_from(service, img):
    d = service._detection.detect(img)
    emb = service._recognition.embed([service._recognition.align(img, f.keypoints) for f in d])
    return [EnrolledStudent(f"s{i+1}", emb[i:i+1]) for i in range(len(d))], d

def run(service, imgs, students): return service.analyze(imgs, students, "t", include_embeddings=False)

def test_clear_photo_each_student_matched_once(service, group_photo):
    students, det = enrol_from(service, group_photo)
    r = run(service, [group_photo], students)
    ids = sorted(f["studentId"] for f in r["faces"] if f["studentId"])
    assert len(det) == 6 and ids == sorted(s.student_id for s in students)

@pytest.mark.parametrize("name", list(synth.PATTERNS))
def test_synthetic_patterns_produce_no_faces(service, name):
    assert run(service, [synth.PATTERNS[name]()], [])["faces"] == []

def test_tiny_and_dark_images_are_unusable(service):
    for img in (synth.tiny(), synth.dark()):
        r = run(service, [img], [])
        assert r["imageQuality"]["status"] == "unusable" and r["faces"] == []

@pytest.mark.parametrize("make", [lambda i: synth.downscale(i, .5), lambda i: synth.darken(i, .25),
                                  lambda i: synth.jpeg(i, 20), lambda i: synth.blur(i, 2)])
def test_degraded_copies_never_match_a_different_student(service, group_photo, make):
    students, det = enrol_from(service, group_photo)
    img = make(group_photo); scale = img.shape[1] / group_photo.shape[1]
    for f in run(service, [img], students)["faces"]:
        if not f["studentId"]: continue
        x1, y1, x2, y2 = f["bbox"]; cx, cy = (x1 + x2) / 2 / scale, (y1 + y2) / 2 / scale
        owner = [i for i, d in enumerate(det) if d.bbox[0] <= cx <= d.bbox[2] and d.bbox[1] <= cy <= d.bbox[3]]
        assert owner and f"s{owner[0]+1}" == f["studentId"]

def test_heavy_blur_is_never_auto_confirmed(service, group_photo):
    students, _ = enrol_from(service, group_photo)
    assert all(f["decision"] != "high_confidence" for f in run(service, [synth.blur(group_photo, 6)], students)["faces"])

def test_mildly_soft_photo_is_not_discarded_wholesale(service, group_photo):
    students, _ = enrol_from(service, group_photo)
    r = run(service, [synth.blur(group_photo, 3)], students)      # faces still self-match at ~0.64-0.76
    assert r["imageQuality"]["status"] != "unusable" and len(r["faces"]) >= 5
    assert any(f["studentId"] for f in r["faces"])
    assert all(f["decision"] != "high_confidence" for f in r["faces"])   # soft photo: review, not auto-present

def test_a_student_has_at_most_one_face_per_photo(service, group_photo):
    students, _ = enrol_from(service, group_photo)
    r = run(service, [group_photo, synth.downscale(group_photo, .8)], students)
    ids = [f["studentId"] for f in r["faces"] if f["studentId"]]
    assert all(ids.count(s) <= 2 for s in set(ids))

def test_unknown_faces_repeated_across_photos_are_grouped(service, group_photo):
    r = run(service, [group_photo, synth.downscale(group_photo, .8)], [])
    unknown = [f for f in r["faces"] if f["studentId"] is None]
    clusters = {f.get("clusterId") for f in unknown}
    assert len(unknown) == 12 and None not in clusters and len(clusters) == 6      # 12 sightings = 6 people

def test_wrong_reference_embeddings_do_not_match(service, group_photo):
    rng = np.random.default_rng(3)
    wrong = [EnrolledStudent(f"s{i}", unit(rng)) for i in range(6)]
    assert all(f["studentId"] is None for f in run(service, [group_photo], wrong)["faces"])

def test_roster_of_50_with_only_6_present(service, group_photo):
    real, _ = enrol_from(service, group_photo); rng = np.random.default_rng(4)
    pad = [EnrolledStudent(f"x{i}", unit(rng)) for i in range(44)]
    matched = {f["studentId"] for f in run(service, [group_photo], real + pad)["faces"] if f["studentId"]}
    assert matched == {s.student_id for s in real}

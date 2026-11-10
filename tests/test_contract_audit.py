"""API-level contract tests with the real buffalo_l model. Skipped unless RUN_MODEL_TESTS=1 (downloads ~280 MB)."""
import json
import os
import pathlib
import sys

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

pytestmark = pytest.mark.skipif(os.environ.get("RUN_MODEL_TESTS") != "1", reason="set RUN_MODEL_TESTS=1 to run model tests")

KEY = {"X-API-Key": "test"}


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    os.environ.setdefault("API_KEY", "test")
    os.environ.setdefault("WARMUP", "false")
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def group_photo():
    import insightface
    return pathlib.Path(insightface.__file__).parent / "data" / "images" / "t1.jpg"


def post(client, photo, students, **data):
    files = [("images", ("p.jpg", photo.read_bytes(), "image/jpeg"))]
    return client.post("/analyze-classroom", headers=KEY, files=files,
                       data={"students": json.dumps(students), **data})


@pytest.fixture(scope="module")
def embeddings(client, group_photo):
    r = post(client, group_photo, [], allowEmptyStudents="true", includeEmbeddings="true")
    assert r.status_code == 200
    return [f["embedding"] for f in r.json()["faces"]]


def test_response_states_model_and_dim(client, group_photo, embeddings):
    j = post(client, group_photo, [{"studentId": "S0", "embedding": embeddings[0]}]).json()
    assert j["embeddingModel"] == "buffalo_l" and j["embeddingDim"] == 512
    assert all("secondBestSimilarity" in f for f in j["faces"])


def test_high_confidence_obeys_policy_contract(client, group_photo, embeddings):
    st = [{"studentId": f"S{i}", "embedding": e} for i, e in enumerate(embeddings)]
    j = post(client, group_photo, st).json()
    pol = j["policy"]
    for f in j["faces"]:
        if f["decision"] == "high_confidence":
            d = f["decisionDetail"]
            assert f["studentId"] and f["similarity"] >= pol["highConfidenceThreshold"]
            assert f["matchMargin"] >= pol["minMatchMargin"] and d["identityPassed"] and d["qualityPassed"]
    s = j["summary"]
    assert s["detectedFaces"] == s["highConfidence"] + s["needsReview"] + s["unknown"] == len(j["faces"])


def test_student_listed_once_per_request(client, group_photo, embeddings):
    st = [{"studentId": f"S{i}", "embedding": e} for i, e in enumerate(embeddings)]
    files = [("images", ("a.jpg", group_photo.read_bytes(), "image/jpeg")),
             ("images", ("b.jpg", group_photo.read_bytes(), "image/jpeg"))]
    j = client.post("/analyze-classroom", headers=KEY, files=files, data={"students": json.dumps(st)}).json()
    ids = [f["studentId"] for f in j["faces"] if f["studentId"]]
    assert len(ids) == len(set(ids)) == 6
    assert j["summary"]["duplicateObservations"] == 6


def test_model_mismatch_top_level_is_409(client, group_photo, embeddings):
    r = post(client, group_photo, [{"studentId": "S0", "embedding": embeddings[0]}], embeddingModel="other")
    assert r.status_code == 409


def test_per_student_model_mismatch_is_excluded_not_compared(client, group_photo, embeddings):
    st = [{"studentId": "S0", "embedding": embeddings[0], "embeddingModel": "antelopev2"},
          {"studentId": "S1", "embedding": embeddings[1], "embeddingModel": "buffalo_l"}]
    j = post(client, group_photo, st).json()
    assert [e["studentId"] for e in j["excludedStudents"]] == ["S0"]
    assert "S0" not in [f["studentId"] for f in j["faces"]]
    assert "S1" in [f["studentId"] for f in j["faces"]]


@pytest.mark.parametrize("bad", [[0.0] * 512, [1.0] * 100])
def test_invalid_gallery_embedding_rejected(client, group_photo, bad):
    assert post(client, group_photo, [{"studentId": "S0", "embedding": bad}]).status_code == 422


def test_no_face_image_has_no_faces(client):
    import cv2, numpy as np
    ok, buf = cv2.imencode(".jpg", np.full((480, 640, 3), 128, np.uint8))
    files = [("images", ("g.jpg", buf.tobytes(), "image/jpeg"))]
    r = client.post("/analyze-classroom", headers=KEY, files=files,
                    data={"students": "[]", "allowEmptyStudents": "true"})
    assert r.status_code == 200 and r.json()["summary"]["detectedFaces"] == 0


def test_api_key_required(client, group_photo):
    r = client.post("/analyze-classroom", files=[("images", ("p.jpg", group_photo.read_bytes(), "image/jpeg"))],
                    data={"students": "[]"})
    assert r.status_code == 401


def test_generate_embedding_rejects_multiple_faces(client, group_photo):
    r = client.post("/generate-embedding", headers=KEY, files={"image": ("p.jpg", group_photo.read_bytes(), "image/jpeg")})
    assert r.status_code == 422 and r.json()["error"]["code"] in {"MULTIPLE_FACES_DETECTED", "FACE_TOO_SMALL", "FACE_POOR_QUALITY"}


def test_every_face_at_or_above_reject_floor_is_actually_embedded(client, group_photo):
    """Regression: faces between FACE_REJECT_MIN_SIDE and MIN_EMBED_FACE_SIDE used to come back unknown with similarity 0."""
    import cv2, numpy as np
    from app.config import Settings
    s = Settings()
    src = cv2.imread(str(group_photo))
    small = cv2.resize(src, None, fx=0.19, fy=0.19, interpolation=cv2.INTER_AREA)
    bg = cv2.GaussianBlur(np.random.default_rng(0).integers(60, 200, (960, 1280, 3), dtype=np.uint8), (0, 0), 3)
    bg[100:100 + small.shape[0], 100:100 + small.shape[1]] = small
    ok, buf = cv2.imencode(".jpg", bg, [cv2.IMWRITE_JPEG_QUALITY, 92])
    files = [("images", ("t.jpg", buf.tobytes(), "image/jpeg"))]
    emb = post(client, group_photo, [], allowEmptyStudents="true", includeEmbeddings="true").json()["faces"]
    st = [{"studentId": f"S{i}", "embedding": f["embedding"]} for i, f in enumerate(emb)]
    j = client.post("/analyze-classroom", headers=KEY, files=files, data={"students": json.dumps(st)}).json()
    for f in j["faces"]:
        b = f["bbox"]
        if min(b[2] - b[0], b[3] - b[1]) >= s.face_reject_min_side:
            assert f["similarity"] > 0 or f["qualityTier"] == "reject", f

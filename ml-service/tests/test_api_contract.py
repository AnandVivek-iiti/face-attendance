"""HTTP contract against the real model (skipped if the model cannot be loaded)."""
import json
import os

import numpy as np
import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("INSIGHTFACE_ROOT", os.path.expanduser("~/.insightface"))


@pytest.fixture(scope="module")
def client():
    try:
        from app.main import app
        with TestClient(app) as c:
            yield c
    except Exception as exc:  # model unavailable offline
        pytest.skip(f"ML model could not be loaded: {exc}")


H = {"X-API-Key": "testkey"}
JPEG = bytes([0xFF, 0xD8, 0xFF, 0xE0]) + b"\x00" * 64


def test_health_is_open_and_names_model(client):
    body = client.get("/health").json()
    assert body["embeddingModel"] and body["embeddingDim"] > 0


def test_analyze_requires_api_key(client):
    r = client.post("/analyze-classroom", files={"images": ("a.jpg", JPEG, "image/jpeg")}, data={"students": "[]"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "UNAUTHORIZED"


def test_model_mismatch_is_409(client):
    r = client.post("/analyze-classroom", headers=H, files={"images": ("a.jpg", JPEG, "image/jpeg")},
                    data={"students": "[]", "allowEmptyStudents": "true", "embeddingModel": "other"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "EMBEDDING_MODEL_MISMATCH"


def test_wrong_dimension_embedding_is_rejected(client):
    students = json.dumps([{"studentId": "S1", "embedding": [0.1] * 10}])
    r = client.post("/analyze-classroom", headers=H, files={"images": ("a.jpg", JPEG, "image/jpeg")}, data={"students": students})
    assert r.status_code == 422 and r.json()["error"]["code"] == "INVALID_EMBEDDING"


def test_non_finite_and_zero_embeddings_are_rejected(client):
    dim = client.get("/health").json()["embeddingDim"]
    for vec in ([0.0] * dim, [1e999] * dim):
        students = json.dumps([{"studentId": "S1", "embedding": vec}]).replace("Infinity", "1e999")
        r = client.post("/analyze-classroom", headers=H, files={"images": ("a.jpg", JPEG, "image/jpeg")}, data={"students": students})
        assert r.status_code == 422


def test_empty_gallery_needs_explicit_flag(client):
    r = client.post("/analyze-classroom", headers=H, files={"images": ("a.jpg", JPEG, "image/jpeg")}, data={"students": "[]"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "INVALID_STUDENTS"


def test_garbage_image_is_rejected_not_crashed(client):
    r = client.post("/generate-embedding", headers=H, files={"image": ("a.jpg", JPEG, "image/jpeg")})
    assert r.status_code in (400, 415, 422)


def _valid_jpeg():
    import cv2
    rng = np.random.default_rng(0)
    ok, buf = cv2.imencode(".jpg", rng.integers(60, 200, (480, 640, 3), dtype=np.uint8))
    assert ok
    return buf.tobytes()


def test_per_student_model_mismatch_is_excluded_not_compared(client):
    dim = client.get("/health").json()["embeddingDim"]
    unit = (np.ones(dim) / np.sqrt(dim)).tolist()
    students = json.dumps([{"studentId": "OLD", "embedding": unit, "embeddingModel": "old_model"}])
    r = client.post("/analyze-classroom", headers=H, files={"images": ("a.jpg", _valid_jpeg(), "image/jpeg")},
                    data={"students": students, "allowEmptyStudents": "true"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert [e["studentId"] for e in body["excludedStudents"]] == ["OLD"]
    assert body["excludedStudents"][0]["code"] == "EMBEDDING_MODEL_MISMATCH"
    assert all(f["studentId"] != "OLD" for f in body["faces"])


def test_every_student_on_another_model_without_flag_is_409(client):
    dim = client.get("/health").json()["embeddingDim"]
    unit = (np.ones(dim) / np.sqrt(dim)).tolist()
    students = json.dumps([{"studentId": "OLD", "embedding": unit, "embeddingModel": "old_model"}])
    r = client.post("/analyze-classroom", headers=H, files={"images": ("a.jpg", _valid_jpeg(), "image/jpeg")}, data={"students": students})
    assert r.status_code == 409

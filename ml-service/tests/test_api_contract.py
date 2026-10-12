import json
from types import SimpleNamespace

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import app


class StubAttendance:
    def analyze(self, images, students, request_id, include_embeddings=False):
        face = {"faceId": "face_001", "bbox": [1, 2, 3, 4], "detectionConfidence": 0.98, "faceQuality": 0.91,
                "studentId": students[0].student_id, "similarity": 0.94, "decision": "high_confidence"}
        if include_embeddings:
            face["embedding"] = [0.1] * 512
        return {
            "imageQuality": {"status": "good", "blurScore": 184.5, "brightnessScore": 0.78, "message": None},
            "faces": [face],
            "summary": {"detectedFaces": 1, "highConfidence": 1, "needsReview": 0, "unknown": 0},
        }


@pytest.fixture
def client():
    app.state.settings = Settings(api_key="secret")
    app.state.registry = SimpleNamespace(model_name="buffalo_l", active_providers=["CPUExecutionProvider"],
                                         recognizer=SimpleNamespace(embedding_dim=512))
    app.state.attendance = StubAttendance()
    return TestClient(app)


def jpeg():
    ok, buffer = cv2.imencode(".jpg", np.full((64, 64, 3), 100, dtype=np.uint8))
    return buffer.tobytes()


def students(embedding=None):
    return json.dumps([{"studentId": "ME23001", "embedding": embedding or [0.1] * 512}])


def post(client, **kwargs):
    headers = kwargs.pop("headers", {"X-API-Key": "secret"})
    return client.post("/analyze-classroom", files=[("images", ("a.jpg", jpeg(), "image/jpeg"))],
                       data=kwargs.get("data", {"students": students()}), headers=headers)


def test_response_matches_contract_and_hides_embeddings(client):
    response = post(client)
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"imageQuality", "faces", "summary"}
    assert "embedding" not in response.text


def test_embeddings_returned_only_when_requested(client):
    response = post(client, data={"students": students(), "includeEmbeddings": "true"})
    assert response.status_code == 200
    body = response.json()
    assert "embedding" in body["faces"][0]
    assert len(body["faces"][0]["embedding"]) == 512

    off = post(client)
    assert "embedding" not in off.json()["faces"][0]


def test_api_key_enforced(client):
    assert post(client, headers={}).status_code == 401


def test_health_is_open(client):
    assert client.get("/health").json()["embeddingModel"] == "buffalo_l"


def test_embedding_model_mismatch_rejected(client):
    response = post(client, data={"students": students(), "embeddingModel": "other"})
    assert response.status_code == 409


def test_wrong_dimension_rejected_without_echoing_input(client):
    response = post(client, data={"students": students([0.123456] * 8)})
    assert response.status_code == 422
    assert "0.123456" not in response.text


def test_missing_students_field_does_not_echo_input(client):
    response = client.post("/analyze-classroom", files=[("images", ("a.jpg", jpeg(), "image/jpeg"))],
                           headers={"X-API-Key": "secret"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_REQUEST"

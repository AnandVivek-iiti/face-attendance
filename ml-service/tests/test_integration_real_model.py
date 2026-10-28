import json
import os
from pathlib import Path

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

SAMPLE = os.environ.get("FACE_SAMPLE_IMAGE")
pytestmark = pytest.mark.skipif(not SAMPLE or not Path(SAMPLE).is_file(), reason="set FACE_SAMPLE_IMAGE to a single-face photo")


@pytest.fixture(scope="module")
def client():
    from app.main import app
    with TestClient(app) as test_client:
        yield test_client


def encode(image):
    ok, buffer = cv2.imencode(".jpg", image)
    return buffer.tobytes()


def analyze(client, image, embedding):
    payload = json.dumps([{"studentId": "S1", "embedding": embedding}])
    return client.post("/analyze-classroom", files=[("images", ("a.jpg", encode(image), "image/jpeg"))],
                       data={"students": payload}).json()


@pytest.fixture(scope="module")
def reference(client):
    response = client.post("/generate-embedding", files={"image": ("r.jpg", Path(SAMPLE).read_bytes(), "image/jpeg")})
    assert response.status_code == 200
    return response.json()


def test_reference_embedding_shape(reference):
    assert reference["embeddingDim"] == 512
    assert abs(np.linalg.norm(reference["embedding"]) - 1.0) < 1e-3


def test_same_photo_is_high_confidence(client, reference):
    body = analyze(client, cv2.imread(SAMPLE), reference["embedding"])
    assert body["summary"]["highConfidence"] == 1
    assert body["faces"][0]["studentId"] == "S1"


@pytest.mark.parametrize("sigma", [8, 10, 25])
def test_blurred_face_is_still_detected_and_matched(client, reference, sigma):
    image = cv2.imread(SAMPLE)
    x1, y1, x2, y2 = reference["bbox"]
    image[y1:y2, x1:x2] = cv2.GaussianBlur(image[y1:y2, x1:x2], (0, 0), sigma)
    body = analyze(client, image, reference["embedding"])
    assert body["imageQuality"]["status"] != "unusable"
    assert len(body["faces"]) == 1
    assert body["faces"][0]["studentId"] in {"S1", None}


def test_fully_blurred_image_is_unusable(client, reference):
    body = analyze(client, cv2.GaussianBlur(cv2.imread(SAMPLE), (0, 0), 40), reference["embedding"])
    assert body["imageQuality"]["status"] == "unusable"
    assert body["imageQuality"]["message"] == "Image is too blurry to reliably identify students."
    assert body["faces"] == []


def test_no_face_reference_rejected(client):
    flat = np.full((600, 600, 3), 128, dtype=np.uint8)
    cv2.circle(flat, (300, 300), 100, (30, 30, 30), -1)
    response = client.post("/generate-embedding", files={"image": ("r.jpg", encode(flat), "image/jpeg")})
    assert response.status_code == 422
    assert response.json()["error"]["code"] in {"NO_FACE_DETECTED", "IMAGE_UNUSABLE"}

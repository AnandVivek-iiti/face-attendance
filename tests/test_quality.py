import cv2
import numpy as np

from app.config import Settings
from app.models import quality_model as qm
from app.services.quality_check import assess_image


def textured(size=(900, 1200), seed=0):
    rng = np.random.default_rng(seed)
    base = rng.integers(0, 255, size=(*size, 3), dtype=np.uint8)
    return cv2.GaussianBlur(base, (0, 0), 0.8)


def test_sharp_image_is_good():
    assert assess_image(textured(), Settings()).status == "good"


def test_blurred_image_is_unusable_with_expected_message():
    result = assess_image(cv2.GaussianBlur(textured(), (0, 0), 12), Settings())
    assert result.status == "unusable"
    assert result.message == "Image is too blurry to reliably identify students."


def test_dark_and_tiny_images_are_unusable():
    assert assess_image((textured() * 0.03).astype(np.uint8), Settings()).status == "unusable"
    assert assess_image(textured((200, 200)), Settings()).status == "unusable"


def test_frontalness_and_visibility():
    frontal = np.array([[30, 40], [70, 40], [50, 55], [35, 75], [65, 75]], dtype=np.float32)
    profile = frontal.copy()
    profile[2, 0] = 85
    assert qm.frontalness(frontal) > 0.9
    assert qm.frontalness(profile) == 0.0
    assert qm.visible_fraction(np.array([-50, 0, 50, 100]), 200, 200) == 0.5


def test_exposure_score_shape():
    assert qm.exposure_score(0.5) == 1.0
    assert qm.exposure_score(0.05) == 0.0
    assert qm.exposure_score(0.97) == 0.0


def structured(size=(600, 600), seed=1):
    rng = np.random.default_rng(seed)
    shading = cv2.GaussianBlur(rng.normal(0, 1, size).astype(np.float32), (0, 0), 40)
    shading = 140 + 60 * shading / max(float(np.abs(shading).max()), 1e-6)
    detail = cv2.GaussianBlur(rng.normal(0, 1, size).astype(np.float32), (0, 0), 0.8) * 25
    gray = np.clip(shading + detail, 0, 255).astype(np.uint8)
    return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)


def face_on(box=(100, 100, 500, 500)):
    from app.models.face_detector import RawFace
    x1, y1, x2, y2 = box
    width, height = x2 - x1, y2 - y1
    keypoints = np.array([[x1 + 0.3 * width, y1 + 0.4 * height], [x1 + 0.7 * width, y1 + 0.4 * height],
                          [x1 + 0.5 * width, y1 + 0.55 * height], [x1 + 0.35 * width, y1 + 0.75 * height],
                          [x1 + 0.65 * width, y1 + 0.75 * height]], dtype=np.float32)
    return RawFace(np.array(box, dtype=np.float32), 0.95, keypoints)


def test_sharpness_decreases_monotonically_with_blur():
    from app.models.quality_model import reblur_sharpness
    gray = cv2.cvtColor(structured(), cv2.COLOR_BGR2GRAY)
    values = [reblur_sharpness(cv2.GaussianBlur(gray, (0, 0), s) if s else gray) for s in (0, 2, 4, 8, 16)]
    assert values == sorted(values, reverse=True)
    assert values[0] > 0.8 and values[-1] < 0.12


def test_blur_degrades_large_face_tier():
    from app.services.quality_check import assess_face
    sharp = structured()
    tiers = [assess_face(face_on(), cv2.GaussianBlur(sharp, (0, 0), s) if s else sharp, Settings()).tier for s in (0, 8, 24)]
    assert tiers == ["ok", "low", "reject"]


def test_small_face_cannot_be_ok():
    from app.services.quality_check import assess_face
    sharp = structured()
    assert assess_face(face_on((100, 100, 130, 130)), sharp, Settings()).tier in {"low", "reject"}
    assert assess_face(face_on((100, 100, 115, 115)), sharp, Settings()).tier == "reject"

import cv2
import numpy as np

from app.config import Settings
from app.models.face_detector import RawFace
from app.services.quality_check import assess_face


def _textured_image(size=240):
    rng = np.random.default_rng(42)
    gray = rng.integers(40, 220, (size, size), dtype=np.uint8)
    gray = cv2.GaussianBlur(gray, (3, 3), 0.4)
    return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)


def _face(side):
    x1 = y1 = 80
    x2 = y2 = x1 + side
    points = np.array([
        [x1 + side * 0.30, y1 + side * 0.38],
        [x1 + side * 0.70, y1 + side * 0.38],
        [x1 + side * 0.50, y1 + side * 0.55],
        [x1 + side * 0.35, y1 + side * 0.75],
        [x1 + side * 0.65, y1 + side * 0.75],
    ], dtype=np.float32)
    return RawFace(np.array([x1, y1, x2, y2], dtype=np.float32), 0.99, points)


def test_clear_28_to_39_pixel_face_can_pass_resolution_gate():
    quality = assess_face(_face(32), _textured_image(), Settings())
    assert quality.side == 32
    assert "face_resolution_below_auto_accept_minimum" not in quality.reasons
    assert quality.tier == "ok"


def test_faces_below_hard_reject_size_are_still_rejected():
    quality = assess_face(_face(18), _textured_image(), Settings())
    assert quality.tier == "reject"
    assert "face_too_small_to_identify" in quality.reasons

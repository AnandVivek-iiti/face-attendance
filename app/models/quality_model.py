import cv2
import numpy as np


def laplacian_variance(gray: np.ndarray) -> float:
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def _total_variation(values: np.ndarray) -> float:
    return float(np.abs(np.diff(values, axis=0)).sum() + np.abs(np.diff(values, axis=1)).sum())


def reblur_sharpness(gray: np.ndarray) -> float:
    if min(gray.shape) < 4:
        return 0.0
    values = gray.astype(np.float32)
    sigma = max(0.8, min(values.shape) * 0.02)
    original = _total_variation(values)
    if original <= 0:
        return 0.0
    softened = _total_variation(cv2.GaussianBlur(values, (0, 0), sigma))
    return float(np.clip((original - softened) / original, 0.0, 1.0))


def mean_brightness(gray: np.ndarray) -> float:
    return float(gray.mean()) / 255.0


def frontalness(keypoints: np.ndarray) -> float:
    left_eye, right_eye, nose = keypoints[0], keypoints[1], keypoints[2]
    eye_distance = float(np.linalg.norm(right_eye - left_eye))
    if eye_distance < 1e-6:
        return 0.0
    offset = abs(float(nose[0] - (left_eye[0] + right_eye[0]) / 2.0)) / eye_distance
    return float(np.clip(1.0 - offset / 0.5, 0.0, 1.0))


def visible_fraction(bbox: np.ndarray, width: int, height: int) -> float:
    x1, y1, x2, y2 = (float(v) for v in bbox)
    area = max((x2 - x1) * (y2 - y1), 1e-6)
    inside_w = max(0.0, min(x2, width) - max(x1, 0.0))
    inside_h = max(0.0, min(y2, height) - max(y1, 0.0))
    return float(np.clip(inside_w * inside_h / area, 0.0, 1.0))


def exposure_score(brightness: float) -> float:
    if 0.25 <= brightness <= 0.75:
        return 1.0
    if brightness < 0.25:
        return float(np.clip((brightness - 0.05) / 0.20, 0.0, 1.0))
    return float(np.clip((0.95 - brightness) / 0.20, 0.0, 1.0))

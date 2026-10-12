from dataclasses import dataclass

import numpy as np

from app.config import Settings
from app.models import quality_model as qm
from app.models.face_detector import RawFace
from app.utils.image_utils import limit_long_side, to_gray

BLUR_ANALYSIS_LONG_SIDE = 1024


@dataclass(frozen=True)
class ImageQuality:
    status: str
    blur_score: float
    brightness_score: float
    message: str | None
    reason: str | None = None


@dataclass(frozen=True)
class FaceQuality:
    score: float
    tier: str
    side: float
    sharpness: float
    brightness: float
    frontalness: float
    visibility: float


def assess_image(image: np.ndarray, settings: Settings) -> ImageQuality:
    gray = to_gray(limit_long_side(image, BLUR_ANALYSIS_LONG_SIDE))
    blur = qm.laplacian_variance(gray)
    brightness = qm.mean_brightness(gray)
    short_side = min(image.shape[:2])

    def result(status: str, message: str | None, reason: str | None = None) -> ImageQuality:
        return ImageQuality(status, round(blur, 2), round(brightness, 3), message, reason)

    if short_side < settings.image_min_short_side:
        return result("unusable", "Image resolution is too low to reliably identify students.", "resolution")
    if blur < settings.image_blur_unusable:
        return result("unusable", "Image is too blurry to reliably identify students.", "blur")
    if brightness < settings.image_brightness_unusable_low:
        return result("unusable", "Image is too dark to reliably identify students.", "dark")
    if brightness > settings.image_brightness_unusable_high:
        return result("unusable", "Image is overexposed and cannot be used to reliably identify students.", "overexposed")
    poor = (
        short_side < settings.image_recommended_short_side
        or blur < settings.image_blur_poor
        or brightness < settings.image_brightness_poor_low
        or brightness > settings.image_brightness_poor_high
    )
    if poor:
        return result("poor", "Image quality is low; some matches may need manual review.")
    return result("good", None)


def assess_face(face: RawFace, image: np.ndarray, settings: Settings) -> FaceQuality:
    height, width = image.shape[:2]
    x1, y1, x2, y2 = (float(v) for v in face.bbox)
    side = min(x2 - x1, y2 - y1)
    left, top = int(max(0, x1)), int(max(0, y1))
    right, bottom = int(min(width, x2)), int(min(height, y2))
    crop = to_gray(image[top:bottom, left:right]) if right > left and bottom > top else np.zeros((1, 1), np.uint8)
    sharpness = qm.reblur_sharpness(crop)
    brightness = qm.mean_brightness(crop)
    frontal = qm.frontalness(face.keypoints)
    visibility = qm.visible_fraction(face.bbox, width, height)

    size_score = float(np.clip(side / settings.face_target_side, 0.0, 1.0))
    sharpness_score = float(np.clip(sharpness / settings.face_target_sharpness, 0.0, 1.0))
    detection_score = float(np.clip(face.score, 0.0, 1.0))
    weighted = (
        0.30 * size_score
        + 0.25 * sharpness_score
        + 0.20 * detection_score
        + 0.10 * qm.exposure_score(brightness)
        + 0.15 * frontal
    )
    score = round(weighted * visibility, 3)

    rejected = (
        side < settings.face_reject_min_side
        or sharpness < settings.face_reject_min_sharpness
        or brightness < settings.face_reject_brightness_low
        or brightness > settings.face_reject_brightness_high
        or visibility < 0.5
    )
    low = (
        side < settings.face_high_min_side
        or sharpness < settings.face_high_min_sharpness
        or frontal < settings.face_high_min_frontalness
        or visibility < 0.9
        or score < settings.face_high_min_quality
    )
    tier = "reject" if rejected else "low" if low else "ok"
    return FaceQuality(score, tier, side, sharpness, brightness, frontal, visibility)

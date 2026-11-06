from dataclasses import dataclass

import numpy as np

from app.config import Settings
from app.models import quality_model as qm
from app.models.face_detector import RawFace
from app.services.reasons import QUALITY, Reason
from app.utils.image_utils import limit_long_side, to_gray

BLUR_ANALYSIS_LONG_SIDE = 1024


@dataclass(frozen=True)
class ImageQuality:
    status: str
    blur_score: float
    brightness_score: float
    message: str | None
    reason: str | None = None
    issues: tuple[str, ...] = ()


@dataclass(frozen=True)
class FaceQuality:
    score: float
    tier: str
    side: float
    sharpness: float
    brightness: float
    frontalness: float
    visibility: float
    issues: tuple[Reason, ...] = ()


def assess_image(image: np.ndarray, settings: Settings) -> ImageQuality:
    gray = to_gray(limit_long_side(image, BLUR_ANALYSIS_LONG_SIDE))
    blur = qm.laplacian_variance(gray)
    brightness = qm.mean_brightness(gray)
    short_side = min(image.shape[:2])

    def result(status: str, message: str | None, reason: str | None = None,
               issues: tuple[str, ...] = ()) -> ImageQuality:
        return ImageQuality(status, round(blur, 2), round(brightness, 3), message, reason, issues)

    if short_side < settings.image_min_short_side:
        return result("unusable", "Image resolution is too low to reliably identify students.", "resolution")
    # Whole-frame blur no longer rejects a photo: it depends on scene content (flat walls score low) and it discarded
    # photos whose faces still matched. Blur below IMAGE_BLUR_POOR is reported as "blurry" (HIGH is then not allowed
    # and faces go to review); per-face sharpness in assess_face decides whether a face may be matched at all.
    if brightness < settings.image_brightness_unusable_low:
        return result("unusable", "Image is too dark to reliably identify students.", "dark")
    if brightness > settings.image_brightness_unusable_high:
        return result("unusable", "Image is overexposed and cannot be used to reliably identify students.", "overexposed")
    poor_issues = tuple(
        code for code, hit in (
            ("low_resolution", short_side < settings.image_recommended_short_side),
            ("blurry", blur < settings.image_blur_poor),
            ("dark", brightness < settings.image_brightness_poor_low),
            ("overexposed", brightness > settings.image_brightness_poor_high),
        ) if hit
    )
    if poor_issues:
        return result("poor", "Image quality is low; some matches may need manual review.", issues=poor_issues)
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

    reject_issues = _reject_issues(settings, side, sharpness, brightness, visibility)
    low_issues = _low_issues(settings, side, sharpness, frontal, visibility, score)
    tier = "reject" if reject_issues else "low" if low_issues else "ok"
    issues = tuple(reject_issues) if reject_issues else tuple(low_issues)
    return FaceQuality(score, tier, side, sharpness, brightness, frontal, visibility, issues)


def _reject_issues(settings: Settings, side: float, sharpness: float, brightness: float,
                   visibility: float) -> list[Reason]:
    found = []
    if side < settings.face_reject_min_side:
        found.append(Reason("face_too_small", QUALITY,
                            f"Face is {side:.0f}px wide; at least {settings.face_reject_min_side}px is needed to read it."))
    if sharpness < settings.face_reject_min_sharpness:
        found.append(Reason("face_blurry", QUALITY,
                            f"Face sharpness {sharpness:.2f} is below the {settings.face_reject_min_sharpness:.2f} minimum."))
    if brightness < settings.face_reject_brightness_low:
        found.append(Reason("face_too_dark", QUALITY, f"Face is too dark (brightness {brightness:.2f})."))
    if brightness > settings.face_reject_brightness_high:
        found.append(Reason("face_overexposed", QUALITY, f"Face is overexposed (brightness {brightness:.2f})."))
    if visibility < 0.5:
        found.append(Reason("face_cut_off", QUALITY, f"Only {visibility:.0%} of the face is inside the photo."))
    return found


def _low_issues(settings: Settings, side: float, sharpness: float, frontal: float, visibility: float,
                score: float) -> list[Reason]:
    found = []
    if side < settings.face_high_min_side:
        found.append(Reason("face_small", QUALITY,
                            f"Face is {side:.0f}px wide; automatic confirmation needs {settings.face_high_min_side}px."))
    if sharpness < settings.face_high_min_sharpness:
        found.append(Reason("face_soft", QUALITY,
                            f"Face sharpness {sharpness:.2f} is below the {settings.face_high_min_sharpness:.2f} needed for automatic confirmation."))
    if frontal < settings.face_high_min_frontalness:
        found.append(Reason("face_turned_away", QUALITY,
                            f"Face is turned away (frontalness {frontal:.2f}, needs {settings.face_high_min_frontalness:.2f})."))
    if visibility < 0.9:
        found.append(Reason("face_partly_visible", QUALITY, f"Only {visibility:.0%} of the face is inside the photo."))
    if not found and score < settings.face_high_min_quality:
        found.append(Reason("face_low_quality_score", QUALITY,
                            f"Combined face quality {score:.2f} is below the {settings.face_high_min_quality:.2f} needed."))
    return found

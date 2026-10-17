import base64
import io

import cv2
import numpy as np
from PIL import Image, UnidentifiedImageError

from app.errors import AppError

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}


def sniff_format(data: bytes) -> str | None:
    if data.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None


def validate_upload(data: bytes, content_type: str | None, max_bytes: int) -> None:
    if len(data) == 0:
        raise AppError("INVALID_IMAGE", "Uploaded file is empty", 400)
    if len(data) > max_bytes:
        raise AppError("FILE_TOO_LARGE", "Uploaded image exceeds the allowed size", 413)
    if (content_type or "").lower() not in ALLOWED_CONTENT_TYPES or sniff_format(data) is None:
        raise AppError("UNSUPPORTED_MEDIA_TYPE", "Only JPEG, PNG and WebP images are supported", 415)


def decode_image(data: bytes, max_pixels: int) -> np.ndarray:
    try:
        with Image.open(io.BytesIO(data)) as probe:
            width, height = probe.size
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise AppError("INVALID_IMAGE", "Image could not be decoded", 400)
    if width * height > max_pixels:
        raise AppError("IMAGE_TOO_LARGE", "Image dimensions exceed the allowed limit", 413)
    decoded = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)
    if decoded is None:
        raise AppError("INVALID_IMAGE", "Image could not be decoded", 400)
    return decoded


def to_gray(image: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)


def limit_long_side(image: np.ndarray, max_side: int) -> np.ndarray:
    height, width = image.shape[:2]
    longest = max(height, width)
    if longest <= max_side:
        return image
    scale = max_side / longest
    return cv2.resize(image, (int(width * scale), int(height * scale)), interpolation=cv2.INTER_AREA)


def pad_border(image: np.ndarray, ratio: float) -> np.ndarray:
    height, width = image.shape[:2]
    pad_y, pad_x = int(height * ratio), int(width * ratio)
    return cv2.copyMakeBorder(image, pad_y, pad_y, pad_x, pad_x, cv2.BORDER_CONSTANT, value=(0, 0, 0))


def crop_face_jpeg(image: np.ndarray, bbox, pad_ratio: float = 0.2, target_side: int = 160) -> str | None:
    """Base64 JPEG of a padded face crop scaled to a thumbnail size.

    Returns None for a box that is malformed or lies outside the image, so a
    caller can skip that one face without failing the whole request.
    """
    height, width = image.shape[:2]
    try:
        x1, y1, x2, y2 = (int(round(float(value))) for value in bbox)
    except (TypeError, ValueError):
        return None
    if x2 <= x1 or y2 <= y1:
        return None

    pad_x, pad_y = int((x2 - x1) * pad_ratio), int((y2 - y1) * pad_ratio)
    left, top = max(0, x1 - pad_x), max(0, y1 - pad_y)
    right, bottom = min(width, x2 + pad_x), min(height, y2 + pad_y)
    crop = image[top:bottom, left:right]
    if crop.size == 0:
        return None

    crop_h, crop_w = crop.shape[:2]
    scale = target_side / max(1, min(crop_h, crop_w))
    if abs(scale - 1) > 0.01:
        interpolation = cv2.INTER_AREA if scale < 1 else cv2.INTER_LINEAR
        crop = cv2.resize(crop, (max(1, int(crop_w * scale)), max(1, int(crop_h * scale))),
                          interpolation=interpolation)

    ok, buffer = cv2.imencode(".jpg", crop, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
    if not ok:
        return None
    return base64.b64encode(buffer.tobytes()).decode("ascii")

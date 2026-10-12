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

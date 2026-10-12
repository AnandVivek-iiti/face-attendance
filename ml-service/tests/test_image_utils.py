import io

import cv2
import numpy as np
import pytest
from PIL import Image

from app.errors import AppError
from app.utils.image_utils import decode_image, validate_upload


def jpeg_bytes(width=64, height=48):
    ok, buffer = cv2.imencode(".jpg", np.full((height, width, 3), 120, dtype=np.uint8))
    return buffer.tobytes()


def test_valid_jpeg_decodes():
    data = jpeg_bytes()
    validate_upload(data, "image/jpeg", 1_000_000)
    assert decode_image(data, 1_000_000).shape == (48, 64, 3)


@pytest.mark.parametrize("data,content_type", [(b"", "image/jpeg"), (b"GIF89a....", "image/gif"), (b"not an image", "image/jpeg")])
def test_invalid_uploads_rejected(data, content_type):
    with pytest.raises(AppError):
        validate_upload(data, content_type, 1_000_000)


def test_oversized_file_rejected():
    with pytest.raises(AppError) as error:
        validate_upload(jpeg_bytes(), "image/jpeg", 10)
    assert error.value.status_code == 413


def test_pixel_limit_enforced():
    buffer = io.BytesIO()
    Image.new("RGB", (400, 400)).save(buffer, format="PNG")
    with pytest.raises(AppError) as error:
        decode_image(buffer.getvalue(), 1000)
    assert error.value.code == "IMAGE_TOO_LARGE"

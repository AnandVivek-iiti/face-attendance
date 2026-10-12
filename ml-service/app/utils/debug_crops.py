import logging
import re
from datetime import datetime, timezone
from pathlib import Path

import cv2
import numpy as np

logger = logging.getLogger(__name__)
SAFE = re.compile(r"[^A-Za-z0-9_-]")


class FaceCropWriter:
    def __init__(self, enabled: bool, base_dir: Path):
        self.enabled = enabled
        self.base_dir = base_dir

    def save(self, request_id: str, image: np.ndarray, face_id: str, bbox: list[int],
             decision: str, student_id: str | None, similarity: float) -> None:
        if not self.enabled:
            return
        x1, y1, x2, y2 = bbox
        margin_x, margin_y = int((x2 - x1) * 0.15), int((y2 - y1) * 0.15)
        height, width = image.shape[:2]
        crop = image[max(0, y1 - margin_y):min(height, y2 + margin_y),
                     max(0, x1 - margin_x):min(width, x2 + margin_x)]
        if crop.size == 0:
            return
        day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        target = self.base_dir / day / SAFE.sub("", request_id)
        try:
            target.mkdir(parents=True, exist_ok=True)
            label = SAFE.sub("", student_id or "none")
            name = f"{SAFE.sub('', face_id)}_{decision}_{label}_{similarity:.2f}.jpg"
            cv2.imwrite(str(target / name), crop, [cv2.IMWRITE_JPEG_QUALITY, 90])
        except OSError:
            logger.warning("face crop could not be written")

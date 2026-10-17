import logging
from pathlib import Path

import cv2
import numpy as np

logger = logging.getLogger(__name__)


class FaceCropWriter:
    def __init__(self, enabled: bool, crop_dir: Path):
        self._enabled = enabled
        self._crop_dir = Path(crop_dir)

    def save(self, request_id: str, image: np.ndarray, face_id: str, bbox: list[int],
             decision: str, student_id: str | None, similarity: float) -> None:
        if not self._enabled:
            return
        try:
            self._crop_dir.mkdir(parents=True, exist_ok=True)
            x1, y1, x2, y2 = bbox
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(image.shape[1], x2), min(image.shape[0], y2)
            crop = image[y1:y2, x1:x2]
            if crop.size == 0:
                return
            label = student_id or decision
            filename = f"{request_id}_{face_id}_{label}.jpg"
            path = self._crop_dir / filename
            cv2.imwrite(str(path), crop)
        except Exception:
            logger.exception("Failed to write face crop")

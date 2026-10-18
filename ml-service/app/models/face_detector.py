from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class RawFace:
    bbox: np.ndarray
    score: float
    keypoints: np.ndarray


def _ceil32(value: float) -> int:
    return max(32, int(-(-value // 32)) * 32)


class FaceDetector:
    """SCRFD wrapper.

    The stock InsightFace call letterboxes every photo into a fixed square
    (1280x1280), so a 4:3 phone photo wastes 25% of the network's work on black
    padding and a 16:9 photo wastes ~45%. SCRFD is fully convolutional, so we
    size the input to each photo's own aspect ratio instead. Returned boxes and
    keypoints are still in original-image pixels, so nothing downstream changes.
    """

    def __init__(self, detection_model, max_size: int = 1280, min_size: int = 640):
        self._model = detection_model
        self._max_size = int(max_size)
        self._min_size = int(min(min_size, max_size))

    def input_size_for(self, image: np.ndarray) -> tuple[int, int]:
        height, width = image.shape[:2]
        longest = max(height, width)
        # Never blow a small photo up past the configured size, but keep a floor so tiny faces in low-resolution photos still get some upscaling.
        target = self._max_size if longest >= self._max_size else max(_ceil32(longest), self._min_size)
        scale = target / longest
        return (_ceil32(width * scale), _ceil32(height * scale))  # (w, h)

    def detect(self, image: np.ndarray) -> list[RawFace]:
        boxes, keypoints = self._model.detect(
            image, input_size=self.input_size_for(image), max_num=0, metric="default"
        )
        if boxes is None or boxes.shape[0] == 0 or keypoints is None:
            return []
        return [
            RawFace(bbox=boxes[i, :4].astype(np.float32), score=float(boxes[i, 4]), keypoints=keypoints[i].astype(np.float32))
            for i in range(boxes.shape[0])
        ]

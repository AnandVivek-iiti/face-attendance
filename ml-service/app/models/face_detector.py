from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class RawFace:
    bbox: np.ndarray
    score: float
    keypoints: np.ndarray


class FaceDetector:
    def __init__(self, detection_model):
        self._model = detection_model

    def detect(self, image: np.ndarray) -> list[RawFace]:
        boxes, keypoints = self._model.detect(image, max_num=0, metric="default")
        if boxes is None or boxes.shape[0] == 0 or keypoints is None:
            return []
        return [
            RawFace(bbox=boxes[i, :4].astype(np.float32), score=float(boxes[i, 4]), keypoints=keypoints[i].astype(np.float32))
            for i in range(boxes.shape[0])
        ]

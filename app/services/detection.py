import numpy as np

from app.models.face_detector import FaceDetector, RawFace


class DetectionService:
    def __init__(self, detector: FaceDetector):
        self._detector = detector

    def detect(self, image: np.ndarray) -> list[RawFace]:
        faces = self._detector.detect(image)
        return sorted(faces, key=lambda face: (float(face.bbox[1]), float(face.bbox[0])))


def clamp_bbox(bbox: np.ndarray, width: int, height: int) -> list[int]:
    x1, y1, x2, y2 = (int(round(float(v))) for v in bbox)
    return [max(0, x1), max(0, y1), min(width, x2), min(height, y2)]

import numpy as np

from app.models.face_detector import RawFace
from app.services.detection import DetectionService


class FakeDetector:
    """Finds a 40px face only when the face is at least 1/3 of the frame's long side away from the left edge cut-off."""

    def __init__(self, whole_faces):
        self.whole_faces = whole_faces
        self.calls = 0

    def detect(self, image):
        self.calls += 1
        h, w = image.shape[:2]
        if (h, w) == (self.whole_faces[0], self.whole_faces[1]):
            return []
        # tile pass: report one face at tile-local (100, 100)
        box = np.array([100, 100, 140, 140], dtype=np.float32)
        return [RawFace(box, 0.9, np.zeros((5, 2), np.float32) + 120)]


def test_tiling_recovers_faces_missed_on_the_whole_image():
    image = np.zeros((2000, 4000, 3), np.uint8)
    detector = FakeDetector((2000, 4000))
    faces = DetectionService(detector, tiling=True, tile_side=1600, overlap=0.25).detect(image)
    assert detector.calls > 1
    assert len(faces) >= 2
    # boxes are mapped back to full-image pixels and the tiles do not collapse onto one location
    assert len({(int(f.bbox[0]), int(f.bbox[1])) for f in faces}) == len(faces)
    assert all(f.bbox[2] <= 4000 and f.bbox[3] <= 2000 for f in faces)


def test_small_images_are_not_tiled():
    detector = FakeDetector((10, 10))
    DetectionService(detector, tiling=True, tile_side=1600).detect(np.zeros((800, 1200, 3), np.uint8))
    assert detector.calls == 1


def test_tiling_off_by_default():
    detector = FakeDetector((10, 10))
    DetectionService(detector).detect(np.zeros((2000, 4000, 3), np.uint8))
    assert detector.calls == 1

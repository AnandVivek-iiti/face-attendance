import numpy as np

from app.models.face_detector import FaceDetector, RawFace

MAX_TILES_PER_AXIS = 4
EDGE_PX = 3
NMS_IOU = 0.4


class DetectionService:
    def __init__(self, detector: FaceDetector, tiling: bool = False, tile_side: int = 1600, overlap: float = 0.25):
        self._detector = detector
        self._tiling = tiling
        self._tile_side = max(320, int(tile_side))
        self._overlap = float(np.clip(overlap, 0.05, 0.5))

    def detect(self, image: np.ndarray) -> list[RawFace]:
        faces = self._detector.detect(image)
        if self._tiling:
            faces = _nms(faces + self._detect_tiles(image))
        return sorted(faces, key=lambda face: (float(face.bbox[1]), float(face.bbox[0])))

    def _detect_tiles(self, image: np.ndarray) -> list[RawFace]:
        """Re-detect on overlapping crops so small, far-away faces in wide group photos are seen at higher effective resolution."""
        height, width = image.shape[:2]
        cols = min(MAX_TILES_PER_AXIS, max(1, -(-width // self._tile_side)))
        rows = min(MAX_TILES_PER_AXIS, max(1, -(-height // self._tile_side)))
        if cols == 1 and rows == 1:
            return []
        xs = _starts(width, cols, self._overlap)
        ys = _starts(height, rows, self._overlap)
        tile_w = int(np.ceil(width / (1 + (cols - 1) * (1 - self._overlap))))
        tile_h = int(np.ceil(height / (1 + (rows - 1) * (1 - self._overlap))))
        found: list[RawFace] = []
        for y0 in ys:
            for x0 in xs:
                x1, y1 = min(width, x0 + tile_w), min(height, y0 + tile_h)
                tile = np.ascontiguousarray(image[y0:y1, x0:x1])
                for face in self._detector.detect(tile):
                    bx1, by1, bx2, by2 = (float(v) for v in face.bbox)
                    # A face cut by an inner tile border is seen whole by the neighbouring tile.
                    if (bx1 <= EDGE_PX and x0 > 0) or (by1 <= EDGE_PX and y0 > 0) \
                            or (bx2 >= x1 - x0 - EDGE_PX and x1 < width) or (by2 >= y1 - y0 - EDGE_PX and y1 < height):
                        continue
                    offset = np.array([x0, y0], dtype=np.float32)
                    found.append(RawFace(
                        bbox=face.bbox + np.array([x0, y0, x0, y0], dtype=np.float32),
                        score=face.score,
                        keypoints=face.keypoints + offset,
                    ))
        return found


def _starts(length: int, count: int, overlap: float) -> list[int]:
    if count == 1:
        return [0]
    tile = int(np.ceil(length / (1 + (count - 1) * (1 - overlap))))
    step = tile * (1 - overlap)
    return [min(int(round(i * step)), max(0, length - tile)) for i in range(count)]


def _iou(a: np.ndarray, b: np.ndarray) -> float:
    ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
    ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return float(inter / union) if union > 0 else 0.0


def _nms(faces: list[RawFace]) -> list[RawFace]:
    kept: list[RawFace] = []
    for face in sorted(faces, key=lambda f: -f.score):
        if all(_iou(face.bbox, k.bbox) < NMS_IOU for k in kept):
            kept.append(face)
    return kept


def clamp_bbox(bbox: np.ndarray, width: int, height: int) -> list[int]:
    x1, y1, x2, y2 = (int(round(float(v))) for v in bbox)
    return [max(0, x1), max(0, y1), min(width, x2), min(height, y2)]

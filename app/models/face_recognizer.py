import cv2
import numpy as np
from insightface.utils import face_align

from app.utils.embedding_utils import l2_normalize

BATCH_SIZE = 16


class FaceRecognizer:
    def __init__(self, recognition_model):
        self._model = recognition_model
        self.crop_size = int(recognition_model.input_size[0])
        dim = recognition_model.output_shape[-1]
        if not isinstance(dim, int) or dim <= 0:
            # Guessing 512 here would let embeddings of an unknown model be compared with stored ones.
            raise RuntimeError(f"Recognition model reports an unusable output dimension: {dim!r}")
        self.embedding_dim = int(dim)

    def align(self, image: np.ndarray, keypoints: np.ndarray) -> np.ndarray:
        return face_align.norm_crop(image, landmark=keypoints, image_size=self.crop_size)

    def embed(self, aligned_crops: list[np.ndarray], flip: bool = False) -> np.ndarray:
        if not aligned_crops:
            return np.zeros((0, self.embedding_dim), dtype=np.float32)
        features = self._features(aligned_crops)
        if flip:
            features = features + self._features([cv2.flip(crop, 1) for crop in aligned_crops])
        return l2_normalize(features)

    def _features(self, crops: list[np.ndarray]) -> np.ndarray:
        chunks = [
            np.asarray(self._model.get_feat(crops[start:start + BATCH_SIZE]), dtype=np.float32)
            for start in range(0, len(crops), BATCH_SIZE)
        ]
        return l2_normalize(np.concatenate(chunks, axis=0))
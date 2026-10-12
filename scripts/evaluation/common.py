import json
import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.config import Settings
from app.errors import AppError
from app.models.registry import ModelRegistry
from app.services.attendance import AttendanceService
from app.services.detection import DetectionService
from app.services.quality_check import assess_face
from app.services.recognition import RecognitionService
from app.services.reference import ReferenceService
from app.utils.embedding_utils import EnrolledStudent

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}


class Runtime:
    def __init__(self, settings: Settings | None = None):
        self.settings = settings or Settings()
        self.registry = ModelRegistry(self.settings)
        self.detection = DetectionService(self.registry.detector)
        self.recognition = RecognitionService(self.registry.recognizer, self.settings)
        self.reference = ReferenceService(self.registry, self.settings)
        self.attendance = AttendanceService(self.registry, self.settings)


def read_image(path: Path) -> np.ndarray:
    image = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if image is None:
        raise SystemExit(f"cannot read image: {path.name}")
    return image


def load_raw_labels(dataset: Path) -> dict:
    return json.loads((dataset / "labels.json").read_text(encoding="utf-8"))


def load_labels(dataset: Path) -> dict:
    return {k: v for k, v in load_raw_labels(dataset).items() if k != "__sessions__"}


def load_sessions(dataset: Path) -> dict[str, list[str]]:
    raw = load_raw_labels(dataset)
    return raw.get("__sessions__") or {name: [name] for name in raw if name != "__sessions__"}


def enroll(runtime: Runtime, dataset: Path) -> tuple[list[EnrolledStudent], dict]:
    students, rejected = [], {}
    root = dataset / "enrollment"
    for folder in sorted(p for p in root.iterdir() if p.is_dir()):
        vectors = []
        for path in sorted(folder.iterdir()):
            if path.suffix.lower() not in IMAGE_SUFFIXES:
                continue
            try:
                vectors.append(runtime.reference.generate(read_image(path)).embedding)
            except AppError as error:
                rejected.setdefault(folder.name, []).append({"file": path.name, "code": error.code})
        if vectors:
            students.append(EnrolledStudent(folder.name, np.asarray(vectors, dtype=np.float32)))
    return students, rejected


def detect_with_embeddings(runtime: Runtime, image: np.ndarray) -> list[dict]:
    faces = runtime.detection.detect(image)
    crops = [runtime.recognition.align(image, f.keypoints) for f in faces]
    embeddings = runtime.recognition.embed(crops)
    results = []
    for face, crop, embedding in zip(faces, crops, embeddings):
        quality = assess_face(face, image, runtime.settings)
        results.append({"bbox": [float(v) for v in face.bbox], "score": face.score,
                        "embedding": embedding, "quality": quality})
    return results


def write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

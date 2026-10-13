import logging

import numpy as np
import onnxruntime
from insightface.app import FaceAnalysis

from app.config import Settings
from app.models.face_detector import FaceDetector
from app.models.face_recognizer import FaceRecognizer

logger = logging.getLogger(__name__)


def resolve_providers(device: str) -> tuple[list[str], bool]:
    cuda_available = "CUDAExecutionProvider" in onnxruntime.get_available_providers()
    if device == "cuda" and not cuda_available:
        logger.warning("DEVICE=cuda requested but CUDA provider is unavailable; using CPU")
    use_cuda = device in {"auto", "cuda"} and cuda_available
    providers = ["CUDAExecutionProvider", "CPUExecutionProvider"] if use_cuda else ["CPUExecutionProvider"]
    return providers, use_cuda


def load_face_analysis(settings: Settings, providers: list[str], use_cuda: bool) -> FaceAnalysis:
    analysis = FaceAnalysis(
        name=settings.insightface_model,
        root=settings.insightface_root,
        allowed_modules=["detection", "recognition"],
        providers=providers,
    )
    analysis.prepare(
        ctx_id=0 if use_cuda else -1,
        det_thresh=settings.detection_threshold,
        det_size=(settings.detection_size, settings.detection_size),
    )
    return analysis


class ModelRegistry:
    def __init__(self, settings: Settings):
        providers, use_cuda = resolve_providers(settings.device)
        try:
            analysis = load_face_analysis(settings, providers, use_cuda)
        except Exception:
            if not use_cuda:
                raise
            logger.exception("GPU initialisation failed; falling back to CPU")
            providers, use_cuda = ["CPUExecutionProvider"], False
            analysis = load_face_analysis(settings, providers, use_cuda)
        self.model_name = settings.insightface_model
        self.detector = FaceDetector(analysis.det_model, settings.detection_size, settings.detection_min_size)
        self.recognizer = FaceRecognizer(analysis.models["recognition"])
        self.active_providers = list(analysis.det_model.session.get_providers())
        logger.info("models loaded: %s providers=%s", self.model_name, self.active_providers)
        if settings.warmup:
            self._warm_up()

    def _warm_up(self) -> None:
        """Run each network once so the first real request does not pay for
        ONNX Runtime's lazy graph optimisation and memory allocation."""
        try:
            rng = np.random.default_rng(0)
            frame = rng.integers(0, 255, (960, 1280, 3), dtype=np.uint8)
            self.detector.detect(frame)
            size = self.recognizer.crop_size
            self.recognizer.embed([rng.integers(0, 255, (size, size, 3), dtype=np.uint8)])
            logger.info("models warmed up")
        except Exception:  # warm-up is best effort; never block start-up
            logger.exception("warm-up failed (continuing)")

"""Run against any ml-service tree:  TARGET=/path/to/ml-service python -m pytest tests_audit -q
Detection/pipeline tests need the buffalo_l pack in ~/.insightface/models and are skipped without it.
Only library-bundled demo images (detection + same-identity self-consistency) and synthetic data are used;
no identity matching is ever performed between different people."""
import os, sys
from pathlib import Path
import pytest

TARGET = Path(os.environ.get("TARGET", Path(__file__).resolve().parents[1]))  # default: the ml-service folder
os.environ.setdefault("API_KEY", "test-key")
sys.path.insert(0, str(TARGET))
sys.path.insert(1, str(Path(__file__).resolve().parent))  # for synth.py
MODEL_OK = (Path.home() / ".insightface/models/buffalo_l/det_10g.onnx").exists()
needs_model = pytest.mark.skipif(not MODEL_OK, reason="buffalo_l not installed")

@pytest.fixture(scope="session")
def settings():
    from app.config import Settings
    return Settings(warmup=False)

@pytest.fixture(scope="session")
def registry(settings):
    if not MODEL_OK: pytest.skip("buffalo_l not installed")
    from app.models.registry import ModelRegistry
    return ModelRegistry(settings)

@pytest.fixture(scope="session")
def service(registry, settings):
    from app.services.attendance import AttendanceService
    return AttendanceService(registry, settings)

@pytest.fixture(scope="session")
def group_photo():
    import cv2, insightface
    path = Path(insightface.__file__).parent / "data/images/t1.jpg"
    return cv2.imread(str(path))

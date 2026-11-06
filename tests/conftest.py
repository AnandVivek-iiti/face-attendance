import sys
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parent) if ROOT.name == "app" else str(ROOT))

if "insightface" not in sys.modules:
    try:
        import insightface  # noqa: F401
    except ModuleNotFoundError:
        stub = types.ModuleType("insightface")
        utils = types.ModuleType("insightface.utils")
        align = types.ModuleType("insightface.utils.face_align")
        align.norm_crop = lambda image, landmark, image_size=112: image
        utils.face_align = align
        app_mod = types.ModuleType("insightface.app")
        app_mod.FaceAnalysis = object
        stub.utils = utils
        stub.app = app_mod
        sys.modules["insightface.app"] = app_mod
        sys.modules["insightface"] = stub
        sys.modules["insightface.utils"] = utils
        sys.modules["insightface.utils.face_align"] = align

try:
    import onnxruntime  # noqa: F401
except ModuleNotFoundError:
    sys.modules["onnxruntime"] = types.ModuleType("onnxruntime")

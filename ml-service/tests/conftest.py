"""Stub heavy native deps so logic tests run without models or GPU."""
import sys, types
import numpy as np

def _stub(name, **attrs):
    mod = types.ModuleType(name)
    mod.__dict__.update(attrs)
    sys.modules[name] = mod
    return mod

if "insightface" not in sys.modules:
    try:
        import insightface  # noqa: F401
    except Exception:
        _stub("insightface")
        _stub("insightface.app", FaceAnalysis=object)
        _stub("insightface.utils")
        _stub("insightface.utils.face_align", norm_crop=lambda img, landmark, image_size: np.zeros((image_size, image_size, 3), np.uint8))
        sys.modules["insightface"].utils = sys.modules["insightface.utils"]
        sys.modules["insightface.utils"].face_align = sys.modules["insightface.utils.face_align"]
try:
    import onnxruntime  # noqa: F401
except Exception:
    _stub("onnxruntime", get_available_providers=lambda: ["CPUExecutionProvider"])

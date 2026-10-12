import inspect
import io
import pickle
import zipfile
from pathlib import Path

import numpy as np
from joblib.numpy_pickle import NumpyUnpickler

ALLOWED_GLOBALS = {
    ("joblib.numpy_pickle", "NumpyArrayWrapper"),
    ("numpy", "ndarray"),
    ("numpy", "dtype"),
    ("numpy.core.multiarray", "_reconstruct"),
    ("numpy._core.multiarray", "_reconstruct"),
    ("builtins", "list"),
    ("builtins", "dict"),
    ("builtins", "tuple"),
    ("collections", "OrderedDict"),
}
CANDIDATE_NAMES = ("classes", "classes.pkl", "embeddings_all")


class RestrictedUnpickler(NumpyUnpickler):
    def find_class(self, module, name):
        if (module, name) not in ALLOWED_GLOBALS:
            raise pickle.UnpicklingError(f"blocked global {module}.{name}")
        return super().find_class(module, name)


def load_restricted(data: bytes, label: str):
    parameters = inspect.signature(NumpyUnpickler.__init__).parameters
    stream = io.BytesIO(data)
    if "ensure_native_byte_order" in parameters:
        unpickler = RestrictedUnpickler(label, stream, True, mmap_mode=None)
    else:
        unpickler = RestrictedUnpickler(label, stream, mmap_mode=None)
    return unpickler.load()


def list_candidates(zip_path: Path) -> list[str]:
    with zipfile.ZipFile(zip_path, "r") as archive:
        return [
            info.filename for info in archive.infolist()
            if not info.is_dir() and Path(info.filename).name.startswith(CANDIDATE_NAMES)
            and not info.filename.endswith((".py", ".pyc", ".html", ".js", ".csv"))
        ]


def read_member(zip_path: Path, member: str) -> bytes:
    with zipfile.ZipFile(zip_path, "r") as archive:
        return archive.read(member)


def normalise_structure(obj) -> dict[str, tuple[np.ndarray, list[str]]]:
    if isinstance(obj, dict):
        result = {}
        for class_name, value in obj.items():
            embeddings, labels = value
            result[str(class_name)] = (np.asarray(embeddings, dtype=np.float32), [str(x) for x in labels])
        return result
    if isinstance(obj, (list, tuple)):
        return {"__unlabelled__": (np.asarray(obj, dtype=np.float32), [])}
    raise ValueError("unrecognised FaceMark structure")

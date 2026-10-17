from dataclasses import dataclass

import numpy as np

from app.errors import AppError


@dataclass(frozen=True)
class EnrolledStudent:
    student_id: str
    embeddings: np.ndarray


@dataclass(frozen=True)
class Gallery:
    student_ids: list[str]
    matrix: np.ndarray
    starts: np.ndarray


def l2_normalize(values: np.ndarray, axis: int = -1) -> np.ndarray:
    norms = np.linalg.norm(values, axis=axis, keepdims=True)
    return values / np.maximum(norms, 1e-12)


def to_embedding_matrix(raw: list[list[float]], dim: int, student_id: str) -> np.ndarray:
    try:
        matrix = np.asarray(raw, dtype=np.float32)
    except (TypeError, ValueError):
        raise AppError("INVALID_EMBEDDING", f"Embedding for {student_id} is not numeric", 422)
    if matrix.ndim != 2 or matrix.shape[1] != dim or matrix.shape[0] == 0:
        raise AppError("INVALID_EMBEDDING", f"Embedding for {student_id} must have {dim} dimensions", 422)
    if not np.isfinite(matrix).all():
        raise AppError("INVALID_EMBEDDING", f"Embedding for {student_id} contains non-finite values", 422)
    if (np.linalg.norm(matrix, axis=1) < 1e-6).any():
        raise AppError("INVALID_EMBEDDING", f"Embedding for {student_id} has zero norm", 422)
    return l2_normalize(matrix)


def build_gallery(students: list[EnrolledStudent]) -> Gallery:
    merged: dict[str, list[np.ndarray]] = {}
    for student in students:
        merged.setdefault(student.student_id, []).append(student.embeddings)
    student_ids = list(merged)
    if not student_ids:
        # First session of a course: nothing enrolled yet.
        return Gallery([], np.zeros((0, 0), dtype=np.float32), np.array([0]))
    blocks = [np.concatenate(merged[sid], axis=0) for sid in student_ids]
    sizes = np.array([block.shape[0] for block in blocks])
    starts = np.concatenate(([0], np.cumsum(sizes)[:-1]))
    return Gallery(student_ids, np.concatenate(blocks, axis=0), starts)


def _top2_mean(pairwise: np.ndarray, gallery: Gallery) -> np.ndarray:
    ends = np.append(gallery.starts[1:], gallery.matrix.shape[0])
    columns = []
    for start, end in zip(gallery.starts, ends):
        block = pairwise[:, start:end]
        keep = min(2, block.shape[1])
        top = np.partition(block, block.shape[1] - keep, axis=1)[:, block.shape[1] - keep:]
        columns.append(top.mean(axis=1))
    return np.stack(columns, axis=1)


def student_similarity(queries: np.ndarray, gallery: Gallery, pooling: str = "max") -> np.ndarray:
    if pooling == "centroid":
        centroids = l2_normalize(np.add.reduceat(gallery.matrix, gallery.starts, axis=0))
        return queries @ centroids.T
    pairwise = queries @ gallery.matrix.T
    if pooling == "top2":
        return _top2_mean(pairwise, gallery)
    return np.maximum.reduceat(pairwise, gallery.starts, axis=1)
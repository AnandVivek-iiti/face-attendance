import numpy as np
import pytest

from app.errors import AppError
from app.utils.embedding_utils import EnrolledStudent, build_gallery, l2_normalize, student_similarity, to_embedding_matrix


def unit(*values):
    return l2_normalize(np.array([values], dtype=np.float32))


def test_multi_embedding_student_uses_best_match():
    students = [
        EnrolledStudent("A", np.concatenate([unit(1, 0, 0), unit(0, 1, 0)])),
        EnrolledStudent("B", unit(0, 0, 1)),
    ]
    scores = student_similarity(unit(0, 1, 0), build_gallery(students))
    assert scores.shape == (1, 2)
    assert scores[0, 0] == pytest.approx(1.0)
    assert scores[0, 1] == pytest.approx(0.0)


def test_duplicate_student_ids_are_merged():
    gallery = build_gallery([EnrolledStudent("A", unit(1, 0)), EnrolledStudent("A", unit(0, 1))])
    assert gallery.student_ids == ["A"]
    assert gallery.matrix.shape == (2, 2)


@pytest.mark.parametrize("raw", [[[1.0, 2.0]], [[float("nan")] * 4], [[0.0] * 4], [[]]])
def test_invalid_embeddings_rejected(raw):
    with pytest.raises(AppError):
        to_embedding_matrix(raw, 4, "X")


def test_embeddings_are_normalised():
    matrix = to_embedding_matrix([[3.0, 4.0]], 2, "X")
    assert np.linalg.norm(matrix[0]) == pytest.approx(1.0)

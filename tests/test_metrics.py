import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts" / "evaluation"))
from metrics import iou, match_boxes, prf, recommend_thresholds, threshold_sweep


def test_iou_and_matching():
    assert iou([0, 0, 10, 10], [0, 0, 10, 10]) == 1.0
    assert iou([0, 0, 10, 10], [20, 20, 30, 30]) == 0.0
    assert match_boxes([[0, 0, 10, 10], [50, 50, 60, 60]], [[1, 1, 10, 10]], 0.5) == [(0, 0)]


def test_prf():
    assert prf(8, 2, 2) == {"precision": 0.8, "recall": 0.8, "f1": 0.8}
    assert prf(0, 0, 0)["f1"] == 0.0


def test_sweep_and_recommendation_separable_data():
    genuine = np.linspace(0.6, 0.95, 50)
    impostor = np.linspace(-0.1, 0.35, 500)
    rows = threshold_sweep(
        top_sim=genuine, top_correct=np.ones(50, dtype=bool), is_genuine=np.ones(50, dtype=bool),
        genuine_sims=genuine, impostor_sims=impostor, thresholds=np.round(np.arange(0, 1.0001, 0.01), 4),
    )
    recommendation = recommend_thresholds(rows, target_far=0.0, target_frr=0.05)
    assert 0.35 <= recommendation["HIGH_CONFIDENCE_THRESHOLD"] <= 0.6
    assert recommendation["REVIEW_THRESHOLD"] <= recommendation["HIGH_CONFIDENCE_THRESHOLD"]

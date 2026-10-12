import numpy as np


def iou(a, b) -> float:
    ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
    ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


def match_boxes(detections: list, ground_truth: list, min_iou: float) -> list[tuple[int, int]]:
    pairs = sorted(
        ((iou(d, g), di, gi) for di, d in enumerate(detections) for gi, g in enumerate(ground_truth)),
        reverse=True,
    )
    used_d, used_g, matched = set(), set(), []
    for value, di, gi in pairs:
        if value < min_iou:
            break
        if di in used_d or gi in used_g:
            continue
        used_d.add(di)
        used_g.add(gi)
        matched.append((di, gi))
    return matched


def prf(tp: int, fp: int, fn: int) -> dict:
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {"precision": round(precision, 4), "recall": round(recall, 4), "f1": round(f1, 4)}


def threshold_sweep(top_sim: np.ndarray, top_correct: np.ndarray, is_genuine: np.ndarray,
                    genuine_sims: np.ndarray, impostor_sims: np.ndarray, thresholds: np.ndarray) -> list[dict]:
    rows = []
    genuine_count = int(is_genuine.sum())
    impostor_faces = int((~is_genuine).sum())
    for t in thresholds:
        accepted = top_sim >= t
        tp = int((is_genuine & accepted & top_correct).sum())
        misid = int((is_genuine & accepted & ~top_correct).sum())
        impostor_accepted = int((~is_genuine & accepted).sum())
        rejected_genuine = int((is_genuine & ~accepted).sum())
        fp = misid + impostor_accepted
        fn = genuine_count - tp
        rows.append({
            "threshold": round(float(t), 4),
            **prf(tp, fp, fn),
            "far": round(float((impostor_sims >= t).mean()), 6) if impostor_sims.size else None,
            "frr": round(float((genuine_sims < t).mean()), 6) if genuine_sims.size else None,
            "misidentificationRate": round(misid / genuine_count, 4) if genuine_count else None,
            "openSetFalseAcceptRate": round(impostor_accepted / impostor_faces, 4) if impostor_faces else None,
            "falseRejectedGenuineFaces": rejected_genuine,
        })
    return rows


def recommend_thresholds(rows: list[dict], target_far: float, target_frr: float) -> dict:
    usable = [r for r in rows if r["far"] is not None and r["frr"] is not None]
    if not usable:
        return {}
    high = next((r for r in usable if r["far"] <= target_far), usable[-1])
    review_threshold = min(
        max((r["threshold"] for r in usable if r["frr"] <= target_frr), default=high["threshold"]),
        high["threshold"],
    )
    best_f1 = max(usable, key=lambda r: r["f1"])
    return {
        "HIGH_CONFIDENCE_THRESHOLD": high["threshold"],
        "REVIEW_THRESHOLD": review_threshold,
        "bestF1Threshold": best_f1["threshold"],
        "targets": {"far": target_far, "frr": target_frr},
    }

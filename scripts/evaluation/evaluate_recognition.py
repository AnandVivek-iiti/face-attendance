import argparse
import csv
from pathlib import Path

import numpy as np

from common import Runtime, detect_with_embeddings, enroll, load_labels, read_image, write_json
from metrics import match_boxes, recommend_thresholds, threshold_sweep
from app.utils.embedding_utils import build_gallery, student_similarity


MIN_GENUINE_FACES = 200


def collect_trials(runtime: Runtime, dataset: Path, students, iou: float):
    gallery = build_gallery(students)
    index = {sid: i for i, sid in enumerate(gallery.student_ids)}
    top_sim, top_correct, is_genuine = [], [], []
    genuine_sims, impostor_sims, qualities, genuine_by_quality = [], [], [], []
    unmatched_truth = 0
    for relative, entry in load_labels(dataset).items():
        detections = detect_with_embeddings(runtime, read_image(dataset / relative))
        truth = entry["faces"]
        pairs = match_boxes([d["bbox"] for d in detections], [t["bbox"] for t in truth], iou)
        unmatched_truth += len(truth) - len(pairs)
        if not pairs:
            continue
        scores = student_similarity(np.stack([detections[di]["embedding"] for di, _ in pairs]), gallery)
        for row, (di, gi) in enumerate(pairs):
            true_id = truth[gi].get("studentId")
            genuine = true_id in index
            best = int(scores[row].argmax())
            top_sim.append(float(scores[row, best]))
            is_genuine.append(genuine)
            top_correct.append(genuine and best == index[true_id])
            quality = detections[di]["quality"]
            if genuine:
                own = float(scores[row, index[true_id]])
                genuine_sims.append(own)
                genuine_by_quality.append((quality.score, own))
                others = np.delete(scores[row], index[true_id])
                impostor_sims.extend(others.tolist())
            else:
                impostor_sims.extend(scores[row].tolist())
            qualities.append(quality.score)
    return {
        "top_sim": np.array(top_sim), "top_correct": np.array(top_correct, dtype=bool),
        "is_genuine": np.array(is_genuine, dtype=bool), "genuine_sims": np.array(genuine_sims),
        "impostor_sims": np.array(impostor_sims), "genuine_by_quality": genuine_by_quality,
        "unmatched_truth": unmatched_truth,
    }


def plot_distribution(trials: dict, recommendation: dict, path: Path) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    bins = np.linspace(-0.2, 1.0, 61)
    figure, axis = plt.subplots(figsize=(8, 4.5))
    axis.hist(trials["impostor_sims"], bins=bins, alpha=0.6, density=True, label="impostor pairs")
    axis.hist(trials["genuine_sims"], bins=bins, alpha=0.6, density=True, label="genuine pairs")
    for key, style in (("REVIEW_THRESHOLD", "--"), ("HIGH_CONFIDENCE_THRESHOLD", "-")):
        if key in recommendation:
            axis.axvline(recommendation[key], linestyle=style, color="black", label=f"{key}={recommendation[key]}")
    axis.set_xlabel("cosine similarity")
    axis.set_ylabel("density")
    axis.legend()
    figure.tight_layout()
    figure.savefig(path, dpi=140)
    plt.close(figure)


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate recognition and calibrate thresholds")
    parser.add_argument("--dataset", required=True, type=Path)
    parser.add_argument("--out", type=Path, default=Path("evaluation-output"))
    parser.add_argument("--iou", type=float, default=0.5)
    parser.add_argument("--target-far", type=float, default=0.0001)
    parser.add_argument("--target-frr", type=float, default=0.05)
    args = parser.parse_args()

    runtime = Runtime()
    students, rejected = enroll(runtime, args.dataset)
    trials = collect_trials(runtime, args.dataset, students, args.iou)
    if trials["genuine_sims"].size == 0:
        raise SystemExit("no genuine trials: check that labels.json studentIds match enrollment folders")

    thresholds = np.round(np.arange(0.0, 1.0001, 0.01), 4)
    rows = threshold_sweep(trials["top_sim"], trials["top_correct"], trials["is_genuine"],
                           trials["genuine_sims"], trials["impostor_sims"], thresholds)
    recommendation = recommend_thresholds(rows, args.target_far, args.target_frr)
    genuine = trials["is_genuine"]
    warnings = []
    if int(genuine.sum()) < MIN_GENUINE_FACES:
        warnings.append(f"only {int(genuine.sum())} genuine faces; thresholds from fewer than {MIN_GENUINE_FACES} are unreliable")
    if not (~genuine).any():
        warnings.append("no non-enrolled faces labelled; open-set false acceptance cannot be measured directly")
    summary = {
        "warnings": warnings,
        "enrolledStudents": len(students),
        "enrollmentImagesRejected": rejected,
        "matchedFaces": int(len(genuine)),
        "genuineFaces": int(genuine.sum()),
        "nonEnrolledFaces": int((~genuine).sum()),
        "groundTruthFacesMissedByDetector": trials["unmatched_truth"],
        "top1IdentificationAccuracy": round(float(trials["top_correct"][genuine].mean()), 4),
        "genuineSimilarity": percentiles(trials["genuine_sims"]),
        "impostorSimilarity": percentiles(trials["impostor_sims"]),
        "recommendation": recommendation,
        "environment": {k: v for k, v in recommendation.items() if k.endswith("THRESHOLD")},
    }
    write_json(args.out / "recognition.json", summary)
    with (args.out / "threshold_sweep.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    plot_distribution(trials, recommendation, args.out / "similarity_distribution.png")
    print(summary)


def percentiles(values: np.ndarray) -> dict:
    return {f"p{p}": round(float(np.percentile(values, p)), 4) for p in (1, 5, 50, 95, 99)}


if __name__ == "__main__":
    main()

import argparse
from pathlib import Path

from common import Runtime, load_labels, read_image, write_json
from metrics import match_boxes, prf

SIZE_BUCKETS = [(0, 20), (20, 40), (40, 80), (80, 10_000)]


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate face detection against labelled boxes")
    parser.add_argument("--dataset", required=True, type=Path)
    parser.add_argument("--out", type=Path, default=Path("evaluation-output"))
    parser.add_argument("--iou", type=float, default=0.5)
    args = parser.parse_args()

    runtime = Runtime()
    labels = load_labels(args.dataset)
    tp = fp = fn = 0
    bucket_hits = {b: [0, 0] for b in SIZE_BUCKETS}
    for relative, entry in labels.items():
        image = read_image(args.dataset / relative)
        detections = [[float(v) for v in f.bbox] for f in runtime.detection.detect(image)]
        truth = [face["bbox"] for face in entry["faces"]]
        matched = match_boxes(detections, truth, args.iou)
        matched_truth = {gi for _, gi in matched}
        tp += len(matched)
        fp += len(detections) - len(matched)
        fn += len(truth) - len(matched)
        for gi, box in enumerate(truth):
            side = min(box[2] - box[0], box[3] - box[1])
            bucket = next(b for b in SIZE_BUCKETS if b[0] <= side < b[1])
            bucket_hits[bucket][1] += 1
            bucket_hits[bucket][0] += int(gi in matched_truth)

    report = {
        "iou": args.iou,
        "truePositives": tp, "falsePositives": fp, "falseNegatives": fn,
        **prf(tp, fp, fn),
        "recallBySideLength": {f"{lo}-{hi}px": (round(h / t, 4) if t else None) for (lo, hi), (h, t) in bucket_hits.items()},
    }
    write_json(args.out / "detection.json", report)
    print(report)


if __name__ == "__main__":
    main()

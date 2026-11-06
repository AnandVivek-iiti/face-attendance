import argparse
import json
import sys
from pathlib import Path

import numpy as np

MIN_ABSENT_SAMPLES = 20
SAFETY_BUFFER = 0.03


def collect(photos: Path, gallery_path: Path, out_path: Path) -> None:
    import cv2

    from app.config import Settings
    from app.models.registry import ModelRegistry
    from app.services.attendance import AttendanceService
    from app.utils.embedding_utils import EnrolledStudent, to_embedding_matrix

    settings = Settings(review_threshold=0.2, high_confidence_threshold=1.0, min_match_margin=0.0, warmup=False)
    registry = ModelRegistry(settings)
    service = AttendanceService(registry, settings)
    raw = json.loads(gallery_path.read_text())
    dim = registry.recognizer.embedding_dim
    students = [EnrolledStudent(sid, to_embedding_matrix(vectors, dim, sid)) for sid, vectors in raw.items()]
    rows = []
    for path in sorted(p for p in photos.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}):
        image = cv2.imread(str(path))
        if image is None:
            continue
        result = service.analyze([image], students, path.stem)
        for face in result["faces"]:
            detail = face["decisionDetail"] or {}
            rows.append({
                "photo": path.name,
                "studentId": face["studentId"],
                "similarity": face["similarity"],
                "margin": face["matchMargin"],
                "qualityPassed": detail.get("qualityPassed", False),
                "faceTier": face["qualityTier"],
                "imageStatus": detail.get("imageStatus"),
            })
        print(f"{path.name}: {len(result['faces'])} faces", file=sys.stderr)
    out_path.write_text(json.dumps(rows))


def load_truth(path: Path) -> dict[str, set[str]]:
    return {photo: set(ids) for photo, ids in json.loads(path.read_text()).items()}


def evaluate(rows: list[dict], truth: dict[str, set[str]], high: float, margin: float, review: float) -> dict:
    present_total = sum(len(ids) for ids in truth.values())
    high_hits, high_wrong, review_wrong, review_right = set(), 0, 0, 0
    lost_to_quality = 0
    for row in rows:
        sid = row["studentId"]
        if sid is None or row["similarity"] < review:
            continue
        present = sid in truth.get(row["photo"], set())
        identity_ok = row["similarity"] >= high and row["margin"] >= margin
        if identity_ok and row["qualityPassed"]:
            if present:
                high_hits.add((row["photo"], sid))
            else:
                high_wrong += 1
        else:
            if identity_ok:
                lost_to_quality += 1
            review_right += present
            review_wrong += not present
    return {
        "high": high, "margin": margin, "review": review,
        "auto_confirmed": len(high_hits),
        "auto_coverage": len(high_hits) / present_total if present_total else 0.0,
        "absent_students_auto_confirmed": high_wrong,
        "review_items": review_right + review_wrong,
        "review_absent_students": review_wrong,
        "identity_ok_but_sent_to_review_for_quality": lost_to_quality,
    }


def recommend(rows: list[dict], truth: dict[str, set[str]], current: dict) -> dict:
    absent = [r for r in rows if r["studentId"] is not None and r["studentId"] not in truth.get(r["photo"], set())]
    absent_clean = [r["similarity"] for r in absent if r["qualityPassed"]]
    absent_all = [r["similarity"] for r in absent]
    notes = []
    if len(absent_all) < MIN_ABSENT_SAMPLES:
        notes.append(
            f"Only {len(absent_all)} matches to students marked absent; need about {MIN_ABSENT_SAMPLES}+ "
            "for a trustworthy review threshold. Add photos where enrolled students are missing."
        )
    high = current["high"]
    if absent_clean:
        high = max(high if len(absent_all) < MIN_ABSENT_SAMPLES else 0.0, round(max(absent_clean) + SAFETY_BUFFER, 2))
    review = current["review"]
    if len(absent_all) >= MIN_ABSENT_SAMPLES:
        review = round(float(np.percentile(absent_all, 95)), 2)
    review = min(review, high)
    present_margins = [r["margin"] for r in rows if r["studentId"] in truth.get(r["photo"], set()) and r["similarity"] >= high]
    margin = current["margin"]
    if present_margins:
        margin = round(float(np.clip(np.percentile(present_margins, 5) * 0.5, 0.02, 0.10)), 2)
    return {"high": high, "review": review, "margin": margin, "notes": notes}


def report(rows: list[dict], truth: dict[str, set[str]], current: dict) -> None:
    picked = recommend(rows, truth, current)
    for label, params in (("current", current), ("recommended", picked)):
        print(label, json.dumps(evaluate(rows, truth, params["high"], params["margin"], params["review"]), indent=2))
    for note in picked["notes"]:
        print("WARNING:", note)
    print("\nAdd to .env:")
    print(f"HIGH_CONFIDENCE_THRESHOLD={picked['high']}")
    print(f"REVIEW_THRESHOLD={picked['review']}")
    print(f"MIN_MATCH_MARGIN={picked['margin']}")


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    c = sub.add_parser("collect")
    c.add_argument("--photos", type=Path, required=True)
    c.add_argument("--gallery", type=Path, required=True)
    c.add_argument("--out", type=Path, default=Path("observations.json"))
    s = sub.add_parser("sweep")
    s.add_argument("--observations", type=Path, default=Path("observations.json"))
    s.add_argument("--attendance", type=Path, required=True)
    s.add_argument("--high", type=float, default=0.55)
    s.add_argument("--review", type=float, default=0.40)
    s.add_argument("--margin", type=float, default=0.05)
    args = parser.parse_args()
    if args.command == "collect":
        collect(args.photos, args.gallery, args.out)
        return
    rows = json.loads(args.observations.read_text())
    report(rows, load_truth(args.attendance), {"high": args.high, "review": args.review, "margin": args.margin})


if __name__ == "__main__":
    main()

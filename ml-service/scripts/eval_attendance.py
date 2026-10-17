import argparse
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from itertools import product
from math import sqrt
from pathlib import Path

import cv2
import numpy as np

from app.config import Settings, get_settings
from app.models.registry import ModelRegistry
from app.services.detection import DetectionService
from app.services.quality_check import assess_face
from app.services.recognition import HIGH, REVIEW, UNKNOWN, RecognitionService
from app.utils.embedding_utils import EnrolledStudent, build_gallery, l2_normalize, student_similarity
from app.utils.image_utils import decode_image

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
OTHER_DIR = "_other"
NONFACE_DIR = "_nonface"
UNKNOWN_DIR = "_unknown"
SPECIAL_DIRS = {OTHER_DIR, NONFACE_DIR, UNKNOWN_DIR}
REF_PREFIX = "_REF"
NAME_PATTERN = re.compile(r"^(?P<photo>.+)__(?P<index>\d+)__(?P<x1>-?\d+)_(?P<y1>-?\d+)_(?P<x2>-?\d+)_(?P<y2>-?\d+)$")
SIDE_BUCKETS = [(0, 30), (30, 50), (50, 80), (80, 100000)]
IOU_MATCH = 0.4
GRID_HIGH = [0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70]
GRID_REVIEW = [0.25, 0.30, 0.35, 0.40, 0.45]
GRID_MARGIN = [0.0, 0.03, 0.05, 0.08, 0.12]
GRID_BYPASS = [None, 0.60, 0.65, 0.70]
BYPASS_OFF = 1.01
ENROLLED_KEYS = ["high_ok", "high_wrong", "review_ok", "review_wrong", "unknown", "unknown_rejected", "missed_detect"]


@dataclass
class Services:
    settings: Settings
    detection: DetectionService
    recognition: RecognitionService


@dataclass
class FaceRecord:
    bbox: np.ndarray
    side: float
    tier: str
    truth: str | None = None


@dataclass
class PhotoData:
    name: str
    records: list[FaceRecord]
    eligible: list[int]
    embeddings: np.ndarray
    missed: list[str] = field(default_factory=list)


def read_bgr(path: Path) -> np.ndarray:
    return cv2.imdecode(np.fromfile(str(path), dtype=np.uint8), cv2.IMREAD_COLOR)


def write_jpg(path: Path, image: np.ndarray) -> None:
    ok, buffer = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 92])
    if ok:
        buffer.tofile(str(path))


def list_images(folder: Path) -> list[Path]:
    return sorted(p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_SUFFIXES)


def overridden(settings: Settings, args) -> Settings:
    updates = {"warmup": False}
    mapping = {"det_size": "detection_size", "det_threshold": "detection_threshold", "pooling": "gallery_pooling"}
    for arg_name, field_name in mapping.items():
        value = getattr(args, arg_name, None)
        if value is not None:
            updates[field_name] = value
    if getattr(args, "flip", None):
        updates["embed_flip"] = args.flip == "on"
    if "detection_size" in updates:
        updates["detection_min_size"] = min(settings.detection_min_size, updates["detection_size"])
    return settings.model_copy(update=updates)


def build_services(settings: Settings) -> Services:
    registry = ModelRegistry(settings)
    return Services(
        settings,
        DetectionService(registry.detector),
        RecognitionService(registry.recognizer, settings),
    )


def build_enrol_gallery(services: Services, enrol_paths: list, labelled: dict, tier_rule: str, refs_per_student: int):
    samples, skipped = defaultdict(list), Counter()
    for path in enrol_paths:
        items = labelled.get(path.stem)
        if not items:
            continue
        _, photo = analyse_photo(services, path)
        attach_truth(photo, items)
        for row, index in enumerate(photo.eligible):
            record = photo.records[index]
            if record.truth is None or record.truth in SPECIAL_DIRS:
                continue
            if tier_rule == "ok" and record.tier != "ok":
                skipped["below tier ok"] += 1
                continue
            samples[record.truth].append((record.side, photo.embeddings[row]))
    students = []
    for student_id, items in sorted(samples.items()):
        items.sort(key=lambda item: -item[0])
        vectors = np.asarray([vector for _, vector in items[:refs_per_student]], dtype=np.float32)
        students.append(EnrolledStudent(student_id, l2_normalize(vectors)))
    return students, skipped


def analyse_photo(services: Services, path: Path):
    image = decode_image(path.read_bytes(), services.settings.max_image_pixels)
    records, crops, eligible = [], [], []
    for face in services.detection.detect(image):
        quality = assess_face(face, image, services.settings)
        records.append(FaceRecord(face.bbox, quality.side, quality.tier))
        if quality.tier != "reject":
            eligible.append(len(records) - 1)
            crops.append(services.recognition.align(image, face.keypoints))
    embeddings = services.recognition.embed(crops)
    return image, PhotoData(path.stem, records, eligible, embeddings)


def iou(a, b) -> float:
    inter_w = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    inter_h = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = inter_w * inter_h
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


def attach_truth(photo: PhotoData, labelled: list) -> int:
    pairs = sorted(
        ((iou(r.bbox, box), i, j) for i, r in enumerate(photo.records) for j, (box, _) in enumerate(labelled)),
        reverse=True,
    )
    used_records, used_labels = set(), set()
    for score, i, j in pairs:
        if score < IOU_MATCH:
            break
        if i in used_records or j in used_labels:
            continue
        photo.records[i].truth = labelled[j][1]
        used_records.add(i)
        used_labels.add(j)
    photo.missed = [truth for j, (_, truth) in enumerate(labelled) if j not in used_labels]
    return len(photo.records) - len(used_records)


def load_labels(labels_dir: Path):
    labelled, skipped, unparsed = defaultdict(list), 0, 0
    for folder in sorted(p for p in labels_dir.iterdir() if p.is_dir()):
        for path in list_images(folder):
            if path.stem.startswith(REF_PREFIX):
                continue
            if folder.name == UNKNOWN_DIR:
                skipped += 1
                continue
            parsed = NAME_PATTERN.match(path.stem)
            if parsed is None:
                unparsed += 1
                continue
            box = np.array([int(parsed[k]) for k in ("x1", "y1", "x2", "y2")], dtype=np.float32)
            labelled[parsed["photo"]].append((box, folder.name))
    return labelled, skipped, unparsed


def match_photo(photo: PhotoData, service: RecognitionService, gallery) -> list:
    if not photo.eligible:
        return []
    return service.match(photo.embeddings, gallery)


def decide_photo(photo: PhotoData, matches: list, service: RecognitionService) -> list:
    by_record = dict(zip(photo.eligible, matches))
    outcomes = []
    for index, record in enumerate(photo.records):
        match = by_record.get(index)
        if match is None:
            outcomes.append((UNKNOWN, None))
            continue
        decision = service.decide(match, record.tier)
        outcomes.append((decision, match.student_id if decision != UNKNOWN else None))
    return outcomes


def outcome_key(record: FaceRecord, decision: str, predicted: str | None, roster: set) -> str:
    if record.truth in roster:
        if decision == UNKNOWN:
            return "unknown_rejected" if record.tier == "reject" else "unknown"
        level = "high" if decision == HIGH else "review"
        return f"{level}_{'ok' if predicted == record.truth else 'wrong'}"
    kind = "nonface" if record.truth == NONFACE_DIR else "other"
    level = {HIGH: "high", REVIEW: "review", UNKNOWN: "unknown"}[decision]
    return f"{kind}_{level}"


def bucket_label(low: int, high: int) -> str:
    return f"{low}+" if high >= 100000 else f"{low}-{high}"


def bucket_of(side: float) -> str:
    for low, high in SIDE_BUCKETS:
        if low <= side < high:
            return bucket_label(low, high)
    return bucket_label(*SIDE_BUCKETS[-1])


def tally(photos: list, all_matches: list, service: RecognitionService, roster: set):
    counts, by_bucket = Counter(), defaultdict(Counter)
    for photo, matches in zip(photos, all_matches):
        outcomes = decide_photo(photo, matches, service)
        for record, (decision, predicted) in zip(photo.records, outcomes):
            if record.truth is None:
                continue
            key = outcome_key(record, decision, predicted, roster)
            counts[key] += 1
            if record.truth in roster:
                by_bucket[bucket_of(record.side)][key] += 1
        counts["missed_detect"] += sum(1 for truth in photo.missed if truth in roster)
    return counts, by_bucket


def metrics(counts: Counter) -> dict:
    enrolled = sum(counts[k] for k in ENROLLED_KEYS)
    high_bad = counts["high_wrong"] + counts["other_high"] + counts["nonface_high"]
    high_total = counts["high_ok"] + high_bad
    review = counts["review_ok"] + counts["review_wrong"] + counts["other_review"] + counts["nonface_review"]
    other_total = counts["other_high"] + counts["other_review"] + counts["other_unknown"]
    unknown = counts["unknown"] + counts["unknown_rejected"]
    return {
        "enrolled": enrolled,
        "high_total": high_total,
        "high_bad": high_bad,
        "auto_error": high_bad / high_total if high_total else 0.0,
        "auto_recall": counts["high_ok"] / enrolled if enrolled else 0.0,
        "review": review,
        "review_ok": counts["review_ok"],
        "unknown": unknown,
        "undetected": counts["missed_detect"],
        "rejected": counts["unknown_rejected"],
        "other_accepted": counts["other_high"] + counts["other_review"],
        "other_total": other_total,
        "workload": review + unknown,
    }


def wilson(failures: int, total: int, z: float = 1.96):
    if total == 0:
        return 0.0, 1.0
    p = failures / total
    denom = 1 + z * z / total
    centre = (p + z * z / (2 * total)) / denom
    half = z * sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / denom
    return max(0.0, centre - half), min(1.0, centre + half)


def pct(value: float) -> str:
    return f"{100 * value:5.1f}%"


def print_report(title: str, counts: Counter, by_bucket: dict) -> None:
    m = metrics(counts)
    low, high = wilson(m["high_bad"], m["high_total"])
    labelled = m["enrolled"] - m["undetected"] + sum(counts[k] for k in counts if k.startswith(("other_", "nonface_")))
    print(f"\n=== {title} ===")
    print(f"auto-accepted (HIGH): {m['high_total']}  wrong or non-roster: {m['high_bad']}  "
          f"error {pct(m['auto_error'])} (95% CI {pct(low)} to {pct(high)})")
    print(f"enrolled faces auto-accepted correctly: {pct(m['auto_recall'])} of {m['enrolled']}  "
          f"(FRR for auto-accept {pct(1 - m['auto_recall'])})")
    review_share = m["review_ok"] / m["review"] if m["review"] else 0.0
    print(f"review queue: {m['review']} faces, {100 * m['review'] / max(1, labelled):.1f} per 100 detected; "
          f"top suggestion right for {pct(review_share)} of them")
    print(f"never found by system: {m['unknown'] + m['undetected']} "
          f"(UNKNOWN {m['unknown'] - m['rejected']}, quality-rejected {m['rejected']}, undetected {m['undetected']})")
    if m["other_total"]:
        print(f"non-roster real faces accepted (HIGH or REVIEW): {m['other_accepted']} of {m['other_total']} "
              f"({pct(m['other_accepted'] / m['other_total'])})")
    print("\nenrolled faces by face side (px):  n   high_ok  review  unknown  high_wrong")
    for low_side, high_side in SIDE_BUCKETS:
        c = by_bucket.get(bucket_label(low_side, high_side))
        if not c:
            continue
        n = sum(c[k] for k in ENROLLED_KEYS)
        unknown = c["unknown"] + c["unknown_rejected"]
        print(f"  {bucket_label(low_side, high_side):>8}  {n:>14}  {c['high_ok']:>7}  "
              f"{c['review_ok'] + c['review_wrong']:>6}  {unknown:>7}  {c['high_wrong']:>10}")


def percentiles(values: list, points: list) -> str:
    if not values:
        return "n=0"
    parts = [f"p{p}={np.percentile(values, p):.2f}" for p in points]
    return f"n={len(values)} " + " ".join(parts)


def print_distributions(photos: list, gallery, roster: set, pooling: str) -> None:
    index = {sid: i for i, sid in enumerate(gallery.student_ids)}
    genuine, wrong = [], []
    genuine_by_bucket = defaultdict(list)
    for photo in photos:
        if not photo.eligible:
            continue
        scores = student_similarity(photo.embeddings, gallery, pooling)
        for row, record_index in enumerate(photo.eligible):
            record = photo.records[record_index]
            if record.truth is None or record.truth == NONFACE_DIR:
                continue
            if record.truth in index:
                genuine.append(float(scores[row, index[record.truth]]))
                genuine_by_bucket[bucket_of(record.side)].append(genuine[-1])
                others = np.delete(scores[row], index[record.truth])
                if others.size:
                    wrong.append(float(others.max()))
            else:
                wrong.append(float(scores[row].max()))
    print("\n=== similarity distributions (faces that were embedded) ===")
    print("same-person score :", percentiles(genuine, [5, 25, 50, 75]))
    print("best wrong student:", percentiles(wrong, [50, 90, 95, 99, 100]))
    for low_side, high_side in SIDE_BUCKETS:
        label = bucket_label(low_side, high_side)
        if label in genuine_by_bucket:
            print(f"same-person, side {label:>7}:", percentiles(genuine_by_bucket[label], [10, 50, 90]))


def run_sweep(photos: list, gallery, roster: set, settings: Settings, max_auto_error: float, top: int) -> None:
    rows = []
    for review in GRID_REVIEW:
        base = settings.model_copy(update={"review_threshold": review})
        matched = [match_photo(photo, RecognitionService(None, base), gallery) for photo in photos]
        for high, margin, bypass in product(GRID_HIGH, GRID_MARGIN, GRID_BYPASS):
            if high < review:
                continue
            bypass_value = BYPASS_OFF if bypass is None else bypass
            variant = base.model_copy(update={
                "high_confidence_threshold": high,
                "min_match_margin": margin,
                "quality_bypass_similarity": bypass_value,
            })
            counts, _ = tally(photos, matched, RecognitionService(None, variant), roster)
            rows.append(((high, review, margin, bypass), metrics(counts)))
    allowed = [row for row in rows if row[1]["auto_error"] <= max_auto_error]
    print(f"\n=== threshold sweep (cap on wrong auto-accepts: {pct(max_auto_error).strip()}) ===")
    if not allowed:
        print("no setting meets the cap; showing the lowest-error settings instead")
        allowed = sorted(rows, key=lambda row: row[1]["auto_error"])
    ranked = sorted(allowed, key=lambda row: (row[1]["workload"], row[1]["auto_error"]))[:top]
    print("high  review margin bypass | review unknown | wrong/auto  error")
    for (high, review, margin, bypass), m in ranked:
        bypass_text = "off" if bypass is None else f"{bypass:.2f}"
        print(f"{high:.2f}  {review:.2f}   {margin:.2f}   {bypass_text:>6} | {m['review']:>6} {m['unknown']:>7} | "
              f"{m['high_bad']:>3}/{m['high_total']:<5} {pct(m['auto_error'])}")
    print(f"bypass similarity uses margin {settings.quality_bypass_margin:.2f}; workload = review + unknown enrolled faces")


def print_config(settings: Settings, gallery, skipped: Counter, label_skipped: int, unparsed: int, extra: int,
                 enrol_count: int, photo_count: int, args) -> None:
    sizes = np.diff(np.append(gallery.starts, gallery.matrix.shape[0]))
    print(f"detection_size={settings.detection_size} detection_threshold={settings.detection_threshold} "
          f"pooling={settings.gallery_pooling} flip={settings.embed_flip}")
    print(f"thresholds: high={settings.high_confidence_threshold} review={settings.review_threshold} "
          f"margin={settings.min_match_margin} bypass={settings.quality_bypass_similarity}")
    print(f"gallery: {len(gallery.student_ids)} students from {enrol_count} enrolment photos, "
          f"embeddings per student min {sizes.min()} median {int(np.median(sizes))} max {sizes.max()} "
          f"(cap {args.refs_per_student}, tier rule {args.enrol_tier}, skipped {dict(skipped)})")
    print(f"test photos={photo_count} unlabelled detections={extra} left in {UNKNOWN_DIR}={label_skipped} "
          f"unparsed files={unparsed}")


def save_crop(image: np.ndarray, bbox: np.ndarray, path: Path) -> None:
    height, width = image.shape[:2]
    x1, y1, x2, y2 = (float(v) for v in bbox)
    pad = 0.25 * max(x2 - x1, y2 - y1)
    crop = image[max(0, int(y1 - pad)):min(height, int(y2 + pad)), max(0, int(x1 - pad)):min(width, int(x2 + pad))]
    if crop.size == 0:
        return
    longest = max(crop.shape[:2])
    if longest < 160:
        scale = 160 / longest
        crop = cv2.resize(crop, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    write_jpg(path, crop)


def crop_name(stem: str, index: int, bbox: np.ndarray) -> str:
    x1, y1, x2, y2 = (int(round(float(v))) for v in bbox)
    return f"{stem}__{index:03d}__{x1}_{y1}_{x2}_{y2}.jpg"


def guess_folders(photo: PhotoData, gallery, floor: float) -> list:
    guesses = [UNKNOWN_DIR] * len(photo.records)
    if not photo.eligible:
        return guesses
    scores = student_similarity(photo.embeddings, gallery)
    for row, index in enumerate(photo.eligible):
        best = int(scores[row].argmax())
        if scores[row, best] >= floor:
            guesses[index] = gallery.student_ids[best]
    return guesses


def folder_photo_stem(path: Path):
    parsed = NAME_PATTERN.match(path.stem)
    return parsed["photo"] if parsed else None


def copy_reference_crop(labels_dir: Path, student_id: str, enrol_stems: set) -> None:
    target = labels_dir / student_id / f"{REF_PREFIX}.jpg"
    if target.exists():
        return
    for path in list_images(labels_dir / student_id):
        if folder_photo_stem(path) in enrol_stems:
            write_jpg(target, read_bgr(path))
            return


def write_crops(services: Services, paths: list, labels_dir: Path, gallery, floor: float) -> int:
    written = 0
    for path in paths:
        image, photo = analyse_photo(services, path)
        guesses = guess_folders(photo, gallery, floor) if gallery else [UNKNOWN_DIR] * len(photo.records)
        for index, record in enumerate(photo.records):
            save_crop(image, record.bbox, labels_dir / guesses[index] / crop_name(path.stem, index, record.bbox))
            written += 1
    return written


def cluster_faces(embeddings: np.ndarray, photo_ids: list, threshold: float) -> list:
    clusters, labels = [], []
    for i in range(len(embeddings)):
        best, best_score = None, threshold
        for c, members in enumerate(clusters):
            if any(photo_ids[m] == photo_ids[i] for m in members):
                continue
            score = float(np.mean(embeddings[members] @ embeddings[i]))
            if score >= best_score:
                best, best_score = c, score
        if best is None:
            clusters.append([i])
            labels.append(len(clusters) - 1)
        else:
            clusters[best].append(i)
            labels.append(best)
    return labels


def write_grouped_crops(services: Services, paths: list, labels_dir: Path, threshold: float):
    entries = []
    for path in paths:
        image, photo = analyse_photo(services, path)
        rows = {index: row for row, index in enumerate(photo.eligible)}
        for index, record in enumerate(photo.records):
            target = labels_dir / UNKNOWN_DIR / crop_name(path.stem, index, record.bbox)
            save_crop(image, record.bbox, target)
            if index in rows and target.exists():
                entries.append((target, path.stem, photo.embeddings[rows[index]]))
    labels = cluster_faces(np.stack([e for _, _, e in entries]), [stem for _, stem, _ in entries], threshold) if entries else []
    for (target, _, _), label in zip(entries, labels):
        folder = labels_dir / f"p{label + 1:03d}"
        folder.mkdir(exist_ok=True)
        target.replace(folder / target.name)
    return len(entries), len(set(labels))


def run_prepare(args) -> None:
    services = build_services(overridden(get_settings(), args))
    root = Path(args.root)
    labels_dir = root / "labels"
    for name in SPECIAL_DIRS:
        (labels_dir / name).mkdir(parents=True, exist_ok=True)
    enrol_paths = list_images(root / "enrol_photos")
    if args.stage == "enrol" and args.group:
        grouped, folders = write_grouped_crops(services, enrol_paths, labels_dir, args.group_threshold)
        print(f"grouped {grouped} faces into {folders} folders named p001, p002, ... inside {labels_dir}")
        print("open each folder: move crops of a different person out, move whole folders of the same person together,")
        print(f"non-faces go to {NONFACE_DIR}, people not in the class to {OTHER_DIR}; folder names act as student IDs")
        print(f"faces too small to embed stay in {UNKNOWN_DIR} and are ignored")
        return
    if args.stage == "enrol":
        written = write_crops(services, enrol_paths, labels_dir, None, args.guess_floor)
        print(f"wrote {written} face crops into {labels_dir}\\{UNKNOWN_DIR}")
        print("create one folder per student inside labels, named with the studentId, and move each crop into it;")
        print(f"real people not on the roster go to {OTHER_DIR}, non-faces to {NONFACE_DIR}")
        return
    labelled, _, _ = load_labels(labels_dir)
    students, _ = build_enrol_gallery(services, enrol_paths, labelled, args.enrol_tier, args.refs_per_student)
    if not students:
        sys.exit("no labelled enrolment faces found; finish the enrol stage first")
    gallery = build_gallery(students)
    enrol_stems = {p.stem for p in enrol_paths}
    for student_id in gallery.student_ids:
        copy_reference_crop(labels_dir, student_id, enrol_stems)
    written = write_crops(services, list_images(root / "photos"), labels_dir, gallery, args.guess_floor)
    print(f"wrote {written} face crops of later-session photos into {labels_dir}")
    print(f"move every crop that sits in the wrong folder into the right student's folder, "
          f"{OTHER_DIR} or {NONFACE_DIR}; crops left in {UNKNOWN_DIR} are ignored")


def run_evaluate(args) -> None:
    settings = overridden(get_settings(), args)
    services = build_services(settings)
    root = Path(args.root)
    labelled, label_skipped, unparsed = load_labels(root / "labels")
    enrol_paths = list_images(root / "enrol_photos")
    students, skipped = build_enrol_gallery(services, enrol_paths, labelled, args.enrol_tier, args.refs_per_student)
    if not students:
        sys.exit("no labelled enrolment faces found; label the enrol_photos crops first")
    gallery = build_gallery(students)
    roster = set(gallery.student_ids)
    photo_paths = {p.stem: p for p in list_images(root / "photos")}
    photos, extra = [], 0
    for name, items in sorted(labelled.items()):
        path = photo_paths.get(name)
        if path is None:
            continue
        _, photo = analyse_photo(services, path)
        extra += attach_truth(photo, items)
        photos.append(photo)
    if not photos:
        sys.exit("no labelled faces from later-session photos found in " + str(root / "labels"))
    print_config(settings, gallery, skipped, label_skipped, unparsed, extra, len(enrol_paths), len(photos), args)
    matches = [match_photo(photo, services.recognition, gallery) for photo in photos]
    counts, by_bucket = tally(photos, matches, services.recognition, roster)
    if metrics(counts)["enrolled"] < 150:
        print("note: fewer than 150 labelled enrolled faces; treat every rate below as rough")
    print_report("current thresholds", counts, by_bucket)
    print_distributions(photos, gallery, roster, settings.gallery_pooling)
    run_sweep(photos, gallery, roster, settings, args.max_auto_error, args.top)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="eval_attendance")
    commands = parser.add_subparsers(dest="command", required=True)
    prepare = commands.add_parser("prepare")
    prepare.add_argument("--root", default="eval")
    prepare.add_argument("--stage", choices=["enrol", "test"], required=True)
    prepare.add_argument("--det-size", type=int, default=2048)
    prepare.add_argument("--det-threshold", type=float, default=0.3)
    prepare.add_argument("--refs-per-student", type=int, default=5)
    prepare.add_argument("--enrol-tier", choices=["ok", "any"], default="any")
    prepare.add_argument("--guess-floor", type=float, default=0.30)
    prepare.add_argument("--group", action="store_true")
    prepare.add_argument("--group-threshold", type=float, default=0.5)
    evaluate = commands.add_parser("evaluate")
    evaluate.add_argument("--root", default="eval")
    evaluate.add_argument("--det-size", type=int)
    evaluate.add_argument("--det-threshold", type=float)
    evaluate.add_argument("--pooling", choices=["max", "top2", "centroid"])
    evaluate.add_argument("--flip", choices=["on", "off"])
    evaluate.add_argument("--refs-per-student", type=int, default=5)
    evaluate.add_argument("--enrol-tier", choices=["ok", "any"], default="any")
    evaluate.add_argument("--max-auto-error", type=float, default=0.01)
    evaluate.add_argument("--top", type=int, default=8)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    run_prepare(args) if args.command == "prepare" else run_evaluate(args)


if __name__ == "__main__":
    main()
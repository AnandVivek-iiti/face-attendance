import argparse
import csv
import json
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

from facemark_reader import list_candidates, load_restricted, normalise_structure, read_member

ASSUMED_MODEL = "buffalo_l"


def l2(values: np.ndarray) -> np.ndarray:
    return values / np.maximum(np.linalg.norm(values, axis=-1, keepdims=True), 1e-12)


def load_id_map(path: Path | None) -> dict[str, str]:
    if path is None:
        return {}
    with path.open(newline="", encoding="utf-8") as handle:
        return {row["label"].strip(): row["studentId"].strip() for row in csv.DictReader(handle)}


def group_by_label(embeddings: np.ndarray, labels: list[str]) -> dict[str, np.ndarray]:
    grouped = defaultdict(list)
    for vector, label in zip(embeddings, labels):
        grouped[label].append(vector)
    return {label: np.stack(vectors) for label, vectors in grouped.items()}


def dedupe(vectors: np.ndarray, threshold: float) -> np.ndarray:
    normed = l2(vectors)
    kept: list[int] = []
    for index in range(len(normed)):
        if all(float(normed[index] @ normed[k]) < threshold for k in kept):
            kept.append(index)
    return normed[kept]


def diagnostics(grouped: dict[str, np.ndarray]) -> dict:
    labels = list(grouped)
    same, different = [], []
    flat = [(label, vec) for label in labels for vec in l2(grouped[label])]
    for i in range(len(flat)):
        for j in range(i + 1, len(flat)):
            value = float(flat[i][1] @ flat[j][1])
            (same if flat[i][0] == flat[j][0] else different).append(value)
    stats = lambda xs: {"count": len(xs), "mean": round(float(np.mean(xs)), 4),
                        "p01": round(float(np.percentile(xs, 1)), 4), "p99": round(float(np.percentile(xs, 99)), 4),
                        "min": round(float(np.min(xs)), 4), "max": round(float(np.max(xs)), 4)} if xs else None
    return {"sameStudentSimilarity": stats(same), "differentStudentSimilarity": stats(different)}


def analyse_member(zip_path: Path, member: str) -> dict:
    structure = normalise_structure(load_restricted(read_member(zip_path, member), member))
    report = {"member": member, "classes": {}}
    for class_name, (embeddings, labels) in structure.items():
        norms = np.linalg.norm(embeddings, axis=1)
        entry = {
            "embeddings": int(embeddings.shape[0]),
            "dimension": int(embeddings.shape[1]),
            "rawNormMin": round(float(norms.min()), 3),
            "rawNormMax": round(float(norms.max()), 3),
            "labelled": bool(labels),
        }
        if labels:
            grouped = group_by_label(embeddings, labels)
            exact_dupes = int(len(embeddings) - sum(len(dedupe(v, 0.9999)) for v in grouped.values()))
            entry.update({"students": len(grouped), "exactDuplicateEmbeddings": exact_dupes,
                          **diagnostics(grouped)})
            entry["warnings"] = build_warnings(entry)
        report["classes"][class_name] = entry
    return report


def build_warnings(entry: dict) -> list[str]:
    warnings = []
    if entry["exactDuplicateEmbeddings"]:
        warnings.append("contains exact duplicate embeddings (re-enrolment re-embedded the same files)")
    same, different = entry["sameStudentSimilarity"], entry["differentStudentSimilarity"]
    if same and different and same["mean"] - different["mean"] < 0.3:
        warnings.append("weak separation between same-student and different-student similarity; data may be unreliable")
    if different and different["max"] > 0.95:
        warnings.append("different students share near-identical embeddings; this store is unusable for recognition")
    if same and same["min"] < 0.2:
        warnings.append("some same-student pairs are nearly orthogonal; possible mislabels or bad crops")
    return warnings


def export_class(zip_path: Path, member: str, class_name: str, id_map: dict[str, str],
                 dedupe_threshold: float) -> dict:
    structure = normalise_structure(load_restricted(read_member(zip_path, member), member))
    if class_name not in structure:
        raise SystemExit(f"class {class_name!r} not found; available: {sorted(structure)}")
    embeddings, labels = structure[class_name]
    if not labels:
        raise SystemExit("selected structure has no labels and cannot be imported")
    students = []
    unmapped = []
    for label, vectors in sorted(group_by_label(embeddings, labels).items()):
        student_id = id_map.get(label)
        if student_id is None:
            unmapped.append(label)
            student_id = label
        kept = dedupe(vectors, dedupe_threshold)
        students.append({"studentId": student_id, "sourceLabel": label,
                         "embeddings": [[round(float(x), 6) for x in row] for row in kept]})
    return {"source": "facemark", "className": class_name, "embeddingModel": ASSUMED_MODEL,
            "normalised": True, "students": students, "unmappedLabels": unmapped}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Inspect or export FaceMark embeddings without modifying the source ZIP")
    sub = parser.add_subparsers(dest="command", required=True)
    inspect_cmd = sub.add_parser("inspect")
    inspect_cmd.add_argument("--zip", required=True, type=Path)
    inspect_cmd.add_argument("--report", type=Path)
    export_cmd = sub.add_parser("export")
    export_cmd.add_argument("--zip", required=True, type=Path)
    export_cmd.add_argument("--member", required=True)
    export_cmd.add_argument("--class-name", required=True)
    export_cmd.add_argument("--id-map", type=Path)
    export_cmd.add_argument("--dedupe-threshold", type=float, default=0.999)
    export_cmd.add_argument("--out", required=True, type=Path)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if not args.zip.is_file():
        print("ZIP not found", file=sys.stderr)
        return 1
    if args.command == "inspect":
        reports = []
        for member in list_candidates(args.zip):
            try:
                reports.append(analyse_member(args.zip, member))
            except Exception as error:
                reports.append({"member": member, "error": f"{type(error).__name__}: {error}"})
        text = json.dumps(reports, indent=2)
        if args.report:
            args.report.write_text(text, encoding="utf-8")
        print(text)
        return 0
    if args.out.resolve() == args.zip.resolve():
        print("refusing to overwrite the source ZIP", file=sys.stderr)
        return 1
    payload = export_class(args.zip, args.member, args.class_name, load_id_map(args.id_map), args.dedupe_threshold)
    args.out.write_text(json.dumps(payload), encoding="utf-8")
    print(f"exported {len(payload['students'])} students; unmapped labels: {len(payload['unmappedLabels'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

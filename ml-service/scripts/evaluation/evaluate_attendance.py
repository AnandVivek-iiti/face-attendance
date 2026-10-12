import argparse
import csv
from pathlib import Path

from common import Runtime, enroll, load_labels, load_sessions, read_image, write_json
from metrics import prf


def main() -> None:
    parser = argparse.ArgumentParser(description="End-to-end attendance evaluation using the full service pipeline")
    parser.add_argument("--dataset", required=True, type=Path)
    parser.add_argument("--out", type=Path, default=Path("evaluation-output"))
    args = parser.parse_args()

    runtime = Runtime()
    students, rejected = enroll(runtime, args.dataset)
    enrolled_ids = {s.student_id for s in students}
    labels = load_labels(args.dataset)
    sessions = load_sessions(args.dataset)

    totals = {"auto": [0, 0, 0], "auto_plus_review": [0, 0, 0]}
    rows = []
    for session, members in sessions.items():
        present = {f["studentId"] for m in members for f in labels[m]["faces"]
                   if f.get("studentId") in enrolled_ids}
        images = [read_image(args.dataset / m) for m in members]
        result = runtime.attendance.analyze(images, students, session)
        high = {f["studentId"] for f in result["faces"] if f["decision"] == "high_confidence"}
        review = {f["studentId"] for f in result["faces"] if f["decision"] == "needs_review" and f["studentId"]}
        for key, predicted in (("auto", high), ("auto_plus_review", high | review)):
            totals[key][0] += len(predicted & present)
            totals[key][1] += len(predicted - present)
            totals[key][2] += len(present - predicted)
        rows.append({
            "session": session, "imageStatus": result["imageQuality"]["status"],
            "present": len(present), "highConfidence": len(high), "needsReview": len(review),
            "falsePositiveAuto": ";".join(sorted(high - present)),
            "missedByAuto": ";".join(sorted(present - high)),
            "falsePositiveAfterReview": ";".join(sorted((high | review) - present)),
            "missedAfterReview": ";".join(sorted(present - (high | review))),
        })

    report = {
        "enrolledStudents": len(students),
        "enrollmentImagesRejected": rejected,
        "sessions": len(rows),
        "autoMarkedOnly": prf(*totals["auto"][:3]) | {"tp": totals["auto"][0], "fp": totals["auto"][1], "fn": totals["auto"][2]},
        "ifEveryReviewCandidateAccepted": prf(*totals["auto_plus_review"][:3])
        | {"tp": totals["auto_plus_review"][0], "fp": totals["auto_plus_review"][1], "fn": totals["auto_plus_review"][2]},
    }
    write_json(args.out / "attendance.json", report)
    with (args.out / "attendance_sessions.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    print(report)


if __name__ == "__main__":
    main()

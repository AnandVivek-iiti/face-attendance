# Evaluation

Measures detection, recognition, threshold calibration and end-to-end attendance on **your** labelled data.
Nothing here is pre-trained or pre-calibrated: defaults in `.env` are starting points until you run this.

## Dataset layout

```
dataset/
  enrollment/<studentId>/*.jpg        reference photos, one folder per enrolled student
  classroom/*.jpg                     classroom photos
  labels.json
```

`labels.json` maps each classroom image to its labelled faces. `studentId` is `null` for people who are not enrolled.

```json
{
  "classroom/a.jpg": {
    "faces": [
      {"bbox": [120, 80, 240, 220], "studentId": "ME23001"},
      {"bbox": [400, 90, 470, 180], "studentId": null}
    ]
  },
  "__sessions__": {"monday-class": ["classroom/a.jpg", "classroom/b.jpg"]}
}
```

`__sessions__` is optional; it groups photos taken in one lecture so cross-photo deduplication is evaluated. Without it, each photo is its own session.

## Commands

Run from `scripts/evaluation/`:

```
python evaluate_detection.py   --dataset ../../dataset --out ../../evaluation-output
python evaluate_recognition.py --dataset ../../dataset --out ../../evaluation-output
python evaluate_attendance.py  --dataset ../../dataset --out ../../evaluation-output
```

## Outputs

| file | content |
|---|---|
| `detection.json` | precision, recall, F1 at IoU 0.5, recall by face side length |
| `recognition.json` | top-1 accuracy, similarity percentiles, recommended thresholds, `.env` lines, warnings |
| `threshold_sweep.csv` | per-threshold precision, recall, F1, FAR, FRR, misidentification rate |
| `similarity_distribution.png` | genuine vs impostor similarity histogram with chosen thresholds |
| `attendance.json`, `attendance_sessions.csv` | end-to-end precision/recall/F1, per-session false positives and misses |

## Metric definitions

- **Top-1 identification accuracy**: among labelled enrolled faces matched to a detection, fraction whose highest-similarity student is the true student.
- **FAR**: fraction of impostor pairs (face vs. a student who is not that person) with similarity at or above the threshold.
- **FRR**: fraction of genuine pairs (face vs. its own student) below the threshold.
- **Precision / recall / F1 (recognition)**: a prediction is correct only if the face is accepted at the threshold and the identity is right. Wrong identities and accepted non-enrolled faces count as false positives.
- **Attendance metrics**: computed per student per session. `autoMarkedOnly` counts `high_confidence` only; `ifEveryReviewCandidateAccepted` shows the ceiling if a teacher confirms every `needs_review` candidate.

## Threshold selection

`HIGH_CONFIDENCE_THRESHOLD` is the lowest threshold whose FAR is at or below `--target-far` (default 0.0001).
`REVIEW_THRESHOLD` is the highest threshold that still keeps FRR at or below `--target-frr` (default 0.05), capped at the high threshold.
Treat the result as unreliable below roughly 200 genuine faces; the script warns.

ME217 attendance dashboard UI update

Files:
- src/components/SessionSummary.jsx
- src/pages/ReviewPage.jsx

Copy the included src folder into the root of your face-attendance project
and allow these two files to be replaced.

Changes:
- Replaces the previous summary tiles with the six requested metrics:
  Detected, Total enrolled, Present, Needs review, Absent, Unknown / Enroll.
- Shows a short definition for each metric directly below the six cards.
- Uses the total face-observation count for Detected (not unique identified students).
- Expands Classroom photographs and face locations by default after analysis.
- Preserves session metadata, warnings, table filters, confidence, evidence,
  manual attendance actions, export and finalize behaviour.

No backend, ML, database, dependency, environment, or migration changes.

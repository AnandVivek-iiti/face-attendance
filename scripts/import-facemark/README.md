# FaceMark import

Reads the original FaceMark ZIP without modifying it. Pickle data is loaded through an allow-listed unpickler, so arbitrary code in a tampered file cannot run.

```
python import_facemark.py inspect --zip FaceMark-Face_Recognition_Attendance_system-main.zip --report report.json
python import_facemark.py export  --zip FaceMark-....zip \
    --member "FaceMark-Face_Recognition_Attendance_system-main/facerecognition/static/classes" \
    --class-name cs203 --id-map labels.csv --out cs203.json
```

`labels.csv` has columns `label,studentId` and maps FaceMark's four-digit roll suffixes to real student IDs. Unmapped labels are exported unchanged and listed in `unmappedLabels`.

The export contains L2-normalised embeddings, deduplicated at cosine 0.999, with `embeddingModel` set to `buffalo_l` (verified by re-embedding the bundled sample photo, cosine 1.0000).
Your Node backend imports `cs203.json` into MongoDB; the ML service never touches the database.

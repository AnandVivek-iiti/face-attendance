import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "calibrate", Path(__file__).resolve().parents[1] / "scripts" / "calibrate_thresholds.py")
calibrate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(calibrate)


def rows():
    out = []
    for i in range(30):
        out.append({"photo": "p1.jpg", "studentId": f"in{i}", "similarity": 0.62 + (i % 5) * 0.02,
                    "margin": 0.2, "qualityPassed": True, "faceTier": "ok", "imageStatus": "good"})
    for i in range(25):
        out.append({"photo": "p1.jpg", "studentId": f"out{i}", "similarity": 0.30 + (i % 10) * 0.02,
                    "margin": 0.05, "qualityPassed": True, "faceTier": "ok", "imageStatus": "good"})
    out.append({"photo": "p1.jpg", "studentId": "in_blur", "similarity": 0.80, "margin": 0.3,
                "qualityPassed": False, "faceTier": "low", "imageStatus": "good"})
    return out


def truth():
    ids = {f"in{i}" for i in range(30)} | {"in_blur"}
    return {"p1.jpg": ids}


def test_evaluate_counts_quality_gate_and_absent_students():
    result = calibrate.evaluate(rows(), truth(), 0.55, 0.05, 0.40)
    assert result["auto_confirmed"] == 30
    assert result["absent_students_auto_confirmed"] == 0
    assert result["identity_ok_but_sent_to_review_for_quality"] == 1


def test_low_threshold_exposes_absent_student_false_accepts():
    result = calibrate.evaluate(rows(), truth(), 0.30, 0.0, 0.20)
    assert result["absent_students_auto_confirmed"] > 0


def test_recommend_stays_above_clean_absent_matches():
    picked = calibrate.recommend(rows(), truth(), {"high": 0.55, "review": 0.40, "margin": 0.05})
    assert picked["high"] >= 0.48 + 0.03 - 1e-9
    assert picked["review"] <= picked["high"]
    assert picked["notes"] == []


def test_recommend_warns_on_thin_data():
    thin = [r for r in rows() if r["studentId"].startswith("in")] + rows()[-3:-1]
    picked = calibrate.recommend(thin, truth(), {"high": 0.55, "review": 0.40, "margin": 0.05})
    assert picked["notes"]
    assert picked["review"] == 0.40

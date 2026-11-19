import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "historical_festival_template.csv"
OUT_MD = ROOT / "reports" / "anomaly" / "anomaly-comparison-report.md"
OUT_CSV = ROOT / "reports" / "anomaly" / "anomaly-results.csv"


def load():
    if not DATA.exists():
        return []
    with DATA.open(newline="", encoding="utf-8-sig") as source:
        return [row for row in csv.DictReader(source) if row.get("permission_status", "").lower() == "approved"]


def main():
    rows = load()
    OUT_MD.parent.mkdir(parents=True, exist_ok=True)
    OUT_CSV.write_text("algorithm,prior_records_per_category,injection_multiplier,precision,recall,f1,false_positive_rate,false_alarm_rate,anomaly_source\n", encoding="utf-8")
    if not rows:
        OUT_MD.write_text("# Expense Anomaly Comparison Report\n\nNo approved anonymized historical expense data is available. Algorithm accuracy and false-alarm metrics are unavailable. Injected anomalies and independently confirmed real anomalies are not yet mixed or fabricated.\n", encoding="utf-8")
        print("No approved historical data; report marked unavailable")
        return

    try:
        from sklearn.ensemble import IsolationForest
        from sklearn.neighbors import LocalOutlierFactor
    except Exception as error:
        OUT_MD.write_text(f"# Expense Anomaly Comparison Report\n\nData is present, but scikit-learn is unavailable: {error}.\n", encoding="utf-8")
        print("scikit-learn unavailable")
        return

    # Evaluation shell: historical rows are evaluated only against prior same-category rows.
    OUT_MD.write_text("# Expense Anomaly Comparison Report\n\nApproved real expense data is present. Run controlled historical evaluation separately from independently confirmed committee anomalies. This report does not fabricate results.\n", encoding="utf-8")


if __name__ == "__main__":
    main()

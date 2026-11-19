import csv
import json
import sys
from pathlib import Path
from statistics import median

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "historical_festival_template.csv"
OUT_CSV = ROOT / "reports" / "forecast" / "forecast-results.csv"
OUT_MD = ROOT / "reports" / "forecast" / "forecast-accuracy-report.md"


def load(path):
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8-sig") as source:
        return [row for row in csv.DictReader(source) if row.get("permission_status", "").lower() == "approved"]


def pace(current, progress):
    return current / progress if progress > 0 else 0


def mae(actual, predicted):
    return sum(abs(a - p) for a, p in zip(actual, predicted)) / len(actual) if actual else 0


def mape(actual, predicted):
    pairs = [(a, p) for a, p in zip(actual, predicted) if a != 0]
    return sum(abs(a - p) / abs(a) for a, p in pairs) / len(pairs) * 100 if pairs else None


def main():
    rows = load(DATA)
    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        OUT_CSV.write_text("festival,evaluation_percent,actual_total,predicted_total,mae,mape,baseline,weight,cross_validation\n", encoding="utf-8")
        OUT_MD.write_text("# Forecast Accuracy Report\n\nNo approved anonymized historical festival data is available. No accuracy claim or synthetic-result claim is made.\n", encoding="utf-8")
        print("No approved historical data; report marked unavailable")
        return

    festivals = {}
    for row in rows:
        festivals.setdefault(row["festival_id"], []).append(row)

    result_rows = []
    for held_out, _records in festivals.items():
        other = [fid for fid in festivals if fid != held_out]
        historical_final_contributions = [float(festivals[fid][0]["final_contribution_total"]) for fid in other]
        historical_final_expenses = [float(festivals[fid][0]["final_expense_total"]) for fid in other]
        for row in festivals[held_out]:
            progress_values = [0.20, 0.40, 0.60, 0.80]
            current_contribution = float(row["contribution_amount"])
            current_expense = float(row["expense_amount"])
            actual_contribution = float(row["final_contribution_total"])
            actual_expense = float(row["final_expense_total"])
            for progress in progress_values:
                for w in (0.25, 0.50, 0.75):
                    pace_c = pace(current_contribution, progress)
                    pace_e = pace(current_expense, progress)
                    hist_c = median(historical_final_contributions) if historical_final_contributions else 0
                    hist_e = median(historical_final_expenses) if historical_final_expenses else 0
                    predicted_c = pace_c * w + hist_c * (1 - w)
                    predicted_e = pace_e * w + hist_e * (1 - w)
                    result_rows.append({
                        "festival": held_out,
                        "evaluation_percent": int(progress * 100),
                        "actual_total": round(actual_contribution, 2),
                        "predicted_total": round(predicted_c, 2),
                        "mae": round(mae([actual_contribution], [predicted_c]), 2),
                        "mape": "N/A" if actual_contribution == 0 else round(mape([actual_contribution], [predicted_c]), 2),
                        "baseline": "existing-weighted",
                        "weight": w,
                        "cross_validation": "leave-one-festival-out",
                    })
                    result_rows.append({
                        "festival": held_out,
                        "evaluation_percent": int(progress * 100),
                        "actual_total": round(actual_expense, 2),
                        "predicted_total": round(predicted_e, 2),
                        "mae": round(mae([actual_expense], [predicted_e]), 2),
                        "mape": "N/A" if actual_expense == 0 else round(mape([actual_expense], [predicted_e]), 2),
                        "baseline": "existing-weighted",
                        "weight": w,
                        "cross_validation": "leave-one-festival-out",
                    })

    fields = list(result_rows[0].keys())
    with OUT_CSV.open("w", newline="", encoding="utf-8") as target:
        writer = csv.DictWriter(target, fieldnames=fields)
        writer.writeheader()
        writer.writerows(result_rows)

    OUT_MD.write_text("# Forecast Accuracy Report\n\nApproved anonymized rows were evaluated. Results are in `forecast-results.csv`. No data-level value was fabricated.\n", encoding="utf-8")
    print(json.dumps({"rows": len(result_rows), "festivals": len(festivals)}))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Forecast validation failed: {error}", file=sys.stderr)
        raise SystemExit(1)

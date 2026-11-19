import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "historical_festival_template.csv"
OUT = ROOT / "reports" / "budget" / "budget-alert-report.md"


def load():
    if not DATA.exists():
        return []
    with DATA.open(newline="", encoding="utf-8-sig") as source:
        return [row for row in csv.DictReader(source) if row.get("permission_status", "").lower() == "approved"]


def confusion(predicted, actual):
    if predicted and actual: return "tp"
    if predicted and not actual: return "fp"
    if not predicted and actual: return "fn"
    return "tn"


def main():
    rows = load()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        OUT.write_text("# Budget Alert Accuracy Report\n\nNo approved anonymized historical festival data is available. Alert accuracy is unavailable and no synthetic performance result is claimed.\n", encoding="utf-8")
        print("No approved historical data; report marked unavailable")
        return

    counts = {key: 0 for key in ("tp", "fp", "tn", "fn")}
    lead_times = []
    for row in rows:
        budget = float(row["budget"])
        final_expense = float(row["final_expense_total"])
        current_expense = float(row["expense_amount"])
        actual_overspent = final_expense > budget
        alert_80 = current_expense >= budget * 0.8
        alert_100 = current_expense >= budget
        predicted = alert_80 or alert_100
        counts[confusion(predicted, actual_overspent)] += 1
        if predicted and actual_overspent:
            lead_times.append(max(0, int(row["festival_duration_days"])))

    tp, fp, tn, fn = counts["tp"], counts["fp"], counts["tn"], counts["fn"]
    precision = tp / (tp + fp) if tp + fp else 0
    recall = tp / (tp + fn) if tp + fn else 0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0
    report = "# Budget Alert Accuracy Report\n\n" + "\n".join([
        f"- True Positives: {tp}", f"- False Positives: {fp}", f"- True Negatives: {tn}", f"- False Negatives: {fn}",
        f"- Precision: {precision:.4f}", f"- Recall: {recall:.4f}", f"- F1-score: {f1:.4f}",
        f"- Early-warning lead time (days): {round(sum(lead_times) / len(lead_times), 2) if lead_times else 'N/A'}",
        "\nThis evaluation compares generated alert states against final actual overspend outcomes.",
    ])
    OUT.write_text(report + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

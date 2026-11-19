import csv
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INPUT = ROOT / "evaluation" / "usability" / "usability_test_template.csv"
OUT = ROOT / "reports" / "usability" / "usability-report.md"


def main():
    scores = []
    if INPUT.exists():
        with INPUT.open(newline="", encoding="utf-8-sig") as source:
            for row in csv.DictReader(source):
                responses = []
                valid = True
                for index in range(1, 11):
                    raw = (row.get(f"q{index}") or "").strip()
                    if not raw:
                        valid = False
                        break
                    response = int(raw)
                    if response < 1 or response > 5:
                        raise ValueError(f"q{index} must be 1-5")
                    responses.append(response - 1 if index % 2 else 5 - response)
                if valid:
                    scores.append(sum(responses) * 2.5)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    if not scores:
        OUT.write_text("# Usability Report\n\nNo participant SUS responses were provided. No participant count, score, or usability conclusion is claimed.\n", encoding="utf-8")
        print("No participant responses")
        return

    OUT.write_text("# Usability Report\n\n" + "\n".join([
        f"- Individual SUS scores: {', '.join(f'{score:.1f}' for score in scores)}",
        f"- Average SUS score: {statistics.mean(scores):.2f}",
        f"- Minimum score: {min(scores):.2f}",
        f"- Maximum score: {max(scores):.2f}",
        f"- Standard deviation: {statistics.stdev(scores):.2f}" if len(scores) > 1 else "- Standard deviation: N/A (one participant)",
    ]) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

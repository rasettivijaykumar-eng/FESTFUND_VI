import argparse
import csv
import hashlib
import sys
from datetime import date
from decimal import Decimal, InvalidOperation

REQUIRED = [
    "festival_id", "date", "contribution_amount", "expense_amount", "expense_category",
    "festival_duration_days", "final_contribution_total", "final_expense_total",
    "budget", "data_source", "permission_status",
]

PERSONAL_FIELDS = {"name", "mobile", "phone", "address", "email", "donor_name", "donor_mobile"}


def validate(row, line):
    missing = [field for field in REQUIRED if not row.get(field)]
    if missing:
        raise ValueError(f"line {line}: missing fields: {', '.join(missing)}")
    forbidden = sorted(PERSONAL_FIELDS.intersection(row.keys()))
    if forbidden:
        raise ValueError(f"line {line}: personal fields are not allowed: {', '.join(forbidden)}")
    if not row["festival_id"].startswith("ANON-"):
        raise ValueError(f"line {line}: festival_id must be anonymized with ANON-")
    try:
        date.fromisoformat(row["date"])
    except ValueError as error:
        raise ValueError(f"line {line}: invalid ISO date") from error
    for field in ("contribution_amount", "expense_amount", "final_contribution_total", "final_expense_total", "budget"):
        try:
            value = Decimal(row[field])
        except InvalidOperation as error:
            raise ValueError(f"line {line}: invalid amount in {field}") from error
        if not value.is_finite() or value < 0:
            raise ValueError(f"line {line}: {field} must be non-negative")
    try:
        duration = int(row["festival_duration_days"])
    except ValueError as error:
        raise ValueError(f"line {line}: festival_duration_days must be a positive integer") from error
    if duration <= 0:
        raise ValueError(f"line {line}: festival_duration_days must be positive")
    if row["permission_status"].lower() not in {"approved", "pending", "rejected"}:
        raise ValueError(f"line {line}: invalid permission_status")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("csv_file")
    parser.add_argument("--deduplicate-output")
    args = parser.parse_args()

    seen = set()
    accepted = []
    with open(args.csv_file, newline="", encoding="utf-8-sig") as source:
        reader = csv.DictReader(source)
        if reader.fieldnames is None:
            raise ValueError("CSV header is missing")
        unknown = set(reader.fieldnames) - set(REQUIRED)
        if unknown:
            raise ValueError(f"unexpected personal or unsupported fields: {', '.join(sorted(unknown))}")
        for line, row in enumerate(reader, start=2):
            validate(row, line)
            if row["permission_status"].lower() != "approved":
                continue
            fingerprint = hashlib.sha256("|".join(row[field] for field in REQUIRED).encode()).hexdigest()
            if fingerprint not in seen:
                seen.add(fingerprint)
                accepted.append(row)

    if args.deduplicate_output:
        with open(args.deduplicate_output, "w", newline="", encoding="utf-8") as target:
            writer = csv.DictWriter(target, fieldnames=REQUIRED)
            writer.writeheader()
            writer.writerows(accepted)

    print(f"Validated approved records: {len(accepted)}")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Import failed: {error}", file=sys.stderr)
        raise SystemExit(1)

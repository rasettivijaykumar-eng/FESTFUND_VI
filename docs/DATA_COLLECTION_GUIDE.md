# Historical Festival Data Collection Guide

Use `data/historical_festival_template.csv` only for anonymized, authorized historical festival records.

## Required Controls

- Replace names and mobile numbers with no personal identifiers.
- Use anonymized IDs such as `ANON-FEST-001`.
- Record `data_source` and `permission_status` for every record.
- Do not create fake historical records and present them as real.
- Synthetic data must be explicitly named synthetic and used only for development/testing.
- Obtain authorized committee/admin consent before collecting or exporting festival records.

## CSV Fields

- `festival_id`: anonymized research identifier
- `date`: ISO `YYYY-MM-DD`
- `contribution_amount`: non-negative contribution amount
- `expense_amount`: non-negative expense amount
- `expense_category`: expense category
- `festival_duration_days`: positive whole number
- `final_contribution_total`: non-negative final total
- `final_expense_total`: non-negative final total
- `budget`: non-negative planned expense budget
- `data_source`: source description or location
- `permission_status`: approved/pending/rejected

Personal names, mobile numbers, addresses, emails, account IDs, and receipt identifiers must not be included.

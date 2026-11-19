# FestFund Load Test Report

**Status:** Script prepared; no load run executed.

- Environment: dedicated staging only
- Synthetic test festival: required
- Dedicated staging rate limit: required and must be documented before execution
- Production data and production festivals: prohibited

| Configuration | VUs | RPS | Avg latency | p90 | p95 | p99 | HTTP error rate | Timeout rate |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 50 VU | 50 | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| 100 VU | 100 | N/A | N/A | N/A | N/A | N/A | N/A | N/A |
| 200 VU | 200 | N/A | N/A | N/A | N/A | N/A | N/A | N/A |

No performance conclusion is claimed until k6 runs against an authorized staging environment.

# Results · nvidia/Nemotron-3.5-Super-VL

2026-10-15T16:00:58.167Z · 150 synthetic bills · endpoint `https://api.tokenfactory.us-north1.nebius.com/v1/` · settings `d0e4f725edc8`
Application-level evaluation on synthetic data, not an official benchmark. Method: [METHODOLOGY.md](METHODOLOGY.md).

| Metric | Result |
|---|---|
| Runs completed | 100.0% (150/150, 95% CI 98–100%) |
| Line prices read exactly | 99.4% (843/848, 95% CI 99–100%) |
| Line names + prices read | 96.0% (814/848, 95% CI 94–97%) |
| Printed total read | 100.0% (150/150, 95% CI 98–100%) |
| Tax read | 99.3% (149/150, 95% CI 96–100%) |
| Split computed by the model (tool call) | 100.0% (150/150, 95% CI 98–100%) |
| Model's split correct to the cent (all bills) | 95.3% (143/150, 95% CI 91–98%) |
| … on bills without a planted error | 94.2% (113/120, 95% CI 88–97%) |
| App validation rule passed | 100.0% (150/150, 95% CI 98–100%) |
| Bill read completely (every line, charge and total) | 96.0% (144/150, 95% CI 92–98%) |
| Split correct when the bill was read correctly | 98.6% (142/144, 95% CI 95–100%) |
| Planted wrong totals caught | 100.0% (30/30, 95% CI 89–100%) |
| False alarms (flag on a correctly read, correct bill) | 0.0% (0/114, 95% CI 0–3%) |
| Misreads on correct bills flagged by check_receipt | 83.3% (5/6, 95% CI 44–97%) |
| Latency per bill (p50 / p95) | 5.1s / 6.5s |
| Tokens per bill (in / out) | 8924 / 730 |
| Cost | $0.5001 total · $0.00333 per bill · $3.33 per 1,000 bills |
| Network retries | 0 |

Prices: $0.3/1M input, $0.9/1M output tokens (GET /v1/models?verbose=true on 2026-10-15).

## By category

| Category | Bills | Lines priced | Total read | Split correct | Planted caught | False alarms |
|---|---|---|---|---|---|---|
| food | 30 | 100.0% | 30/30 | 29/30 | 6/6 | 0/24 |
| groceries | 30 | 100.0% | 30/30 | 29/30 | 6/6 | 0/23 |
| home | 30 | 98.3% | 30/30 | 28/30 | 6/6 | 0/21 |
| party | 30 | 99.4% | 30/30 | 29/30 | 6/6 | 0/23 |
| travel | 30 | 99.4% | 30/30 | 28/30 | 6/6 | 0/23 |

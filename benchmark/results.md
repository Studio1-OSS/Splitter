# Results · nvidia/Nemotron-3.5-Super-VL

300 bills · endpoint `https://api.tokenfactory.us-north1.nebius.com/v1/` · synthetic: 2026-10-15T18:03:47.362Z · settings `fc90e0730ee6` · real: 2026-10-15T18:03:47.362Z · settings `fc90e0730ee6`
Application-level evaluation, not an official benchmark. Real receipts: CORD v2 (CC BY 4.0). Method: [METHODOLOGY.md](METHODOLOGY.md).

| Metric | All 300 | Synthetic 150 | Real 150 |
|---|---|---|---|
| Runs completed | 100.0% (300/300) | 100.0% (150/150) | 100.0% (150/150) |
| Model's split correct to the cent | 91.0% (273/300, 95% CI 87–94%) | 97.3% (146/150, 95% CI 93–99%) | 84.7% (127/150, 95% CI 78–90%) |
| Split computed by the model (tool call) | 100.0% (300/300) | 100.0% (150/150) | 100.0% (150/150) |
| Bill read completely (every line, charge and total) | 89.3% (268/300) | 97.3% (146/150) | 81.3% (122/150) |
| Split correct when the bill was read correctly | 98.1% (263/268) | 99.3% (145/146) | 96.7% (118/122) |
| Line prices read exactly | 98.8% (1309/1325) | 99.4% (843/848) | 97.7% (466/477) |
| Line names + prices read | 94.0% (1245/1325) | 96.1% (815/848) | 90.1% (430/477) |
| Printed total read | 99.7% (299/300) | 100.0% (150/150) | 99.3% (149/150) |
| Tax read | 95.3% (286/300) | 99.3% (149/150) | 91.3% (137/150) |
| App validation rule passed | 100.0% (300/300) | 100.0% (150/150) | 100.0% (150/150) |
| Planted wrong totals caught | 100.0% (30/30) | 100.0% (30/30) | n/a (none planted) |
| False alarms (flag on a correctly read, correct bill) | 0.0% (0/238) | 0.0% (0/116) | 0.0% (0/122) |
| Misreads on correct bills flagged by check_receipt | 65.6% (21/32) | 75.0% (3/4) | 64.3% (18/28) |
| Latency per bill (p50 / p95) | 4.7s / 6.7s | 5.0s / 6.7s | 4.5s / 5.8s |
| Tokens per bill (in / out) | 9162 / 649 | 9122 / 732 | 9203 / 567 |
| Cost per bill | $0.00333 | $0.00340 | $0.00327 |
| Cost per 1,000 bills | $3.33 | $3.40 | $3.27 |
| Network retries | 0 | 0 | 0 |

Prices: $0.3/1M input, $0.9/1M output tokens (GET /v1/models?verbose=true on 2026-10-15).

## Synthetic bills by category

| Category | Bills | Lines priced | Total read | Split correct | Planted caught | False alarms |
|---|---|---|---|---|---|---|
| food | 30 | 100.0% | 30/30 | 29/30 | 6/6 | 0/24 |
| groceries | 30 | 100.0% | 30/30 | 30/30 | 6/6 | 0/24 |
| home | 30 | 98.3% | 30/30 | 29/30 | 6/6 | 0/22 |
| party | 30 | 99.4% | 30/30 | 29/30 | 6/6 | 0/23 |
| travel | 30 | 99.4% | 30/30 | 29/30 | 6/6 | 0/23 |

## Reasoning off vs on

The same 300 bills, run again with reasoning on, set the way Nebius Token Factory exposes it: `reasoning_effort: "medium"` (the endpoint's default level) on both the bill read and the tool loop, with temperature and top_p left at Token Factory's defaults. Each cell is **off → on**. Splitter uses reasoning off.

| Metric | All 300 | Synthetic | Real |
|---|---|---|---|
| Splits correct to the cent | 91.0% → 98.0% | 97.3% → 98.7% | 84.7% → 97.3% |
| Bill read completely | 89.3% → 97.0% | 97.3% → 98.7% | 81.3% → 95.3% |
| Split correct when read correctly | 98.1% → 98.6% | 99.3% → 100.0% | 96.7% → 97.2% |
| Split computed by the model (tool call) | 100.0% → 100.0% | 100.0% → 100.0% | 100.0% → 100.0% |
| Runs completed | 100.0% → 100.0% | 100.0% → 100.0% | 100.0% → 100.0% |
| Planted wrong totals caught | 30/30 → 30/30 | 30/30 → 30/30 | n/a → n/a |
| False alarms | 0/238 → 0/261 | 0/116 → 0/118 | 0/122 → 0/143 |
| Latency p50 | 4.7s → 13.6s | 5.0s → 12.4s | 4.5s → 14.5s |
| Output tokens per bill | 649 → 3252 | 732 → 3155 | 567 → 3350 |
| Cost per bill | $0.0033 → $0.0057 | $0.0034 → $0.0056 | $0.0033 → $0.0058 |

Reasoning on runs at Token Factory's default temperature (above 0), so a single run carries some run-to-run noise. Run: 2026-10-15T18:47:22.919Z · settings `639167d2c826`.

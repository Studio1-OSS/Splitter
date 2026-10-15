# How the benchmark works

This is an application-level evaluation of one workflow (bill image → extraction → reasoning → calculator tool calls → validated split) on synthetic data. It isn't an official model benchmark.

## Dataset

`dataset/generate.mjs` builds 150 bills with a fixed seed. Each axis is assigned in rotation, so every category gets the same mix.

| Axis | Per category (30 bills) |
|---|---|
| Category | groceries, party, home & rent, food, travel (30 each, 150 in total) |
| Currency | 10 INR, 10 USD, 10 EUR |
| Photo condition | 12 clean, 6 faded (lower contrast, slight blur), 6 rotated (3–4° tilt), 6 long (9–12 lines) |
| Layout | the documents the category really uses: thermal receipts, A4 invoices, phone screenshots |
| Group size | 2–5 people |
| Planted errors | 6 bills (20%) whose printed total is wrong by a round amount |

- **Merchants fit the category.** A landlord bills rent and parking, a utility bills kWh and fixed charges, a cab company bills fares and tolls, and long statements repeat items by date.
- **Line names are unique** within each bill, so the note is never ambiguous.
- **Planted errors are balanced across the other axes:**
  - per category: 2 per currency; 2 clean, 2 faded, 1 rotated and 1 long; all layouts; several group sizes;
  - in total: 10 per currency, and planted bills in every condition and layout.
  
  So "errors caught" can't be explained by any one easy case.
- **Rendering:** Chrome via `playwright-core`, each bill screenshotted as its own element. Spot-check the images after any generator change.

## Ground truth

`dataset/cases.json` holds, for each bill:
- every line, charge and printed total, and the correct total;
- who had each line;
- the note shown to the model, written from the same truth.

The **expected split** comes from Splitter's money engine: integer minor units, largest-remainder rounding, and a left-over cent going by group order. The calculator tool uses the same rule, so a correct assignment always gives exactly the expected split.

## Model calls

| Step | Settings |
|---|---|
| Read the bill | Splitter's bill prompt and schema; `response_format: json_schema` (strict); reasoning off (`chat_template_kwargs.enable_thinking=false`); temperature 0 |
| Reason and calculate | Native function calling with the four Splitter tools; `tool_choice: auto`, at most 8 tool calls; reasoning off; temperature 0; final answer as JSON |

- **Why reasoning is off.** For JSON output it's faster and the output is just as clean. With it off, a free-text answer would carry the model's reasoning, but this workflow only uses JSON and tool calls.
- **`tool_choice: auto` is enough here.** The model called the tools on every bill.
- **Recorded per run:** the model id, endpoint, date and a settings fingerprint (a hash of model, endpoint, reasoning setting, prompts and tool definitions), so runs are only compared like for like.

## Scoring

| Metric | Definition |
|---|---|
| Line prices read | True lines whose amount appears in the model's lines (order-insensitive) |
| Bill read completely | Every line plus tax, tip, service charge, discount and printed total read exactly |
| Split computed by the model | The model made a successful `allocate_tax_tip` call |
| Split correct | **The model's own** `allocate_tax_tip` shares equal the expected split to the cent, for every person. No call means wrong |
| Split correct when read correctly | Split correct, among bills read completely; isolates reasoning from reading |
| Planted errors caught | `check_receipt` failed **and** the model reported the problem |
| False alarm | A flag on a bill that is correct **and** was read correctly |
| Misread flagged | A flag on a correct bill that was misread, meaning the check caught the model's own mistake |
| App validation rule | The model's shares add up to the bill's own lines and charges |

- **Failures count against the model.** A failed run counts as wrong on every metric; nothing is dropped.
- **Retries are only for network errors** (HTTP 429/5xx, timeouts), up to 3 times, and the count is reported. Wrong answers are never retried.
- **Rates come with Wilson 95% score intervals,** which stay honest at small counts and near 0% or 100%.

## Cost and latency

- **Cost** = the tokens each call reports (`usage.prompt_tokens` / `completion_tokens`) × the live prices from `GET /v1/models?verbose=true`. `PRICE_IN_PER_M` / `PRICE_OUT_PER_M` override them.
- **Latency** is wall-clock per bill, read plus reason, at concurrency 6.
- `results.json` stores the raw usage of every call, so the totals can be audited.

## Reproducibility

- **A second full run** on the final dataset agreed with the reported run on every one of the 150 bills (143 of 150 splits correct in both). It raised one flag on a correct bill that the reported run didn't.

## Limits

See [README → Limitations](README.md#limitations). In short: synthetic bills, unambiguous notes, tools that check arithmetic but not intent, and results that apply to one model, endpoint and date.

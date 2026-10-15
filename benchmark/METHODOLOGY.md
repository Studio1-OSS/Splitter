# How the benchmark works

This is an application-level evaluation of one workflow (bill image → extraction → reasoning → calculator tool calls → validated split). It isn't an official model benchmark.

It has two tracks, 300 bills in all, scored the same way:

| Track | Bills | What it tests |
|---|---|---|
| **Synthetic** | 150 rendered bills, 5 categories, 3 currencies, with planted errors | The whole workflow, under conditions we control and can balance |
| **Real receipts** | 150 photos from CORD v2 (Indonesian restaurants and cafés, rupiah) | Reading real photos: lighting, creases, shadows, odd fonts and local number formats |

Results are reported per track and combined. Each track records its own run date and settings fingerprint.

## Synthetic bills

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

## Real receipts

`dataset/import_cord.py` takes 150 photographed receipts from [CORD v2](https://huggingface.co/datasets/naver-clova-ix/cord-v2) (NAVER Clova AI, CC BY 4.0), with CORD's human labels as the ground truth. See [`dataset/real/README.md`](dataset/real/README.md) for the licence and citation.

- **Fixed order, no cherry-picking.** It reads test, then validation, then train, and keeps the first 150 receipts whose labels are unambiguous and add up:
  - at least 2 lines, every line priced, unique line names (so the note points at one line);
  - no priced add-ons or per-line discounts;
  - lines + tax + service − discount = printed total.
  
  Of the 416 receipts read (all of test and validation, then train up to #215), 266 were skipped, most for having a single line (168).
- **Who had what is generated,** with the same rules as the synthetic set (2–5 people; shared, paired or single lines). The receipts are real; the notes aren't.
- **No planted errors.** These totals are real, so the track measures reading, reasoning, splits and false alarms.
- **Photos** are resized to at most 1,600 px and re-encoded as JPEG. Identifying details were already blurred by the dataset authors.

## Ground truth

`dataset/cases.json` (synthetic) and `dataset/real/cases.json` (real) hold, for each bill:
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
- **The bill prompt is Splitter's own,** including its rule for number formats ("60.000" on a rupiah receipt is 60000). The rule was added after the first real-receipt run showed the model reading thousands separators as decimal points; both tracks were then rerun with it.
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

- **Run to run.** Before the number-format rule, two full synthetic runs agreed on every one of the 150 bills (143 splits correct in both).
- **Before and after the rule.** The reported synthetic run (with the rule) matched the earlier one on 147 of 150 splits; the 3 that changed all went from wrong to right. On the real track, 44 splits went from wrong to right and 3 from right to wrong.
- **Every run is kept as data:** `results.json` stores each call's raw usage, the model's reading and its tool calls, so any number here can be traced to a bill.

## Limits

See [README → Limitations](README.md#limitations). In short: clean synthetic bills, a narrow real track (Indonesian receipts, one currency), generated notes, tools that check arithmetic but not intent, and results that apply to one model, endpoint and date.

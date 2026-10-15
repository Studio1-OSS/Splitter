# Evals

Quick accuracy checks for Splitter's two AI stages. They make real calls to the model on Nebius Token Factory, so they use credits on your key (a full run costs a few cents).

Use them when you change a prompt, the bill schema or the model. For the full 150-bill benchmark with confidence intervals and a dashboard, see [`benchmark/`](../benchmark/README.md).

## Run them

```sh
pnpm eval
```

Set `NEBIUS_API_KEY` in `.env` first. `NEBIUS_MODEL` picks the model, which defaults to `nvidia/Nemotron-3.5-Super-VL`. Evalite prints a score per case and per file.

## What they check

**Reading bills** ([`receipt.eval.ts`](receipt.eval.ts)): the vision step.

Each sample bill in [`fixtures/`](fixtures) is read once and scored field by field (merchant, category, currency, date, tax, total and every line) against [`fixtures/expected.ts`](fixtures/expected.ts):

| Bill | What it tests |
|---|---|
| `receipt-beach-shack.png` | A restaurant receipt with two tax lines |
| `receipt-party-decor.png` | A shop receipt with no tax |
| `hotel-invoice.pdf` | A two-page invoice, read as one bill |
| `taxi-1.png` | A ride-app screenshot |
| `note-handwritten.png` | A handwritten "name amount thing" list |
| `not-a-bill.png` | A holiday photo, which must be rejected |

**Planning a settlement** ([`plan.eval.ts`](plan.eval.ts)): the reasoning step.

Each case gives the planner extracted bills and a group's own notes, then scores who paid, the amounts and who shares each expense:

| Case | What it tests |
|---|---|
| Trip | Who paid which bill, two taxis, drinks from the notes without Priya |
| Dinner only for three | Leaving one member out |
| Party | Drinks split by shares, decorations paid by "me" |
| Event | Festival passes at different prices |
| Home | Rent split 2:1:1, without Priya |
| Duplicate photo | The same bill twice becomes one expense |
| A payment back | "Aman sent me 300" is a payment, not an expense |
| Handwritten note | One note becomes separate expenses |

## Latest results

On `nvidia/Nemotron-3.5-Super-VL`:
- **Reading bills:** 98%.
- **Planning settlements:** 100%, all 8 cases.

These are small, hand-picked cases for catching regressions. For accuracy figures you can quote, use the benchmark.

## Adding or changing a sample bill

The sample bills are generated from HTML, so they're free to redistribute. Edit [`fixtures/generate.mjs`](fixtures/generate.mjs), add the expected fields to `fixtures/expected.ts`, then regenerate them (this needs Google Chrome):

```sh
node evals/fixtures/generate.mjs
```

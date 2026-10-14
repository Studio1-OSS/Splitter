# Evals

Accuracy checks against Nebius Token Factory. They use real API calls and AI credits on your key.

```sh
pnpm eval
```

- `receipt.eval.ts` (stage 1, vision): reads each sample bill in `fixtures/` and scores the fields against `fixtures/expected.ts`. It also checks that a non-bill photo is rejected.
- `plan.eval.ts` (stage 2, reasoning): text-only settlement plans, made from extracted bills plus notes like "Rakesh paid 200 twice". It scores payers, amounts and who shares each expense.

## Fixtures

The sample bills are generated from HTML by `fixtures/generate.mjs`, so they're free to redistribute. To regenerate them you need Google Chrome:

```sh
pnpm add -D playwright-core
node evals/fixtures/generate.mjs
```

# AGENTS.md

Guidance for AI coding agents (and humans) working in this repo.

## What this is

Splitter: a Next.js 16 app for splitting shared costs. Vision model `Qwen/Qwen3.8-27B` on Nebius Token Factory reads bills and plans settlements. Data lives in Turso/SQLite via Drizzle, auth is Better Auth (email + password), and notifications go through Novu. See README.md for the full picture.

## Commands

```sh
pnpm install
pnpm db:migrate        # apply drizzle/ migrations to DATABASE_URL (default file:local.db); rerun after changing DATABASE_URL
pnpm dev               # http://localhost:3000
pnpm test              # vitest: money engine, plans, services, upload checks
pnpm typecheck
pnpm build
pnpm eval              # live Nebius evals (spends AI credits on your key)
pnpm smoke:nebius      # one live bill read
pnpm smoke:batch       # live two-stage pipeline on sample bills
pnpm db:generate       # after editing src/server/db/schema.ts
```

Run `pnpm test && pnpm typecheck` before handing work back.

## Layout

- `src/lib/money/`: pure money engine. All amounts are **integer minor units** plus an ISO currency. Use `computeSplit()`; never do float maths on money.
- `src/server/ai/`: the only place that talks to the model.
  - `nebius.ts`: the provider adapter;
  - `receipt.ts`: the bill schema and prompt;
  - `planner.ts`: settlement planning;
  - `assistants.ts`: payment screenshots and Ask Splitter;
  - `request.ts`: upload checks and the AI-credit gate.
- `src/server/services/`: domain logic, with `db` passed in for testability. Every group-scoped read or write goes through `requireMember()` in `access.ts`.
- `src/server/actions.ts`: Server Actions; mutations and notifications.
- `src/components/batch/`: Settle with AI. `normalizePlan()` validates the model's draft.
- `src/components/split/`: single-expense flow; shared editors.
- `src/config/`: app name/links (`site.ts`), categories and group types.
- `DESIGN.md`: the design system. Read it before changing UI. Tokens live in `src/app/globals.css`.

## Rules

- **AI output is a draft.** Validate it (zod, then `normalizePlan`), let the user review it, and have the server recompute every split on save.
- **Spend credits for every AI call.** New AI endpoints must call `aiGuard(action)` from `src/server/ai/request.ts` after validating input. Add the action's cost in `AI_COSTS`.
- **Privacy:** bill images are members-only (`/api/bills/[id]` checks membership). Share pages expose display names and amounts only; bill photos, notes and the AI summary appear only when a member turns on "Show bill photos and notes".
- **Notifications** go through `notifyGroup()` with a stable `eventId`, and never block the action.
- **Migrations:** edit `schema.ts`, then run `pnpm db:generate`. Don't hand-edit old migrations.
- **UI:** phone-first; 44px touch targets; money inputs via `MoneyInput`. Both light and dark themes use tokens.
- Don't commit `.env`, `*.db` files or anything under `.next/`.

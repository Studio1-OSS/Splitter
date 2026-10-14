<div align="center">

<img src="docs/logo.svg" alt="Splitter logo" width="96" height="96">

# Splitter

### Drop the bills. Splitter settles it.

**Open-source shared expenses for trips, parties, events, dinners and the flat, powered by `Qwen/Qwen3.8-27B` vision on Nebius Token Factory. Drop in every bill, say who paid what in your own words, and Splitter works out a fair split for the whole group.**

Built with [Nebius Token Factory](https://dub.sh/aistudio) on **Qwen3.8-27B** · [Get started](#get-started) · [Overview](#overview) · [Architecture](#architecture) · [Features](#features) · [Data and privacy](#data-and-privacy)

![Next.js 16](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)
![Qwen3.8-27B](https://img.shields.io/badge/vision-Qwen3.8--27B-ff7759)
[![Nebius Token Factory](https://img.shields.io/badge/models-Nebius%20Token%20Factory-e0ff4f?labelColor=0b0b0b)](https://dub.sh/aistudio)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Built by Studio1 team](https://img.shields.io/badge/built%20by-Studio1%20team-ff6b1a)](https://studio1hq.com)

Run Splitter on your own machine with a [Nebius Token Factory](https://tokenfactory.nebius.com) API key for the model and a free [Novu](https://novu.co) account for notifications. The database is a local SQLite file.

</div>

---

<div align="center">

<table><tr><td>

<img src="docs/screenshots/hero.png" alt="Splitter landing page: 'Drop the bills. Splitter settles it.' with a demo turning a pile of trip bills into one settlement" width="900">

</td></tr></table>

</div>

_The landing page demo cycles through a trip, a party, an event, a dinner and a flat. Every number in it is computed by the app's own split engine._

## Overview

Splitter is a group expense app built around one idea: the bills already know most of the answer. A vision model reads them, your group adds the context only people know ("Rakesh paid 200 twice, Priya didn't drink"), and the app turns both into balances everyone can check.

**A starting point you can run and extend.** Bring your own keys and host it yourself. The [Features](#features) section says what's included and what's been verified.

### Settle with AI

Inside any group (trip, party, event, home, dinners), drop every bill at once: receipts, hotel invoices as PDFs, ride and payment screenshots, even a handwritten note. On a phone, scan bills one after another with the camera and tap **Done**. Then add a sentence about who paid what.

Splitter reads each bill, matches your notes, skips duplicates, turns payment screenshots into "paid back" entries and proposes one plan. You review and edit every expense before anything is saved, then **Publish & notify** sends each member their share.

<div align="center">

<table><tr><td>

<img src="docs/screenshots/settle-with-ai.png" alt="The Settle with AI review board: six proposed expenses with bill thumbnails, payers and split rules, a recorded UPI payment, and live per-person totals" width="900">

</td></tr></table>

</div>

_Eight uploads become six expenses and one payment back. The duplicate photo is skipped, the sunset photo is turned away, and the handwritten note becomes two expenses. Staged example content; the interface and AI output are real._

### Context for everyone

Every batch keeps its bills, the group's original notes and a one-line explanation per expense. Members see the bill photos; anyone can open a read-only share link (names and amounts only; photos and notes only if you allow it).

**Ask Splitter** answers questions like "Why do I owe ₹2,895?" from that group's ledger only, citing the expenses behind the number.

<div align="center">

<table><tr><td>

<img src="docs/screenshots/ask-splitter.png" alt="Ask Splitter explaining why Priya owes less than Mahima, citing the Kingfisher line she was left out of" width="900">

</td></tr></table>

</div>

### Everyday splitting

- **One bill:** scan it (PDFs and multi-page bills work), tap who had each line, and tax and tip are shared by what each person ordered. "How this was checked" shows the calculator tool calls behind the result.
- **Just an amount (in a group):** split equally, by shares (a couple counts as 2) or by exact amounts.
- **Groups and balances:** add friends by name; they claim their spot with an invite link. Splitter suggests the fewest payments to settle up and can fill a payment from a screenshot.
- **Quick split:** scan one receipt and share the result, without making a group (free account required, since AI credits are per account).

<div align="center">

<table><tr><td>

<img src="docs/screenshots/mobile.png" alt="Splitter on a phone: group balance, a settled batch, and recording a payment filled from a UPI screenshot" width="900">

</td></tr></table>

</div>

_Built for phones: bottom tab bar, bottom sheets, a camera scanner and safe-area insets._

## Architecture

![Splitter architecture: the browser prepares images and PDFs; the Next.js server validates, enforces membership and AI credits, and calls Qwen3.8-27B on Nebius Token Factory for bill reading, settlement planning and Ask Splitter; data lives in Turso/SQLite; Novu sends in-app notifications](docs/architecture.svg)

**Two AI stages, calculator tools, one money engine.**

1. **Read each bill (vision).** The browser resizes photos and renders PDF pages, then each bill (up to 4 pages) is sent to `Qwen/Qwen3.8-27B` with a JSON schema and thinking off. It returns lines, tax, tip, fees, totals, a category, the document type and any "paid by" hint. Anything that isn't a bill is rejected.
2. **Plan the settlement (reasoning + tool calls).** The extracted bills, your notes, the members and recent expenses go to the same model with thinking on and four calculator tools ([`src/server/ai/tools.ts`](src/server/ai/tools.ts)):
   - `check_receipt`: do the lines, tax, tip, fees and discount add up to the printed total?
   - `allocate_tax_tip`: who had which line, with charges spread proportionally;
   - `calculate_split`: equal, shares or exact amounts;
   - `validate_total`: do the shares add up to the total?

   The model decides who shares what and calls the tools for every number, then returns a draft plan: expenses with payer and split rule, payments already made, duplicates and questions. Every call is shown on the review screen under "How this was checked". If a model route doesn't support function calling, the app runs the same tools itself and says so.

The model never decides anything on its own. `normalizePlan()` checks every member, amount and exact split. Then the server recomputes every share with integer minor units and largest-remainder rounding, so balances always add up to the cent. Every group read and write goes through a membership check.

All provider-specific code lives in [`src/server/ai/nebius.ts`](src/server/ai/nebius.ts), behind an OpenAI-compatible client. To switch models, set `NEBIUS_MODEL` (and `NEXT_PUBLIC_AI_MODEL_LABEL` for the name shown in the UI), then run `pnpm smoke:nebius` to see whether the model supports image input, strict JSON, tool calls and the reasoning toggle. Set `AI_REASONING_PARAM=none` if it rejects the Qwen-style thinking switch.

```
src/
  app/                   Routes: landing, /split, /dashboard, /groups/[id] (+ /new, /batch, /batches/[id]), /s (share pages), /api
  components/batch/      Settle with AI: bill tray, review board, editor, normalizePlan()
  components/camera/     Multi-shot camera scanner
  components/split/      Single expense flow: receipt (or amount, in groups) → split → summary
  lib/money/             Money engine (pure, unit-tested)
  server/ai/             Nebius adapter, receipt schema, calculator tools, planner, Ask Splitter, credits
  server/services/       Groups, expenses, batches, bill images, settlements, access checks
  server/db/schema.ts    Drizzle schema
evals/                   Live accuracy evals with generated sample bills
```

## Get started

Use **Node.js 22+** and **pnpm**:

```sh
git clone https://github.com/Studio1-OSS/Splitter.git
cd Splitter
pnpm install
cp .env.example .env      # add NEBIUS_API_KEY, BETTER_AUTH_SECRET and the two Novu keys
pnpm db:migrate           # creates local.db (rerun whenever DATABASE_URL changes)
pnpm dev
```

Open **http://localhost:3000**. Generate the auth secret with `openssl rand -base64 32`.

| Variable | What it does |
| --- | --- |
| `NEBIUS_API_KEY` | **Required.** Bill reading, Settle with AI and Ask Splitter, via [Nebius Token Factory](https://tokenfactory.nebius.com). |
| `NEBIUS_MODEL` | Default `Qwen/Qwen3.8-27B`. Any vision model on Token Factory works; check it with `pnpm smoke:nebius --model <id>`. |
| `NEXT_PUBLIC_AI_MODEL_LABEL` | Model name shown in the UI (default `Qwen3.8`). |
| `AI_REASONING_PARAM` | `chat_template_kwargs` (default, Qwen-style thinking toggle) or `none`. |
| `NEBIUS_BASE_URL` | Default `https://api.tokenfactory.nebius.com/v1/`. |
| `DATABASE_URL` | `file:local.db` locally, or `libsql://…` on [Turso](https://turso.tech). |
| `DATABASE_AUTH_TOKEN` | Turso only. |
| `BETTER_AUTH_SECRET` | Signs sessions ([Better Auth](https://www.better-auth.com)). Required. |
| `BETTER_AUTH_URL` | The app's URL, e.g. `http://localhost:3000`. Required (https) in production; Vercel preview deployments fall back to their own URL. |
| `AI_CREDITS_PER_USER_PER_DAY` | Daily AI allowance per account (default 30). |
| `NOVU_SECRET_KEY`, `NEXT_PUBLIC_NOVU_APP_ID` | **Required.** In-app and email notifications via [Novu](https://novu.co). Production won't start without them. |
| `NOVU_WORKFLOW_ID` | The Novu workflow to trigger (default `splitter-activity`). |

**Check your setup:**

```sh
pnpm smoke:nebius   # reads one sample bill: image input, JSON output, thinking off
pnpm smoke:batch    # reads five sample bills and plans two settlements
```

### Keeping AI costs down

Every AI call spends daily credits from the signed-in account: reading a bill, a payment screenshot or answering a question costs 1, and a Settle-with-AI plan costs 3. When credits run out, manual entry still works, and they reset at midnight UTC. The account sheet shows what's left.

Measured on the sample bills, one bill read uses about 2,000 input and 200–300 output tokens. A plan with reasoning uses a few thousand of each. Photos are resized in the browser before upload, and an exact duplicate file isn't sent at all. Check current pricing on [Nebius Token Factory](https://tokenfactory.nebius.com).

### Notifications

1. Create a workflow in [Novu](https://novu.co) and put its identifier in `NOVU_WORKFLOW_ID`. Steps: **In-App** (subject `{{payload.title}}`, body `{{payload.body}}`, button to `{{payload.actionUrl}}`), then **Email** with the same title and body. Connect your own email provider (Resend, SendGrid, …) in Novu for production; Novu's built-in demo provider is for testing only.
2. Its template can use `{{payload.title}}`, `{{payload.body}}` and `{{payload.url}}`. For richer templates, these are also sent:
   - `billTitle`, `groupName`, `paidByName`;
   - `currency` (the symbol, e.g. `₹`);
   - `totalAmount` and `yourShare` (numbers);
   - `actionUrl`;
   - `{{subscriber.firstName}}`.
3. Copy the secret key and the Application Identifier into `.env`.
4. In production, turn on **HMAC** for the In-App integration. Splitter sends a `subscriberHash` so members can only read their own inbox.

Members are notified when an expense or a whole Settle-with-AI batch is published (with their own share), when a payment is recorded or confirmed, and when someone joins the group. Each event carries a stable `transactionId`, so retries never notify twice; a failed delivery is logged and never blocks saving.

### Deploy

1. Create a [Turso](https://turso.tech) database:
   ```sh
   turso db create splitter
   turso db show splitter --url
   turso db tokens create splitter
   ```
2. Run `DATABASE_URL=libsql://… DATABASE_AUTH_TOKEN=… pnpm db:migrate`.
3. Import the repo into [Vercel](https://vercel.com), set the variables above (with `BETTER_AUTH_URL` set to your domain for Production; leave it unset for Preview), and deploy. Use a separate `BETTER_AUTH_SECRET` per environment.

Vercel's Hobby plan is for non-commercial use. The live camera needs HTTPS, which Vercel provides.

### Tests and evals

```sh
pnpm test        # unit and service tests (money engine, plans, access, uploads)
pnpm typecheck
pnpm eval        # live accuracy against Nebius: bill reading and settlement planning
```

See [evals/README.md](evals/README.md) for the sample bills and how they're generated.

## Data and privacy

Groups, expenses, settlements and accounts are stored in SQLite: a local file, or Turso in production. Bill photos from Settle with AI are kept as small compressed copies (about 150 KB) next to the expense. Only members of that group can open them, and they're deleted with the expense. Quick-split photos are never stored.

Nothing leaves your server except calls to the services you configure:

- **Nebius Token Factory** receives bill images and the text needed to plan or answer: extracted bills, your notes, member display names and the group's expenses.
- **Novu** receives each member's account id, display name, email address and the notification text.

Splitter sends no telemetry of its own. Public share links show display names and amounts, never emails or account ids. Bill photos and the group's notes appear on a share link only if someone in the group turns that on.

## Features

| Area | Included |
| --- | --- |
| Settle with AI | Many bills at once (photos, PDFs, screenshots, notes), multi-shot camera scanner, notes with name and bill chips, duplicate and not-a-bill detection, questions back to you, editable review board, one-tap publish |
| Bill reading | Receipts, invoices, tickets, payment screenshots, handwritten notes, any language; multi-page bills; checked against the printed total |
| Splits | Per line, equally, by shares or exact amounts; tax, tip and fees shared by what each person had; any currency |
| Groups | Trip, party, event, home, dinners; invite links that let friends claim their name; spending by category |
| Settle up | Fewest-payments suggestions, payments recorded and confirmed, fill from a payment screenshot |
| Context | Batch pages with bills and notes, public share links, Ask Splitter |
| Limits | Daily AI credits per account (AI features need a free account) |
| Notifications | Novu in-app inbox plus an instant email: expenses and batches with each member's share, payments recorded and confirmed, new members |
| Design | Phone-first, dark mode, one token-based design system (`src/app/globals.css`) |

**What's been verified.** On October 14, 2026, these were tested locally against Nebius Token Factory with `Qwen/Qwen3.8-27B`:

- **Evals:** 97% field accuracy on the sample bills, 100% on eight settlement-planning cases.
- **Browser walkthrough** (desktop and phone, light and dark):
  - a trip with eight uploads, including a two-page PDF invoice, a duplicate, a non-bill photo and a UPI screenshot;
  - review, edit and publish;
  - a member joining by invite and seeing the Novu notification;
  - Ask Splitter;
  - settling up from a payment screenshot;
  - the camera scanner, with Chrome's test camera;
  - share pages, and outsiders getting 404s.

**Still to verify:** the live camera on real iOS and Android devices over HTTPS, and Turso in production.

### Extending it

- Multiple payers on one expense, and recurring household expenses.
- Edit a published expense, with a history.
- WhatsApp or SMS notifications through Novu channels.
- Currency conversion for trips abroad.

---

Building on open models? **[Join the Nebius builder program](https://dub.sh/aistudio)** for credits and support.

MIT License · Built by the [Studio1 team](https://studio1hq.com)

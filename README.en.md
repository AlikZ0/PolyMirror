# PolyMirror

> **Don't copy the whale's money. Copy the whale's decision with your own controlled amount.**

PolyMirror is a Chrome Extension (Manifest V3) plus a backend service that helps you:

1. find large, active Polymarket traders ("whales");
2. analyze their historical trades and performance;
3. follow selected traders;
4. see their new trades almost in real time;
5. set **your own** copy amount and safety limits;
6. receive a copy proposal — `[ COPY $10 ] [ SKIP ]`;
7. execute a matching trade **only after your explicit confirmation**;
8. track your own copied-trade statistics.

PolyMirror is **not** an unattended copy-trading bot. Every trade requires confirmation by default. Automatic mode is a separate, opt-in setting and only works where the execution venue can legitimately execute without a human (today: the demo simulation).

---

## Contents

- [Architecture](#architecture)
- [Installation](#installation)
- [Development](#development)
- [Build the extension](#build-the-extension)
- [Backend setup](#backend-setup)
- [Database setup](#database-setup)
- [Environment variables](#environment-variables)
- [Demo mode](#demo-mode)
- [Testing](#testing)
- [Production deployment](#production-deployment)
- [Polymarket integration](#polymarket-integration)
- [Security model](#security-model)
- [Data integrity & copy lifecycle](#data-integrity--copy-lifecycle)
- [Metric definitions](#metric-definitions)
- [Known limitations](#known-limitations)

---

## Architecture

```
apps/
  extension/   Chrome Extension (React, Vite, Tailwind, MV3)
    src/background/  service worker: WebSocket, notifications, badge
    src/content/     polymarket.com info panel for assisted orders (never clicks anything)
    src/popup/       compact popup
    src/pages/       dashboard, scanner, trader profile, watchlist, activity, statistics, settings
    src/services/    API client, reconnecting WebSocket
  backend/     Fastify + Prisma + PostgreSQL
    src/adapters/polymarket/   PolymarketAdapter interface, live + demo implementations
    src/adapters/execution/    ExecutionAdapter interface, demo + assisted implementations
    src/modules/               traders, trades, markets, analytics, tracking, copy, users, notifications
    src/websocket/             WebSocket hub and endpoint
    src/database/  src/config/
    prisma/                    schema, migrations, seed
packages/
  shared/      domain types, API contract, zod schemas, constants, analytics & copy math (pure, tested)
  ui/          small shadcn-style component library (Tailwind)
```

Data flow:

```
Polymarket public APIs ──► PolymarketAdapter ──► TradeWatcher (poll followed traders)
                                                     │ new fill (deduplicated by source id)
                                                     ▼
                         CopyEngine: size with YOUR settings → safety limits → PENDING proposal
                                                     │ WebSocket: copy.pending
                                                     ▼
            Extension: notification → confirmation modal → [COPY $10] (explicit click)
                                                     │ POST /api/copy/confirm
                                                     ▼
       CopyEngine: re-check ALL limits → ExecutionAdapter.submit → verify fill → CONFIRMED
```

Key design decisions:

- **Adapters.** All Polymarket access goes through `PolymarketAdapter`; order execution through `ExecutionAdapter`. Business logic never calls an API directly, so data sources can be replaced without touching it.
- **Pure domain logic in `packages/shared`.** P/L, ROI, win rate, drawdown, copy sizing and limit evaluation are pure functions shared by the backend and the extension, and covered by unit tests.
- **Server-side enforcement.** The extension shows previews, but every limit is enforced by the backend, immediately before an order is sent, under a per-user lock.
- **No composite "trader score".** PolyMirror shows raw metrics and lets you decide.

## Installation

Requirements: Node.js ≥ 20.10 (22 recommended), pnpm 10, PostgreSQL 14+ (or Docker), Chrome/Chromium ≥ 116.

```bash
pnpm install
cp .env.example apps/backend/.env      # adjust DATABASE_URL if needed
docker compose up -d postgres          # or use your own PostgreSQL
pnpm db:migrate                        # create the schema
```

## Development

```bash
pnpm dev          # backend (tsx watch, :4000) + extension (vite build --watch)
```

Then load `apps/extension/dist` as an unpacked extension (see below). Vite rebuilds on change; click "reload" on `chrome://extensions` for background/content-script changes.

Other commands:

| Command           | Purpose                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------- |
| `pnpm build`      | Typecheck packages, build backend (`apps/backend/dist`) and extension (`apps/extension/dist`) |
| `pnpm test`       | All unit tests (Vitest)                                                                       |
| `pnpm test:e2e`   | Extension end-to-end tests (Playwright)                                                       |
| `pnpm lint`       | ESLint                                                                                        |
| `pnpm format`     | Prettier                                                                                      |
| `pnpm typecheck`  | `tsc` in every package                                                                        |
| `pnpm db:migrate` | Create/apply migrations (development)                                                         |
| `pnpm db:deploy`  | Apply migrations (production/CI)                                                              |
| `pnpm db:seed`    | Seed demo markets/traders and a demo user                                                     |

## Build the extension

```bash
VITE_API_URL=http://localhost:4000 VITE_WEBSOCKET_URL=ws://localhost:4000/ws \
  pnpm --filter @polymirror/extension build
```

1. Open `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select `apps/extension/dist`.
3. Pin PolyMirror and open the popup; "Open dashboard" opens the full dashboard tab.

The API URL can also be changed at runtime in **Settings**. For a production build, set `VITE_API_URL`/`VITE_WEBSOCKET_URL` to your HTTPS/WSS backend and add that origin to `host_permissions` in `apps/extension/public/manifest.json`.

## Backend setup

```bash
cd apps/backend
cp ../../.env.example .env
pnpm dev            # development with reload
pnpm build && pnpm start   # production bundle
```

Health check: `GET /health`. System info (mode, execution kind): `GET /api/system`.

The backend runs two background jobs:

- **TradeWatcher** — polls followed traders every `WATCHER_POLL_INTERVAL_MS` (10 s in demo), stores new fills once (unique source id), and hands fresh ones to the copy engine.
- **Maintenance** — every `MAINTENANCE_INTERVAL_MS`: expires stale proposals, verifies submitted orders, fails unverifiable ones after `ASSISTED_VERIFY_TIMEOUT_SECONDS`, and marks confirmed copies to market.

## Database setup

PostgreSQL + Prisma (`apps/backend/prisma/schema.prisma`). Models: `User`, `Trader`, `TraderSnapshot`, `Market`, `Trade`, `TraderTrade` (reconstructed positions / historical trades), `Watchlist`, `CopySettings`, `CopyOrder`, `Notification`, `AnalyticsSnapshot`, `AuditLog`.

```bash
pnpm db:migrate     # dev: create + apply migrations
pnpm db:deploy      # prod: apply committed migrations
pnpm db:seed        # optional demo seed (DATA_MODE=demo only)
```

Money in copy trading (`CopySettings`, `CopyOrder`) is stored as `DECIMAL`; analytics caches use double precision.

## Environment variables

See [`.env.example`](.env.example). Important ones:

| Variable                          | Default                                           | Description                                                                                         |
| --------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `APP_ENV`                         | `development`                                     | `development` / `test` / `production`                                                               |
| `DATA_MODE`                       | `demo`                                            | `demo` (generated data, simulated execution) or `live` (Polymarket public APIs, assisted execution) |
| `DATABASE_URL`                    | —                                                 | PostgreSQL connection string                                                                        |
| `PORT`, `HOST`                    | `4000`, `0.0.0.0`                                 | HTTP server                                                                                         |
| `CORS_ORIGINS`                    | `chrome-extension://*,…`                          | Allowed browser origins (use your exact `chrome-extension://<id>` in production)                    |
| `API_URL`, `WEBSOCKET_URL`        | `http://localhost:4000`, `ws://localhost:4000/ws` | Documented backend URLs; the extension reads `VITE_API_URL` / `VITE_WEBSOCKET_URL` at build time    |
| `POLYMARKET_API_URL`              | `https://data-api.polymarket.com`                 | Data API                                                                                            |
| `POLYMARKET_GAMMA_URL`            | `https://gamma-api.polymarket.com`                | Market metadata                                                                                     |
| `POLYMARKET_CLOB_URL`             | `https://clob.polymarket.com`                     | Public market data (midpoint)                                                                       |
| `POLYMARKET_MAX_RPS`              | `5`                                               | Outbound request budget per backend instance                                                        |
| `WATCHER_POLL_INTERVAL_MS`        | `15000`                                           | Watcher polling interval                                                                            |
| `MAX_TRADE_AGE_SECONDS`           | `180`                                             | A whale trade older than this can't be copied                                                       |
| `ASSISTED_VERIFY_TIMEOUT_SECONDS` | `1800`                                            | How long to wait for a verified fill in assisted mode                                               |
| `SCANNER_ENRICH_LIMIT`            | `25`                                              | Live mode: how many scanner candidates get full per-trader metrics                                  |

No real credentials belong in the repository. PolyMirror never needs a private key.

## Demo mode

`DATA_MODE=demo` (default) runs a deterministic generator (`apps/backend/src/adapters/polymarket/demo`) with 40 traders, 23 markets, 90 days of history and a live trade stream. The UI shows a permanent **DEMO MODE** badge.

In demo mode:

- all traders, markets, trades, P/L and analytics are **synthetic**;
- execution is a **local simulation** (`DemoExecutionAdapter`) — it never contacts Polymarket or a wallet;
- demo markets have no Polymarket URL;
- automatic mode can be tried safely.

## Testing

```bash
pnpm test         # unit tests: shared (analytics, sizing, limits), backend (copy engine, adapters), extension
pnpm test:e2e     # Playwright: loads the built extension in Chromium against a mock backend
```

Covered: trader analytics, ROI, P/L, win rate, drawdown, copy amount, percentage sizing, max-trade limit, daily limit, duplicate-trade prevention, copy confirmation (incl. idempotency and concurrent confirmations), failed orders, automatic-mode rules, assisted verification/timeouts, live API parsing, 429 retry, WebSocket reconnect.

## Production deployment

1. Provision PostgreSQL; set `DATABASE_URL`.
2. Build and run the backend (Docker): `docker compose up -d --build`, or `pnpm build` + `node --env-file=.env apps/backend/dist/server.js` behind a TLS-terminating reverse proxy (set `TRUST_PROXY=true`).
3. Run `pnpm db:deploy` on every release (the Docker image does this on start).
4. Build the extension with HTTPS/WSS URLs, restrict `host_permissions` to your API origin, set `CORS_ORIGINS=chrome-extension://<your-extension-id>`, and publish via the Chrome Web Store.
5. Run a single watcher instance per database (or accept duplicate polling — inserts are idempotent).

## Polymarket integration

The integration was built against Polymarket's **official** TypeScript packages (`@polymarket/client`, `@polymarket/bindings`, `@polymarket/clob-client-v2`), which define the current endpoints and payload schemas. Only public, documented endpoints are used:

| Purpose                            | Endpoint                                                                           | Auth |
| ---------------------------------- | ---------------------------------------------------------------------------------- | ---- |
| Trader fills                       | `GET data-api /v2/trades?user=&takerOnly=false&start=&limit=&cursor=`              | none |
| Positions (P/L, avg price, status) | `GET data-api /v2/positions?user=&status=OPEN\|REDEEMABLE\|CLOSED`                 | none |
| Candidate discovery                | `GET data-api /v2/leaderboard?timePeriod=day\|week\|month\|all&sortBy=VOLUME\|PNL` | none |
| Trader stats                       | `GET data-api /v2/user-stats?user=`                                                | none |
| Market metadata & category tags    | `GET gamma-api /markets/keyset?condition_ids=&include_tag=true`                    | none |
| Reference price                    | `GET clob /midpoint?token_id=`                                                     | none |

Payload notes (from the official bindings): list responses are `{ data, pagination: { has_more, next_cursor } }`, decimals arrive as strings or numbers, timestamps as epoch seconds. Parsers drop malformed rows rather than guessing.

Rate limits: all outbound requests share a token bucket (`POLYMARKET_MAX_RPS`) with bounded retries on 429/5xx honoring `Retry-After`. Results are cached briefly (markets 10 min, prices 5 s, trader data 2 min).

**Order execution.** Polymarket CLOB orders must be signed with the user's wallet key (EIP-712, "L1" auth); API credentials ("L2") only authenticate requests. PolyMirror never holds keys, so live mode uses **assisted execution**:

1. You confirm the copy in PolyMirror; all limits are checked server-side.
2. PolyMirror opens the market on polymarket.com and shows the prepared order (amount, side, outcome). The content script only displays information — it does not click, fill or submit anything.
3. You place the order yourself on Polymarket.
4. PolyMirror verifies the fill via `GET /v2/trades?user=<your public wallet>` and only then marks the copy **Copied** (with the transaction hash). Without a matching fill within the timeout, it becomes **Failed**.

Because this needs a human, automatic mode does not execute in live mode. A future `ExecutionAdapter` that signs in the user's own wallet (e.g. via an injected EIP-1193 wallet prompting for each signature) can be added without changing business logic.

Items to double-check against the latest docs before going live: the array encoding of `condition_ids` for Gamma `/markets/keyset`, and whether `/midpoint` is the right reference for your slippage policy (vs. best ask).

## Security model

- **No wallet secrets anywhere.** Private keys, seed phrases and recovery phrases are never requested, stored (DB, `chrome.storage`, `localStorage`) or logged. The only wallet data is your _public_ address, used to verify fills.
- **Session tokens.** The extension registers an anonymous installation and receives a random 256-bit bearer token; the backend stores only its SHA-256 hash. Authorization headers are redacted from logs. The WebSocket token is sent in the first message, not the URL.
- **Least privilege.** Extension permissions: `storage`, `notifications`, `alarms`; host access only to the API and `polymarket.com` (info panel).
- **Explicit confirmation.** `POST /api/copy/confirm` requires `confirm: true`, the amount you saw (`expectedAmount`) and an idempotency key. Notifications only open the confirmation modal; they never execute.
- **Server-side limits** (`MAX_COPY_AMOUNT`, `MAX_DAILY_COPY_VOLUME`, `MAX_OPEN_POSITIONS`, `MIN_WHALE_TRADE_SIZE`, `MAX_SLIPPAGE`, `MIN_BALANCE`, `CONFIRMATION_REQUIRED`) are evaluated right before sending an order, under a per-user lock (in-process mutex + PostgreSQL advisory lock). User settings are clamped to hard ceilings in `SAFETY_LIMITS`. If any limit fails, the order is not sent.
- **After reconnects** nothing is executed automatically; pending proposals are re-fetched and re-validated (trade freshness `MAX_TRADE_AGE_SECONDS`, price drift) before any action.
- **Audit log** of registrations, watchlist changes, settings changes, confirmations, executions and failures.
- Rate limiting (global and stricter on register/confirm), CORS allow-list, body size limits, input validation with zod.

## Data integrity & copy lifecycle

```
PENDING ──confirm──► EXECUTING ──submit ok──► SUBMITTED ──verified fill──► CONFIRMED (Copied)
   │                     │                        │
   ├─skip──► SKIPPED     └─rejected──► FAILED     └─not verified in time──► FAILED
   └─expired / limit──► CANCELLED
```

- A sent request is never treated as success; only a verified fill yields `CONFIRMED`.
- Order / transaction identifiers are stored when available.
- Idempotency: one proposal per (user, whale trade) — unique DB constraint; confirmation requests carry an idempotency key (unique); state changes are compare-and-set.

## Metric definitions

Null metrics are shown as **N/A** — nothing is estimated or invented.

- **P/L** — realized + unrealized P/L of positions (Data API `total_pnl`, or average-cost reconstruction from fills in demo).
- **ROI** — total P/L ÷ total cost of positions.
- **Win rate** — closed positions with P/L > 0 ÷ all closed positions (N/A without closed positions).
- **Max drawdown** — largest peak-to-trough decline of the cumulative realized P/L curve (USDC), ordered by close time.
- **Volume** — Σ size × price of fills. **Average/largest position** — by position cost.
- **Concentration** — share of volume in the single most traded market.
- **Holding time** — only positions with both known entry and exit times.
- **Categories** — only categories present in market metadata; others are "Uncategorized".

## Known limitations

- Live trade detection is polling-based (the public Data API has no per-user push feed); latency ≈ poll interval plus Polymarket indexing delay.
- Live scanner metrics beyond leaderboard volume/P&L are computed for the top `SCANNER_ENRICH_LIMIT` candidates to respect rate limits; others show N/A and are excluded by filters that need them.
- Trader activity metrics use at most the 2,000 most recent fills.
- Copying is entry-only: whale SELLs are shown but not mirrored — close copied positions yourself.
- Balance cannot be read in assisted mode (requires authenticated CLOB access); the check is shown as "unknown".

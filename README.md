# PolyMirror

> **Don't copy the whale's money. Copy the whale's decision with your own controlled amount.**

Chrome Extension (MV3) + backend for analyzing large Polymarket traders and **manually** mirroring their trades with your own, strictly limited amount. Every copy requires explicit confirmation by default.

```
FIND WHALES → ANALYZE TRADER → FOLLOW → RECEIVE NEW TRADE → SET OWN AMOUNT → CONFIRM → EXECUTE → TRACK → ANALYZE OWN PERFORMANCE
```

- 📘 **Documentation (English):** [README.en.md](README.en.md)
- 📗 **Документация (русский):** [README.ru.md](README.ru.md)

## Quick start (demo mode)

```bash
pnpm install
docker compose up -d postgres            # or any PostgreSQL 14+
cp .env.example apps/backend/.env
pnpm db:migrate
pnpm dev                                 # backend on :4000 + extension build in watch mode
```

Load `apps/extension/dist` via `chrome://extensions` → Developer mode → **Load unpacked**.

Demo mode (default) uses generated data and a local execution simulation — **no real trades are ever executed** and the UI shows a **DEMO MODE** badge.

## Monorepo

| Path              | What                                                           |
| ----------------- | -------------------------------------------------------------- |
| `apps/extension`  | Chrome Extension — React, TypeScript, Vite, Tailwind, Recharts |
| `apps/backend`    | Fastify, Prisma, PostgreSQL, WebSocket                         |
| `packages/shared` | Types, API contract, zod schemas, analytics & copy math        |
| `packages/ui`     | UI components                                                  |

Commands: `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm test:e2e`, `pnpm lint`, `pnpm format`, `pnpm db:migrate`, `pnpm db:seed`.

## Safety at a glance

- Never asks for, stores or logs private keys / seed phrases.
- Your amount comes only from your settings — never from the whale's size.
- All limits (`MAX_COPY_AMOUNT`, `MAX_DAILY_COPY_VOLUME`, `MAX_OPEN_POSITIONS`, `MIN_WHALE_TRADE_SIZE`, `MAX_SLIPPAGE`, `MIN_BALANCE`, `CONFIRMATION_REQUIRED`) are re-checked server-side right before an order is sent.
- A copy counts as successful only after the fill is verified.
- Live mode uses only public Polymarket APIs; orders are placed by you on polymarket.com (PolyMirror never automates the page).

Not investment advice. Prediction markets involve risk of loss.

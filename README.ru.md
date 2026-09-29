# PolyMirror

> **Не копируй деньги кита. Копируй решение кита — своей контролируемой суммой.**

PolyMirror — Chrome Extension (Manifest V3) и backend-сервис, которые помогают:

1. находить крупных активных трейдеров Polymarket («китов»);
2. анализировать их исторические сделки и результаты;
3. выбирать трейдеров для отслеживания;
4. видеть их новые сделки почти в реальном времени;
5. задавать **свою** сумму копирования и лимиты безопасности;
6. получать предложение скопировать сделку — `[ COPY $10 ] [ SKIP ]`;
7. выполнять аналогичную сделку **только после явного подтверждения**;
8. вести собственную статистику скопированных сделок.

PolyMirror — **не** бот, который копирует сделки без участия пользователя. По умолчанию каждая сделка требует подтверждения. Автоматический режим — отдельная опция, по умолчанию выключена, и работает только там, где площадка исполнения легально позволяет исполнение без человека (сейчас — только симуляция в Demo Mode).

---

## Содержание

- [Архитектура](#архитектура)
- [Установка](#установка)
- [Разработка](#разработка)
- [Сборка расширения](#сборка-расширения)
- [Настройка backend](#настройка-backend)
- [База данных](#база-данных)
- [Переменные окружения](#переменные-окружения)
- [Demo Mode](#demo-mode)
- [Тестирование](#тестирование)
- [Production-развёртывание](#production-развёртывание)
- [Интеграция с Polymarket](#интеграция-с-polymarket)
- [Модель безопасности](#модель-безопасности)
- [Целостность данных и жизненный цикл копии](#целостность-данных-и-жизненный-цикл-копии)
- [Определения метрик](#определения-метрик)
- [Известные ограничения](#известные-ограничения)

---

## Архитектура

```
apps/
  extension/   Chrome Extension (React, Vite, Tailwind, MV3)
    src/background/  service worker: WebSocket, уведомления, badge
    src/content/     инфо-панель на polymarket.com для assisted-ордеров (ничего не нажимает)
    src/popup/       компактный popup
    src/pages/       dashboard, scanner, профиль трейдера, watchlist, activity, statistics, settings
    src/services/    API-клиент, WebSocket с переподключением
  backend/     Fastify + Prisma + PostgreSQL
    src/adapters/polymarket/   интерфейс PolymarketAdapter, live- и demo-реализации
    src/adapters/execution/    интерфейс ExecutionAdapter, demo- и assisted-реализации
    src/modules/               traders, trades, markets, analytics, tracking, copy, users, notifications
    src/websocket/             WebSocket-хаб и endpoint
    src/database/  src/config/
    prisma/                    схема, миграции, seed
packages/
  shared/      доменные типы, API-контракт, zod-схемы, константы, аналитика и расчёт копии (чистые функции с тестами)
  ui/          небольшая библиотека компонентов в стиле shadcn (Tailwind)
```

Поток данных:

```
Публичные API Polymarket ──► PolymarketAdapter ──► TradeWatcher (опрос отслеживаемых трейдеров)
                                                       │ новая сделка (дедупликация по source id)
                                                       ▼
          CopyEngine: сумма по ВАШИМ настройкам → лимиты безопасности → предложение PENDING
                                                       │ WebSocket: copy.pending
                                                       ▼
      Extension: уведомление → окно подтверждения → [COPY $10] (явный клик пользователя)
                                                       │ POST /api/copy/confirm
                                                       ▼
   CopyEngine: повторная проверка ВСЕХ лимитов → ExecutionAdapter.submit → проверка исполнения → CONFIRMED
```

Ключевые решения:

- **Адаптеры.** Весь доступ к Polymarket — через `PolymarketAdapter`, исполнение ордеров — через `ExecutionAdapter`. Бизнес-логика не вызывает API напрямую, поэтому источник данных можно заменить без её изменения.
- **Чистая доменная логика в `packages/shared`.** P/L, ROI, win rate, drawdown, расчёт суммы копии и проверка лимитов — чистые функции, общие для backend и расширения, покрыты тестами.
- **Проверки на сервере.** Расширение показывает превью, но все лимиты проверяет backend — непосредственно перед отправкой ордера, под блокировкой на пользователя.
- **Нет искусственного «Trader Score».** PolyMirror показывает исходные метрики, решение принимает пользователь.

## Установка

Требования: Node.js ≥ 20.10 (рекомендуется 22), pnpm 10, PostgreSQL 14+ (или Docker), Chrome/Chromium ≥ 116.

```bash
pnpm install
cp .env.example apps/backend/.env      # при необходимости поправьте DATABASE_URL
docker compose up -d postgres          # или используйте свой PostgreSQL
pnpm db:migrate                        # создать схему БД
```

## Разработка

```bash
pnpm dev          # backend (tsx watch, :4000) + расширение (vite build --watch)
```

Затем загрузите `apps/extension/dist` как распакованное расширение (см. ниже). Vite пересобирает при изменениях; для изменений background/content script нажмите «обновить» на `chrome://extensions`.

| Команда           | Назначение                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------- |
| `pnpm build`      | Typecheck пакетов, сборка backend (`apps/backend/dist`) и расширения (`apps/extension/dist`) |
| `pnpm test`       | Все unit-тесты (Vitest)                                                                      |
| `pnpm test:e2e`   | E2E-тесты расширения (Playwright)                                                            |
| `pnpm lint`       | ESLint                                                                                       |
| `pnpm format`     | Prettier                                                                                     |
| `pnpm typecheck`  | `tsc` во всех пакетах                                                                        |
| `pnpm db:migrate` | Создать/применить миграции (разработка)                                                      |
| `pnpm db:deploy`  | Применить миграции (production/CI)                                                           |
| `pnpm db:seed`    | Заполнить demo-рынки/трейдеров и demo-пользователя                                           |

## Сборка расширения

```bash
VITE_API_URL=http://localhost:4000 VITE_WEBSOCKET_URL=ws://localhost:4000/ws \
  pnpm --filter @polymirror/extension build
```

1. Откройте `chrome://extensions`, включите **Режим разработчика**.
2. **Загрузить распакованное** → выберите `apps/extension/dist`.
3. Закрепите PolyMirror и откройте popup; «Open dashboard» открывает полный dashboard во вкладке.

URL API можно изменить в **Settings**. Для production-сборки задайте `VITE_API_URL`/`VITE_WEBSOCKET_URL` с HTTPS/WSS и добавьте origin в `host_permissions` в `apps/extension/public/manifest.json`.

## Настройка backend

```bash
cd apps/backend
cp ../../.env.example .env
pnpm dev                    # разработка с перезагрузкой
pnpm build && pnpm start    # production-бандл
```

Health check: `GET /health`. Информация о режиме: `GET /api/system`.

Фоновые задачи backend:

- **TradeWatcher** — каждые `WATCHER_POLL_INTERVAL_MS` (в demo — 10 с) опрашивает отслеживаемых трейдеров, сохраняет новые сделки ровно один раз (уникальный source id) и передаёт свежие в copy engine.
- **Maintenance** — каждые `MAINTENANCE_INTERVAL_MS`: отменяет устаревшие предложения, проверяет отправленные ордера, переводит в Failed непроверенные по истечении `ASSISTED_VERIFY_TIMEOUT_SECONDS`, переоценивает открытые копии по рынку.

## База данных

PostgreSQL + Prisma (`apps/backend/prisma/schema.prisma`). Модели: `User`, `Trader`, `TraderSnapshot`, `Market`, `Trade`, `TraderTrade` (восстановленные позиции / история сделок), `Watchlist`, `CopySettings`, `CopyOrder`, `Notification`, `AnalyticsSnapshot`, `AuditLog`.

```bash
pnpm db:migrate     # dev: создать и применить миграции
pnpm db:deploy      # prod: применить закоммиченные миграции
pnpm db:seed        # demo-seed (только DATA_MODE=demo)
```

Денежные значения копи-трейдинга (`CopySettings`, `CopyOrder`) хранятся как `DECIMAL`; кэши аналитики — double precision.

## Переменные окружения

См. [`.env.example`](.env.example):

| Переменная                        | По умолчанию                                      | Описание                                                                                                         |
| --------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `APP_ENV`                         | `development`                                     | `development` / `test` / `production`                                                                            |
| `DATA_MODE`                       | `demo`                                            | `demo` (сгенерированные данные, симуляция исполнения) или `live` (публичные API Polymarket, assisted-исполнение) |
| `DATABASE_URL`                    | —                                                 | Строка подключения PostgreSQL                                                                                    |
| `PORT`, `HOST`                    | `4000`, `0.0.0.0`                                 | HTTP-сервер                                                                                                      |
| `CORS_ORIGINS`                    | `chrome-extension://*,…`                          | Разрешённые origin (в production — точный `chrome-extension://<id>`)                                             |
| `API_URL`, `WEBSOCKET_URL`        | `http://localhost:4000`, `ws://localhost:4000/ws` | URL backend; расширение читает `VITE_API_URL` / `VITE_WEBSOCKET_URL` при сборке                                  |
| `POLYMARKET_API_URL`              | `https://data-api.polymarket.com`                 | Data API                                                                                                         |
| `POLYMARKET_GAMMA_URL`            | `https://gamma-api.polymarket.com`                | Метаданные рынков                                                                                                |
| `POLYMARKET_CLOB_URL`             | `https://clob.polymarket.com`                     | Публичные рыночные данные (midpoint)                                                                             |
| `POLYMARKET_MAX_RPS`              | `5`                                               | Бюджет исходящих запросов на инстанс                                                                             |
| `WATCHER_POLL_INTERVAL_MS`        | `15000`                                           | Интервал опроса                                                                                                  |
| `MAX_TRADE_AGE_SECONDS`           | `180`                                             | Сделку кита старше этого возраста скопировать нельзя                                                             |
| `ASSISTED_VERIFY_TIMEOUT_SECONDS` | `1800`                                            | Сколько ждать подтверждённого исполнения в assisted-режиме                                                       |
| `SCANNER_ENRICH_LIMIT`            | `25`                                              | Live: для скольких кандидатов сканера считаются полные метрики                                                   |

Никаких реальных credentials в репозитории. PolyMirror никогда не нужен приватный ключ.

## Demo Mode

`DATA_MODE=demo` (по умолчанию) запускает детерминированный генератор (`apps/backend/src/adapters/polymarket/demo`): 40 трейдеров, 23 рынка, 90 дней истории и поток «живых» сделок. В интерфейсе постоянно отображается бейдж **DEMO MODE**.

В Demo Mode:

- все трейдеры, рынки, сделки, P/L и аналитика — **синтетические**;
- исполнение — **локальная симуляция** (`DemoExecutionAdapter`), никогда не обращается к Polymarket или кошельку;
- у demo-рынков нет ссылки на Polymarket;
- автоматический режим можно безопасно попробовать.

## Тестирование

```bash
pnpm test         # unit: shared (аналитика, расчёт суммы, лимиты), backend (copy engine, адаптеры), extension
pnpm test:e2e     # Playwright: собранное расширение в Chromium против mock-backend
```

Покрыто: аналитика трейдера, ROI, P/L, win rate, drawdown, сумма копии, процентный расчёт, лимит на сделку, дневной лимит, защита от дублей, подтверждение копии (включая идемпотентность и параллельные подтверждения), неудачные ордера, правила автоматического режима, assisted-верификация и таймауты, парсинг live API, повтор при 429, переподключение WebSocket.

## Production-развёртывание

1. Поднимите PostgreSQL, задайте `DATABASE_URL`.
2. Запустите backend: `docker compose up -d --build` или `pnpm build` + `node --env-file=.env apps/backend/dist/server.js` за reverse proxy с TLS (`TRUST_PROXY=true`).
3. На каждом релизе выполняйте `pnpm db:deploy` (Docker-образ делает это при старте).
4. Соберите расширение с HTTPS/WSS URL, ограничьте `host_permissions` вашим API, задайте `CORS_ORIGINS=chrome-extension://<id-расширения>`, опубликуйте в Chrome Web Store.
5. Один watcher на базу данных (дублирующий опрос безопасен — вставки идемпотентны).

## Интеграция с Polymarket

Интеграция сделана по **официальным** TypeScript-пакетам Polymarket (`@polymarket/client`, `@polymarket/bindings`, `@polymarket/clob-client-v2`), которые описывают актуальные endpoints и схемы ответов. Используются только публичные документированные endpoints:

| Назначение                          | Endpoint                                                                           | Авторизация |
| ----------------------------------- | ---------------------------------------------------------------------------------- | ----------- |
| Сделки трейдера                     | `GET data-api /v2/trades?user=&takerOnly=false&start=&limit=&cursor=`              | нет         |
| Позиции (P/L, средняя цена, статус) | `GET data-api /v2/positions?user=&status=OPEN\|REDEEMABLE\|CLOSED`                 | нет         |
| Поиск кандидатов                    | `GET data-api /v2/leaderboard?timePeriod=day\|week\|month\|all&sortBy=VOLUME\|PNL` | нет         |
| Статистика трейдера                 | `GET data-api /v2/user-stats?user=`                                                | нет         |
| Метаданные рынков и теги категорий  | `GET gamma-api /markets/keyset?condition_ids=&include_tag=true`                    | нет         |
| Референсная цена                    | `GET clob /midpoint?token_id=`                                                     | нет         |

Формат (по официальным bindings): списки — `{ data, pagination: { has_more, next_cursor } }`, числа — строки или числа, время — epoch-секунды. Некорректные строки отбрасываются, а не угадываются.

Лимиты запросов: все исходящие запросы проходят через общий token bucket (`POLYMARKET_MAX_RPS`) с ограниченными повторами при 429/5xx с учётом `Retry-After`. Кэш: рынки 10 мин, цены 5 с, данные трейдера 2 мин.

**Исполнение ордеров.** Ордера Polymarket CLOB должны быть подписаны ключом кошелька пользователя (EIP-712, L1-авторизация); API-ключи (L2) лишь аутентифицируют запросы. PolyMirror никогда не хранит ключи, поэтому в live-режиме используется **assisted execution**:

1. Вы подтверждаете копию в PolyMirror; все лимиты проверяются на сервере.
2. PolyMirror открывает рынок на polymarket.com и показывает подготовленный ордер (сумма, сторона, исход). Content script только отображает информацию — ничего не нажимает, не заполняет и не отправляет.
3. Вы сами размещаете ордер на Polymarket.
4. PolyMirror проверяет исполнение через `GET /v2/trades?user=<ваш публичный кошелёк>` и только после этого помечает копию как **Copied** (с хэшем транзакции). Если подтверждённого исполнения нет в течение таймаута — **Failed**.

Так как требуется человек, автоматический режим в live-режиме не исполняет ордера. В будущем можно добавить `ExecutionAdapter`, подписывающий ордера в собственном кошельке пользователя (например, через EIP-1193-кошелёк с запросом подписи на каждый ордер), без изменения бизнес-логики.

Перед запуском в live стоит перепроверить по актуальной документации: формат передачи массива `condition_ids` в Gamma `/markets/keyset` и подходит ли `/midpoint` для вашей политики slippage (vs. best ask).

## Модель безопасности

- **Никаких секретов кошелька.** Приватные ключи, seed-фразы и recovery-фразы никогда не запрашиваются, не хранятся (БД, `chrome.storage`, `localStorage`) и не логируются. Единственные данные кошелька — ваш _публичный_ адрес для проверки исполнения.
- **Сессионные токены.** Расширение регистрирует анонимную установку и получает случайный 256-битный bearer-токен; backend хранит только SHA-256 хэш. Заголовки Authorization вырезаются из логов. Токен WebSocket передаётся первым сообщением, не в URL.
- **Минимальные права.** Permissions расширения: `storage`, `notifications`, `alarms`; доступ к хостам — только API и `polymarket.com` (инфо-панель).
- **Явное подтверждение.** `POST /api/copy/confirm` требует `confirm: true`, сумму, которую вы видели (`expectedAmount`), и ключ идемпотентности. Уведомления только открывают окно подтверждения и никогда не исполняют сделку.
- **Лимиты на сервере** (`MAX_COPY_AMOUNT`, `MAX_DAILY_COPY_VOLUME`, `MAX_OPEN_POSITIONS`, `MIN_WHALE_TRADE_SIZE`, `MAX_SLIPPAGE`, `MIN_BALANCE`, `CONFIRMATION_REQUIRED`) проверяются непосредственно перед отправкой ордера под блокировкой пользователя (mutex в процессе + advisory lock PostgreSQL). Настройки ограничиваются жёсткими потолками `SAFETY_LIMITS`. Если хотя бы один лимит нарушен — ордер не отправляется.
- **После переподключения** ничего не исполняется автоматически; pending-предложения перезапрашиваются и перепроверяются (свежесть `MAX_TRADE_AGE_SECONDS`, движение цены).
- **Audit log** регистраций, изменений watchlist и настроек, подтверждений, исполнений и ошибок.
- Rate limiting (глобальный и более строгий на register/confirm), allow-list CORS, лимиты размера тела, валидация zod.

## Целостность данных и жизненный цикл копии

```
PENDING ──confirm──► EXECUTING ──submit ok──► SUBMITTED ──исполнение подтверждено──► CONFIRMED (Copied)
   │                     │                        │
   ├─skip──► SKIPPED     └─отказ──► FAILED        └─не подтверждено вовремя──► FAILED
   └─истекло / лимит──► CANCELLED
```

- Отправленный запрос никогда не считается успехом; `CONFIRMED` — только после проверки исполнения.
- Идентификаторы ордера/транзакции сохраняются, если доступны.
- Идемпотентность: одно предложение на (пользователь, сделка кита) — уникальный индекс в БД; подтверждение содержит ключ идемпотентности (уникальный); смена статусов — compare-and-set.

## Определения метрик

Недоступные метрики показываются как **N/A** — ничего не оценивается «на глаз» и не выдумывается.

- **P/L** — реализованный + нереализованный P/L позиций (`total_pnl` из Data API или восстановление по средней цене из сделок в demo).
- **ROI** — общий P/L ÷ общая стоимость позиций.
- **Win rate** — закрытые позиции с P/L > 0 ÷ все закрытые позиции (N/A без закрытых позиций).
- **Max drawdown** — наибольшее падение от пика до минимума кривой накопленного реализованного P/L (USDC) по времени закрытия.
- **Volume** — Σ size × price сделок. **Средняя/крупнейшая позиция** — по стоимости позиции.
- **Concentration** — доля объёма в самом торгуемом рынке.
- **Holding time** — только позиции с известным временем входа и выхода.
- **Категории** — только присутствующие в метаданных рынка; остальные — «Uncategorized».

## Известные ограничения

- Обнаружение сделок в live основано на опросе (у публичного Data API нет push-потока по пользователю); задержка ≈ интервал опроса + задержка индексации Polymarket.
- В live-сканере метрики сверх volume/P&L из лидерборда считаются для топ-`SCANNER_ENRICH_LIMIT` кандидатов (из-за лимитов API); у остальных — N/A, и фильтры, которым нужны эти метрики, их исключают.
- Метрики активности используют не более 2 000 последних сделок трейдера.
- Копируются только входы: продажи кита показываются, но не зеркалируются — закрывайте скопированные позиции сами.
- Баланс в assisted-режиме прочитать нельзя (нужен авторизованный доступ к CLOB); проверка показывается как «unknown».

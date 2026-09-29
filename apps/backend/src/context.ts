import type { FastifyBaseLogger } from 'fastify';
import { AssistedExecutionAdapter } from './adapters/execution/assistedExecution';
import { DemoExecutionAdapter } from './adapters/execution/demoExecution';
import type { ExecutionAdapter } from './adapters/execution/types';
import { DemoPolymarketAdapter } from './adapters/polymarket/demo/demoAdapter';
import { LivePolymarketAdapter } from './adapters/polymarket/live/liveAdapter';
import type { PolymarketAdapter } from './adapters/polymarket/types';
import type { AppConfig } from './config';
import type { Db } from './database/prisma';
import { StatisticsService } from './modules/analytics/statistics';
import { TraderDataLoader } from './modules/analytics/traderData';
import { CopyEngine } from './modules/copy/engine';
import { PrismaCopyStore } from './modules/copy/prismaStore';
import { CopySettingsService } from './modules/copy/settingsService';
import type { CopyStore } from './modules/copy/types';
import { MarketService } from './modules/markets/service';
import { NotificationService } from './modules/notifications/service';
import { TradeWatcher } from './modules/tracking/watcher';
import { WatchlistService } from './modules/tracking/watchlistService';
import { TradeService } from './modules/trades/service';
import { TraderService } from './modules/traders/service';
import { UserService } from './modules/users/service';
import { WsHub } from './websocket/hub';

export interface AppContext {
  config: AppConfig;
  db: Db;
  adapter: PolymarketAdapter;
  execution: ExecutionAdapter;
  hub: WsHub;
  users: UserService;
  notifications: NotificationService;
  markets: MarketService;
  trades: TradeService;
  loader: TraderDataLoader;
  statistics: StatisticsService;
  traders: TraderService;
  watchlist: WatchlistService;
  copyStore: CopyStore;
  copySettings: CopySettingsService;
  copyEngine: CopyEngine;
  watcher: TradeWatcher;
}

export function createAdapter(config: AppConfig): PolymarketAdapter {
  return config.mode === 'demo'
    ? new DemoPolymarketAdapter()
    : new LivePolymarketAdapter({ ...config.polymarket });
}

/** Wires every service. Demo mode always pairs the demo data source with simulated execution. */
export function createContext(
  config: AppConfig,
  db: Db,
  log: FastifyBaseLogger,
  adapter = createAdapter(config),
): AppContext {
  const hub = new WsHub();
  const markets = new MarketService(db, adapter);
  const execution: ExecutionAdapter =
    adapter.mode === 'demo'
      ? new DemoExecutionAdapter((tokenId) => adapter.getCurrentPrice(tokenId))
      : new AssistedExecutionAdapter(adapter);
  const notifications = new NotificationService(db, hub);
  const users = new UserService(db);
  const trades = new TradeService(db, markets);
  const loader = new TraderDataLoader(db, adapter, adapter.mode === 'demo' ? 20_000 : 2 * 60_000);
  const statistics = new StatisticsService(db);
  const traders = new TraderService(db, adapter, loader, statistics, {
    enrichLimit: config.scannerEnrichLimit,
  });
  const watchlist = new WatchlistService(db, trades, (address) => {
    void traders.analytics(address, 'all').catch(() => undefined);
  });
  const copyStore = new PrismaCopyStore(db);
  const copyEngine = new CopyEngine(copyStore, execution, markets, notifications, {
    maxTradeAgeMs: config.maxTradeAgeMs,
    assistedVerifyTimeoutMs: config.assistedVerifyTimeoutMs,
  });
  const watcher = new TradeWatcher(
    db,
    adapter,
    trades,
    copyEngine,
    notifications,
    log,
    { intervalMs: config.watcherPollIntervalMs, maxTradeAgeMs: config.maxTradeAgeMs },
    (address) => loader.invalidate(address),
  );
  return {
    config,
    db,
    adapter,
    execution,
    hub,
    users,
    notifications,
    markets,
    trades,
    loader,
    statistics,
    traders,
    watchlist,
    copyStore,
    copySettings: new CopySettingsService(db),
    copyEngine,
    watcher,
  };
}

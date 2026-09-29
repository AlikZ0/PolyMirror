import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  APP_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATA_MODE: z.enum(['demo', 'live']).default('demo'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().default('0.0.0.0'),
  CORS_ORIGINS: z.string().default('chrome-extension://*,http://localhost:5173'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  POLYMARKET_API_URL: z.string().url().default('https://data-api.polymarket.com'),
  POLYMARKET_GAMMA_URL: z.string().url().default('https://gamma-api.polymarket.com'),
  POLYMARKET_CLOB_URL: z.string().url().default('https://clob.polymarket.com'),
  POLYMARKET_WEB_URL: z.string().url().default('https://polymarket.com'),
  POLYMARKET_MAX_RPS: z.coerce.number().positive().max(100).default(5),
  WATCHER_POLL_INTERVAL_MS: z.coerce.number().int().min(2_000).default(15_000),
  MAX_TRADE_AGE_SECONDS: z.coerce.number().int().min(10).default(180),
  ASSISTED_VERIFY_TIMEOUT_SECONDS: z.coerce.number().int().min(60).default(1_800),
  MAINTENANCE_INTERVAL_MS: z.coerce.number().int().min(1_000).default(20_000),
  SCANNER_ENRICH_LIMIT: z.coerce.number().int().min(0).max(200).default(25),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TRUST_PROXY: bool.default(false),
});

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  const e = parsed.data;
  return {
    env: e.APP_ENV,
    mode: e.DATA_MODE,
    port: e.PORT,
    host: e.HOST,
    corsOrigins: e.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
    databaseUrl: e.DATABASE_URL,
    polymarket: {
      dataUrl: e.POLYMARKET_API_URL,
      gammaUrl: e.POLYMARKET_GAMMA_URL,
      clobUrl: e.POLYMARKET_CLOB_URL,
      webUrl: e.POLYMARKET_WEB_URL,
      maxRps: e.POLYMARKET_MAX_RPS,
    },
    watcherPollIntervalMs: e.DATA_MODE === 'demo' ? Math.min(e.WATCHER_POLL_INTERVAL_MS, 10_000) : e.WATCHER_POLL_INTERVAL_MS,
    maxTradeAgeMs: e.MAX_TRADE_AGE_SECONDS * 1000,
    assistedVerifyTimeoutMs: e.ASSISTED_VERIFY_TIMEOUT_SECONDS * 1000,
    maintenanceIntervalMs: e.MAINTENANCE_INTERVAL_MS,
    scannerEnrichLimit: e.SCANNER_ENRICH_LIMIT,
    logLevel: e.LOG_LEVEL,
    trustProxy: e.TRUST_PROXY,
    version: '0.1.0',
  };
}

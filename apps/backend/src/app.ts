import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import type { AppConfig } from './config';
import type { AppContext } from './context';
import { bearerToken, requireAuth } from './lib/auth';
import { registerErrorHandler } from './lib/errorHandler';
import { analyticsRoutes } from './modules/analytics/routes';
import { copyRoutes } from './modules/copy/routes';
import { notificationRoutes } from './modules/notifications/routes';
import { trackingRoutes } from './modules/tracking/routes';
import { traderRoutes } from './modules/traders/routes';
import { userRoutes } from './modules/users/routes';
import { websocketRoutes } from './websocket/routes';

export function createServer(config: AppConfig) {
  return Fastify({
    logger: {
      level: config.logLevel,
      redact: { paths: ['req.headers.authorization', 'req.headers.cookie'], censor: '[redacted]' },
      ...(config.env === 'development' ? { transport: { target: 'pino-pretty', options: { singleLine: true } } } : {}),
    },
    trustProxy: config.trustProxy,
    bodyLimit: 64 * 1024,
    requestTimeout: 30_000,
  });
}

/** Origin matcher supporting `*` wildcards (e.g. chrome-extension://*). */
export function originAllowed(origin: string, patterns: readonly string[]): boolean {
  return patterns.some((p) => {
    if (p === origin) return true;
    if (!p.includes('*')) return false;
    const re = new RegExp(`^${p.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\/]/g, '\\$&')).join('[^/]+')}$`);
    return re.test(origin);
  });
}

export async function registerApp(app: ReturnType<typeof createServer>, ctx: AppContext) {
  registerErrorHandler(app);

  await app.register(cors, {
    origin: (origin, cb) => {
      // Non-browser clients (no Origin header) are allowed; browsers must match the allow list.
      if (!origin || originAllowed(origin, ctx.config.corsOrigins)) cb(null, true);
      else cb(new Error('Origin not allowed'), false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['authorization', 'content-type'],
  });

  await app.register(rateLimit, {
    max: 600,
    timeWindow: '1 minute',
    keyGenerator: (req) => bearerToken(req) ?? req.ip,
    errorResponseBuilder: (_req, context) => ({
      statusCode: 429,
      error: { code: 'RATE_LIMITED', message: `Too many requests — retry in ${Math.ceil(context.ttl / 1000)}s` },
    }),
  });

  await app.register(websocket, { options: { maxPayload: 4_096 } });

  app.get('/health', async () => ({ status: 'ok', mode: ctx.adapter.mode, connections: ctx.hub.connectedUsers() }));

  // Public routes
  await app.register(async (scope) => userRoutes(scope, ctx));
  await app.register(async (scope) => websocketRoutes(scope, ctx));

  // Authenticated API
  await app.register(async (scope) => {
    scope.addHook('preHandler', requireAuth(ctx.users));
    await traderRoutes(scope, ctx);
    await trackingRoutes(scope, ctx);
    await copyRoutes(scope, ctx);
    await analyticsRoutes(scope, ctx);
    await notificationRoutes(scope, ctx);
  });

  return app;
}

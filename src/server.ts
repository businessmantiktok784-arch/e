import express, { type Request, type Response, type NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'node:crypto';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { webhookRouter } from './routes/webhook.routes.js';
import { publicRouter } from './routes/public.routes.js';
import { expertRouter } from './routes/expert.routes.js';
import { researchRouter } from './routes/research.routes.js';
import { adminRouter } from './routes/admin.routes.js';
import { validationRouter } from './routes/validation.routes.js';
import { validationIsDurable } from './repositories/validation.repository.js';
import { communityRouter } from './routes/community.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { userRouter } from './routes/user.routes.js';
import { postsRouter } from './routes/posts.routes.js';
import { observationService } from './services/observation.service.js';
import { webhookQueueService } from './services/webhook-queue.service.js';
import { registerDemoObservationRecords } from './data/demo-map-records.js';
import { registerDemoCommunityRecords } from './data/demo-community.registration.js';

/**
 * Demonstration posts (Stage 12) are served by the post card straight from
 * `demo-posts.ts`, but the map, the observation list and the GeoJSON layer read
 * the public repository. Registering them here keeps the two views agreeing
 * about what exists; the repository refuses them again on every read when
 * `DEMO_POSTS_ENABLED` is off, which is the default in production.
 */
const registeredDemoRecords = registerDemoObservationRecords();
if (env.DEMO_POSTS_ENABLED) {
  logger.info(`Registered ${registeredDemoRecords} labelled demonstration posts on the public map`);
}

/**
 * Demonstration community data (geological sites, investigations, questions,
 * evidence, visits) is registered up front so the site explorer and the
 * community discovery feed agree with the demo posts about what exists.
 */
const registeredDemoCommunity = registerDemoCommunityRecords();
if (env.DEMO_POSTS_ENABLED) {
  logger.info(`Registered ${registeredDemoCommunity} labelled demonstration community records`);
}

// Initialize Express app
const app = express();

/**
 * Product identity. Defined once so the name, the tagline and the current
 * stage cannot drift apart between `/health`, `/` and the startup log, which is
 * exactly how the server ended up reporting "Stage 7" while running Stage 10.
 */
const PLATFORM = {
  name: 'Earth Talk',
  tagline: 'Discover Earth. Together.',
  previousName: 'Rock Talk',
  /** Highest implemented stage. See README.md for the stage table. */
  stage: 13,
} as const;

const healthPayload = () => ({
  project: PLATFORM.name,
  tagline: PLATFORM.tagline,
  status: 'online',
  stage: PLATFORM.stage,
});

// Request ID and Request Logging Middleware (Section 17)
app.use((req: any, res: Response, next: NextFunction) => {
  const reqId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  req.requestId = reqId;
  res.setHeader('X-Request-Id', reqId);
  next();
});

// Production Security Headers (Section 28)
if (env.ENABLE_SECURITY_HEADERS) {
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
  });
}

// Explicit CORS configuration (Section 29)
app.use((req: Request, res: Response, next: NextFunction) => {
  const allowed = (env.CORS_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim());
  const origin = req.headers.origin;
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    // PATCH is required: the admin moderation routes (media visibility,
    // media moderation, observation publication) are all PATCH. Omitting it
    // made the browser preflight reject those calls before they were sent.
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Expert-Token, X-Request-Id');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

// Parse incoming JSON requests with safe body-size limit (Section 7)
//
// The `verify` hook keeps the exact raw bytes of the request. Meta signs the
// raw body, so the webhook signature can only be checked against these bytes,
// never against a re-serialized object.
app.use(
  express.json({
    limit: '10mb',
    verify: (req: Request, _res: Response, buf: Buffer) => {
      (req as unknown as { rawBody?: Buffer }).rawBody = buf;
    },
  })
);

// Public static client bundle in production
const clientDist = path.resolve(process.cwd(), 'dist/client');
if (env.IS_PRODUCTION && fs.existsSync(clientDist)) {
  app.use(express.static(clientDist, { index: false }));
}

// Health Check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json(healthPayload());
});

// Root endpoint: returns JSON health status for API/curl clients, and passes browser requests to SPA
app.get('/', (req: Request, res: Response, next: NextFunction) => {
  const isBrowser = req.headers.accept?.includes('text/html');
  const isExplicitJson = req.headers.accept?.includes('application/json') || req.query.format === 'json';
  const isCurl = req.headers['user-agent']?.toLowerCase().includes('curl');

  if (isExplicitJson || (isCurl && !isBrowser)) {
    res.status(200).json(healthPayload());
    return;
  }

  const indexPath = path.resolve(process.cwd(), 'dist/client/index.html');
  if (env.IS_PRODUCTION && fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
    return;
  }

  next();
});

// Section 54: Optional internal authenticated test endpoint for development
app.get('/internal/observations/:passportId', async (req: Request, res: Response) => {
  const adminKey = req.headers['x-admin-key'];
  if (!adminKey || adminKey !== env.SUPABASE_SECRET_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const observation = await observationService.getObservationByPassportId(req.params.passportId);
    if (!observation) {
      res.status(404).json({ error: 'Observation not found' });
      return;
    }

    // Never expose secret database credentials or sensitive details
    res.status(200).json(observation);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Database lookup error';
    logger.error('Error in internal observation lookup', { error: msg });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Register Public Map & Observation API routes (Stage 4)
app.use(publicRouter);

// Register Expert Verification API routes (Stage 5)
app.use(expertRouter);

// Register Research Analytics & Dataset Export routes (Stage 6)
app.use(researchRouter);

// Register Compliance & Admin routes (Stage 6)
app.use(adminRouter);

// Register Field Validation & Evaluation routes (Stage 7)
app.use(validationRouter);

// Register Community Discovery & Geological Site routes (Stage 8)
app.use(communityRouter);

// Register WhatsApp verification login routes (Stage 12)
app.use(authRouter);
app.use(userRouter);

// Register community observation post, comment and media routes (Stage 12)
app.use(postsRouter);

// Register Webhook routes (Stages 1-3)
app.use(webhookRouter);

// Vite middleware in development mode
if (!env.IS_PRODUCTION) {
  try {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn('Could not initialize Vite dev middleware; falling back to static files', { error: msg });
    if (fs.existsSync(clientDist)) {
      app.use(express.static(clientDist, { index: false }));
    }
  }
}

// SPA client routing fallback for HTML GET requests (excluding /api and /webhook)
app.get('*', (req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/webhook') || req.path.startsWith('/internal')) {
    return next();
  }

  const indexPath = path.resolve(process.cwd(), 'dist/client/index.html');
  if (fs.existsSync(indexPath) && req.headers.accept?.includes('text/html')) {
    res.sendFile(indexPath);
    return;
  }

  next();
});

// 404 Catch-all for unknown routes
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Global unexpected error handler
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const errorMessage = err instanceof Error ? err.message : 'Unknown server error';
  logger.error('Unexpected server error', { error: errorMessage });
  res.status(500).json({
    error: 'Internal server error',
  });
});

// Start HTTP server on configured port
const server = app.listen(env.PORT, '0.0.0.0', () => {
  logger.info('Server started');
  logger.info(`${PLATFORM.name} Stage ${PLATFORM.stage} listening on port ${env.PORT} in ${env.NODE_ENV} mode`);
  logger.info(`Gemini model configured: ${env.GEMINI_MODEL}`);
  logger.info(`Supabase URL configured: ${env.SUPABASE_URL}`);
  logger.info(`Health check endpoint: http://localhost:${env.PORT}/`);
  logger.info(`Public API endpoint: http://localhost:${env.PORT}/api/public/observations`);
  logger.info(`Expert API endpoint: http://localhost:${env.PORT}/api/expert/observations`);
  logger.info(`Research API endpoint: http://localhost:${env.PORT}/api/research/summary`);
  logger.info(`Validation API endpoint: http://localhost:${env.PORT}/api/research/validation/datasets`);
if (validationIsDurable) {
  logger.info(
    'Validation datasets, specimens, labels and evaluation runs are persisted to the database and survive restart.'
  );
} else {
  logger.warn(
    'Validation datasets, specimens, labels and evaluation runs are held in process memory and are NOT persisted. ' +
      'They are lost on restart. Migration 010 defines the durable schema, but no database is configured, so the in-memory repository is in use rather than the database-backed one. ' +
      'Do not enter a real validation reference set on this deployment.'
  );
}
  logger.info(`Community API endpoint: http://localhost:${env.PORT}/api/community/sites`);
  logger.info(`Webhook endpoint: http://localhost:${env.PORT}/webhook`);

  // Start draining the inbound-event queue. Jobs are persisted before Meta is
  // acknowledged, so a crash between the ack and the work no longer drops a
  // submission: the worker recovers it on the next start or tick. When a
  // database is configured the queue verifies the schema is reachable and logs
  // "Durable webhook queue enabled" only after that check passes; otherwise it
  // reports the exact blocker (or, with no database at all, warns that the
  // process-local queue is not durable).
  void webhookQueueService.start().catch((err: unknown) => {
    logger.error('Failed to start webhook queue worker', {
      error: err instanceof Error ? err.message : String(err),
    });
  });
});

// Last-resort safety net. Without these handlers an uncaught throw or a
// rejected promise that nothing awaits takes the whole process down with no
// log. We record the fault so it is diagnosable, and keep serving: the HTTP
// layer itself still has its own error handler, so a single bad request or a
// fire-and-forget rejection does not turn into an outage.
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack,
  });
});

process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

// Graceful shutdown: stop accepting new connections, let in-flight requests
// finish, then exit. A hard timeout guarantees the process still goes down if a
// connection refuses to close.
const shutdown = (signal: string) => {
  logger.info(`Received ${signal}; shutting down`);
  webhookQueueService.stop();
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
  setTimeout(() => {
    logger.warn('Forcing shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
export { server };

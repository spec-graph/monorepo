import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import { logger } from './infra/logger.js';
import { initPostgres, closePostgres, healthCheckPostgres } from './infra/postgres.js';
import { initRedis, closeRedis, healthCheckRedis } from './infra/redis.js';
import { initRabbitMQ, closeRabbitMQ, healthCheckRabbitMQ } from './infra/rabbitmq.js';
import { loadTokenBucketScript } from './middleware/rate-limiter.js';
import { loadInventoryScripts } from './inventory/index.js';
import { correlationIdMiddleware } from './middleware/correlation-id.js';
import { errorHandler } from './middleware/error-handler.js';
import { authMiddleware, requireRole } from './middleware/auth.js';
import { generalUserRateLimiter, ipRateLimiter, loginRateLimiter } from './middleware/rate-limiter.js';
import { sanitizationMiddleware, createIdempotencyMiddleware } from './middleware/security.js';
import {
  registerUser,
  loginUser,
  refreshUserToken,
  revokeAllUserTokens,
} from './auth/index.js';
import {
  createProduct,
  getProduct,
  updateProduct,
  deleteProduct,
  searchProducts,
} from './product/index.js';
import {
  createFlashSale,
  getFlashSale,
  listFlashSales,
  updateFlashSale,
  startFlashSale,
  endFlashSale,
  getUserPurchaseCount,
  startAutoTransition,
  stopAutoTransition,
} from './sale/index.js';
import {
  reserveStock,
  commitReservation,
  releaseReservation,
  getStock,
  startCleanupScheduler,
  stopCleanupScheduler,
} from './inventory/index.js';
import {
  enqueue,
  getQueuePosition,
  getQueueLength,
  startQueueCleanupScheduler,
  stopQueueCleanupScheduler,
  startQueueWorker,
  stopQueueWorker,
} from './queue/index.js';
import {
  createOrder,
  getOrder,
  listOrders,
  processPayment,
  cancelOrder,
  startAutoCancelScheduler,
  stopAutoCancelScheduler,
  startOrderConsumer,
} from './order/index.js';
import { AppError, HealthStatus } from './types/index.js';

// ─── Express App ─────────────────────────────────────────────

const app = express();

// ─── Global Middleware ───────────────────────────────────────

app.use(cors());
app.use(express.json({ limit: config.security.maxBodySize }));
app.use(correlationIdMiddleware);
app.use(sanitizationMiddleware);
app.use(ipRateLimiter);

// ─── Health Check ────────────────────────────────────────────

app.get('/health', async (_req: Request, res: Response) => {
  const isShuttingDown = (global as any).__shuttingDown === true;

  const [pgHealth, redisHealth, rmqHealth] = await Promise.all([
    healthCheckPostgres(),
    healthCheckRedis(),
    healthCheckRabbitMQ(),
  ]);

  const allUp = pgHealth.status === 'up' && redisHealth.status === 'up' && rmqHealth.status === 'up';

  const health: HealthStatus = {
    status: isShuttingDown ? 'shutting_down' : allUp ? 'healthy' : 'degraded',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    dependencies: {
      postgres: pgHealth,
      redis: redisHealth,
      rabbitmq: rmqHealth,
    },
  };

  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json({ success: true, data: health });
});

// ─── Metrics Endpoint ────────────────────────────────────────

app.get('/metrics', async (_req: Request, res: Response) => {
  try {
    const [pgHealth, redisHealth, rmqHealth] = await Promise.all([
      healthCheckPostgres(),
      healthCheckRedis(),
      healthCheckRabbitMQ(),
    ]);

    const metrics = {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      dependencies: { postgres: pgHealth, redis: redisHealth, rabbitmq: rmqHealth },
      timestamp: new Date().toISOString(),
    };

    res.json({ success: true, data: metrics });
  } catch (err) {
    logger.error({ err }, 'Failed to collect metrics');
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to collect metrics' } });
  }
});

// ══════════════════════════════════════════════════════════════
// Auth Routes
// ══════════════════════════════════════════════════════════════

app.post('/auth/register', loginRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    const result = await registerUser(email, password);
    logger.info({ email }, 'User registered via API');
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

app.post('/auth/login', loginRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    const result = await loginUser(email, password);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

app.post('/auth/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      throw new AppError('Refresh token is required', 400, 'VALIDATION_ERROR');
    }
    const result = await refreshUserToken(refreshToken);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

app.post('/auth/logout', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await revokeAllUserTokens(req.user!.sub);
    res.json({ success: true, data: { message: 'Logged out successfully' } });
  } catch (err) {
    next(err);
  }
});

// ══════════════════════════════════════════════════════════════
// Product Routes
// ══════════════════════════════════════════════════════════════

// Public: search products
app.get('/products', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search, minPrice, maxPrice, category, page, limit } = req.query;
    const result = await searchProducts({
      search: search as string,
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      category: category as string,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    res.json({
      success: true,
      data: result.items,
      meta: {
        page: result.page,
        limit: limit ? Number(limit) : 20,
        totalCount: result.totalCount,
        totalPages: result.totalPages,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Public: get single product
app.get('/products/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const product = await getProduct(req.params.id);
    if (!product) {
      throw new AppError('Product not found', 404, 'NOT_FOUND');
    }
    res.json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
});

// Admin: create product
app.post('/products', authMiddleware, requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const product = await createProduct(req.body);
    res.status(201).json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
});

// Admin: update product
app.put('/products/:id', authMiddleware, requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const product = await updateProduct(req.params.id, req.body);
    res.json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
});

// Admin: delete product
app.delete('/products/:id', authMiddleware, requireRole('admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await deleteProduct(req.params.id);
    res.json({ success: true, data: { message: 'Product deleted' } });
  } catch (err) {
    next(err);
  }
});

// ══════════════════════════════════════════════════════════════
// Flash Sale Routes
// ══════════════════════════════════════════════════════════════

// Public: list flash sales
app.get('/sales', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, page, limit } = req.query;
    const result = await listFlashSales(
      status as any,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20
    );
    res.json({
      success: true,
      data: result.items,
      meta: {
        page: result.page,
        limit: limit ? Number(limit) : 20,
        totalCount: result.totalCount,
        totalPages: result.totalPages,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Public: get single flash sale
app.get('/sales/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sale = await getFlashSale(req.params.id);
    if (!sale) {
      throw new AppError('Flash sale not found', 404, 'NOT_FOUND');
    }
    res.json({ success: true, data: sale });
  } catch (err) {
    next(err);
  }
});

// Admin: create flash sale
app.post('/sales', authMiddleware, requireRole('admin', 'operator'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sale = await createFlashSale({
      ...req.body,
      createdBy: req.user!.sub,
    });
    res.status(201).json({ success: true, data: sale });
  } catch (err) {
    next(err);
  }
});

// Admin: update flash sale
app.put('/sales/:id', authMiddleware, requireRole('admin', 'operator'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sale = await updateFlashSale(req.params.id, req.body);
    res.json({ success: true, data: sale });
  } catch (err) {
    next(err);
  }
});

// Admin: start flash sale
app.post('/sales/:id/start', authMiddleware, requireRole('admin', 'operator'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sale = await startFlashSale(req.params.id);
    // Start a queue worker for this sale
    startQueueWorker(req.params.id);
    res.json({ success: true, data: sale });
  } catch (err) {
    next(err);
  }
});

// Admin: end flash sale
app.post('/sales/:id/end', authMiddleware, requireRole('admin', 'operator'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sale = await endFlashSale(req.params.id);
    // Stop the queue worker for this sale
    stopQueueWorker(req.params.id);
    res.json({ success: true, data: sale });
  } catch (err) {
    next(err);
  }
});

// Authenticated: join flash sale queue
app.post('/sales/:id/join-queue', authMiddleware, generalUserRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId, quantity } = req.body;
    const entry = await enqueue(req.params.id, req.user!.sub, quantity || 1, productId);
    res.status(201).json({ success: true, data: entry });
  } catch (err) {
    next(err);
  }
});

// Authenticated: get queue position
app.get('/sales/:id/queue-position', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const position = await getQueuePosition(req.params.id, req.user!.sub);
    if (!position) {
      throw new AppError('Not in queue', 404, 'NOT_FOUND');
    }
    res.json({ success: true, data: position });
  } catch (err) {
    next(err);
  }
});

// Public: get queue length
app.get('/sales/:id/queue-length', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const length = await getQueueLength(req.params.id);
    res.json({ success: true, data: { length } });
  } catch (err) {
    next(err);
  }
});

// ══════════════════════════════════════════════════════════════
// Stock / Inventory Routes
// ══════════════════════════════════════════════════════════════

// Public: get remaining stock for a sale product
app.get('/sales/:saleId/stock/:productId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stock = await getStock(req.params.saleId, req.params.productId);
    res.json({ success: true, data: { saleId: req.params.saleId, productId: req.params.productId, stock } });
  } catch (err) {
    next(err);
  }
});

// ══════════════════════════════════════════════════════════════
// Order Routes
// ══════════════════════════════════════════════════════════════

const idempotencyMiddleware = createIdempotencyMiddleware();

// Authenticated: create order
app.post('/orders', authMiddleware, generalUserRateLimiter, idempotencyMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { saleId, productId, quantity } = req.body;
    const idempotencyKey = req.headers['idempotency-key'] as string;

    if (!idempotencyKey) {
      throw new AppError('Idempotency-Key header is required', 400, 'VALIDATION_ERROR');
    }

    const order = await createOrder(req.user!.sub, saleId, productId, quantity || 1, idempotencyKey);
    res.status(201).json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
});

// Authenticated: list my orders
app.get('/orders', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit } = req.query;
    const result = await listOrders(
      req.user!.sub,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20
    );
    res.json({
      success: true,
      data: result.items,
      meta: {
        page: result.page,
        limit: limit ? Number(limit) : 20,
        totalCount: result.totalCount,
        totalPages: result.totalPages,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Authenticated: get single order
app.get('/orders/:id', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await getOrder(req.params.id);
    if (!order) {
      throw new AppError('Order not found', 404, 'NOT_FOUND');
    }
    // Users can only see their own orders (admins can see all)
    if (order.userId !== req.user!.sub && req.user!.role !== 'admin') {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }
    res.json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
});

// Authenticated: pay for order
app.post('/orders/:id/pay', authMiddleware, generalUserRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await getOrder(req.params.id);
    if (!order) {
      throw new AppError('Order not found', 404, 'NOT_FOUND');
    }
    if (order.userId !== req.user!.sub && req.user!.role !== 'admin') {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }

    const paidOrder = await processPayment(req.params.id);
    res.json({ success: true, data: paidOrder });
  } catch (err) {
    next(err);
  }
});

// Authenticated: cancel order
app.post('/orders/:id/cancel', authMiddleware, generalUserRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await getOrder(req.params.id);
    if (!order) {
      throw new AppError('Order not found', 404, 'NOT_FOUND');
    }
    if (order.userId !== req.user!.sub && req.user!.role !== 'admin') {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    }

    const { reason } = req.body;
    const cancelledOrder = await cancelOrder(req.params.id, reason || 'Cancelled by user');
    res.json({ success: true, data: cancelledOrder });
  } catch (err) {
    next(err);
  }
});

// ══════════════════════════════════════════════════════════════
// Global Error Handler
// ══════════════════════════════════════════════════════════════

app.use(errorHandler);

// ══════════════════════════════════════════════════════════════
// Server Lifecycle
// ══════════════════════════════════════════════════════════════

let server: ReturnType<typeof app.listen> | null = null;

async function start(): Promise<void> {
  logger.info({ env: config.nodeEnv, port: config.port }, 'Starting flash sale server');

  // Initialize infrastructure
  await initPostgres();
  logger.info('PostgreSQL initialized');

  await initRedis();
  logger.info('Redis initialized');

  // Load Lua scripts
  await loadTokenBucketScript();
  await loadInventoryScripts();
  logger.info('Lua scripts loaded');

  // Connect RabbitMQ
  await initRabbitMQ();
  logger.info('RabbitMQ initialized');

  // Start schedulers
  startAutoTransition();
  startCleanupScheduler();
  startQueueCleanupScheduler();
  startAutoCancelScheduler();

  // Start RabbitMQ consumer for order processing
  await startOrderConsumer();

  // Start listening
  server = app.listen(config.port, () => {
    logger.info({ port: config.port }, `Flash sale server listening on port ${config.port}`);
    logger.info('Available routes:');
    logger.info('  POST   /auth/register');
    logger.info('  POST   /auth/login');
    logger.info('  POST   /auth/refresh');
    logger.info('  POST   /auth/logout');
    logger.info('  GET    /products');
    logger.info('  GET    /products/:id');
    logger.info('  POST   /products          (admin)');
    logger.info('  PUT    /products/:id       (admin)');
    logger.info('  DELETE /products/:id       (admin)');
    logger.info('  GET    /sales');
    logger.info('  GET    /sales/:id');
    logger.info('  POST   /sales              (admin/operator)');
    logger.info('  PUT    /sales/:id          (admin/operator)');
    logger.info('  POST   /sales/:id/start    (admin/operator)');
    logger.info('  POST   /sales/:id/end      (admin/operator)');
    logger.info('  POST   /sales/:id/join-queue');
    logger.info('  GET    /sales/:id/queue-position');
    logger.info('  GET    /sales/:id/queue-length');
    logger.info('  GET    /sales/:saleId/stock/:productId');
    logger.info('  POST   /orders');
    logger.info('  GET    /orders');
    logger.info('  GET    /orders/:id');
    logger.info('  POST   /orders/:id/pay');
    logger.info('  POST   /orders/:id/cancel');
    logger.info('  GET    /health');
    logger.info('  GET    /metrics');
  });
}

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutdown signal received');

  (global as any).__shuttingDown = true;

  // Stop accepting new connections
  if (server) {
    logger.info('Closing HTTP server');
    await new Promise<void>((resolve) => {
      server!.close(() => resolve());
    });
  }

  // Stop schedulers
  stopAutoTransition();
  stopCleanupScheduler();
  stopQueueCleanupScheduler();
  stopAutoCancelScheduler();

  // Give in-flight requests time to complete
  logger.info({ timeoutMs: config.shutdown.drainTimeoutMs }, 'Draining in-flight requests');
  await new Promise(resolve => setTimeout(resolve, config.shutdown.drainTimeoutMs));

  // Close infrastructure connections
  await closeRabbitMQ();
  await closeRedis();
  await closePostgres();

  logger.info('Graceful shutdown complete');
  process.exit(0);
}

// ─── Main ────────────────────────────────────────────────────

start().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});

// Handle shutdown signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled rejection');
});
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught exception');
  process.exit(1);
});

export { app };

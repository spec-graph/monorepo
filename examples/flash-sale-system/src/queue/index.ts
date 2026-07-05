import { v4 as uuidv4 } from 'uuid';
import { getRedisClient } from '../infra/redis.js';
import { queryOne, query, execute, withTransaction } from '../infra/postgres.js';
import { config } from '../config/index.js';
import { AppError, QueueEntry, QueuePosition, QueueEntryStatus } from '../types/index.js';
import { logger } from '../infra/logger.js';
import { reserveStock, commitReservation, releaseReservation } from '../inventory/index.js';
import { publishMessage, QUEUES } from '../infra/rabbitmq.js';

export type { QueueEntry, QueuePosition };

// ─── Redis Key Helpers ──────────────────────────────────────

function queueSetKey(saleId: string): string {
  return `${config.redis.keyPrefix}queue:${saleId}`;
}

function queueEntryKey(entryId: string): string {
  return `${config.redis.keyPrefix}queue:entry:${entryId}`;
}

function userQueueKey(saleId: string, userId: string): string {
  return `${config.redis.keyPrefix}queue:user:${saleId}:${userId}`;
}

// ─── Enqueue ─────────────────────────────────────────────────

export async function enqueue(
  saleId: string,
  userId: string,
  quantity: number,
  productId: string
): Promise<QueueEntry> {
  // Check if user is already in queue for this sale
  const redis = getRedisClient();
  const existingEntryId = await redis.get(userQueueKey(saleId, userId));
  if (existingEntryId) {
    throw new AppError('User is already in the queue for this sale', 409, 'ALREADY_QUEUED');
  }

  // Verify sale exists and is active
  const sale = await queryOne<Record<string, unknown>>(
    'SELECT * FROM flash_sales WHERE id = $1',
    [saleId]
  );
  if (!sale) {
    throw new AppError('Flash sale not found', 404, 'NOT_FOUND');
  }
  if (sale.status !== 'active') {
    throw new AppError(
      `Flash sale is not active (status: ${sale.status})`,
      400,
      'INVALID_TRANSITION'
    );
  }

  // Check per-user limit
  const saleProduct = await queryOne<Record<string, unknown>>(
    'SELECT * FROM flash_sale_products WHERE sale_id = $1 AND product_id = $2',
    [saleId, productId]
  );
  if (!saleProduct) {
    throw new AppError('Product not found in this sale', 404, 'NOT_FOUND');
  }

  const perUserLimit = Number(saleProduct.per_user_limit);
  const purchaseCountRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM orders
     WHERE sale_id = $1 AND user_id = $2 AND status IN ('pending', 'paid')`,
    [saleId, userId]
  );
  const purchaseCount = parseInt(purchaseCountRow?.count || '0', 10);

  if (purchaseCount + quantity > perUserLimit) {
    throw new AppError(
      `Purchase limit exceeded. You can only buy ${perUserLimit} items total (already purchased: ${purchaseCount})`,
      400,
      'USER_LIMIT_REACHED'
    );
  }

  const entryId = uuidv4();
  const now = Date.now();
  const nowSeconds = Math.floor(now / 1000);

  // Persist queue entry to DB
  const queueDepth = await getQueueLength(saleId);
  const estimatedWaitSeconds = queueDepth * (config.queue.avgProcessingTimeMs / 1000);

  await execute(
    `INSERT INTO queue_entries (id, sale_id, user_id, product_id, quantity, enqueued_at, position, estimated_wait_seconds, status)
     VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, 'waiting')`,
    [entryId, saleId, userId, productId, quantity, queueDepth + 1, Math.ceil(estimatedWaitSeconds)]
  );

  // Add to Redis sorted set (score = timestamp ms for FIFO)
  await redis.zadd(queueSetKey(saleId), now.toString(), entryId);

  // Store entry data in Redis hash
  await redis.hset(queueEntryKey(entryId), {
    saleId,
    userId,
    productId,
    quantity: quantity.toString(),
    enqueuedAt: new Date(now).toISOString(),
    status: 'waiting',
  });
  await redis.expire(queueEntryKey(entryId), Math.ceil(config.queue.entryTimeoutMs / 1000) + 60);

  // Mark user as queued
  const userKeyTtl = Math.ceil(config.queue.entryTimeoutMs / 1000) + 120;
  await redis.setex(userQueueKey(saleId, userId), userKeyTtl, entryId);

  logger.info({ entryId, saleId, userId, productId, quantity, position: queueDepth + 1 }, 'User enqueued');

  return {
    id: entryId,
    saleId,
    userId,
    enqueuedAt: new Date(now),
    position: queueDepth + 1,
    estimatedWaitSeconds: Math.ceil(estimatedWaitSeconds),
    status: 'waiting',
  };
}

// ─── Dequeue ─────────────────────────────────────────────────

export async function dequeue(saleId: string): Promise<QueueEntry | null> {
  const redis = getRedisClient();
  const setKey = queueSetKey(saleId);

  // ZPOPMIN: remove and return the entry with lowest score
  const results = await redis.zpopmin(setKey, 1);
  if (!results || results.length === 0) return null;

  const entryId = results[0];
  const score = parseFloat(results[1]);

  // Get entry data from Redis
  const entryData = await redis.hgetall(queueEntryKey(entryId));
  if (!entryData || Object.keys(entryData).length === 0) {
    logger.warn({ entryId, saleId }, 'Dequeued entry has no data in Redis');
    return null;
  }

  // Update DB status
  await execute(
    `UPDATE queue_entries SET status = 'processing' WHERE id = $1`,
    [entryId]
  );

  // Update Redis entry status
  await redis.hset(queueEntryKey(entryId), 'status', 'processing');

  // Remove user queue marker
  const userId = entryData.userId;
  if (userId) {
    await redis.del(userQueueKey(saleId, userId));
  }

  return {
    id: entryId,
    saleId: entryData.saleId || saleId,
    userId: userId || '',
    enqueuedAt: new Date(entryData.enqueuedAt || Date.now()),
    position: 0,
    estimatedWaitSeconds: 0,
    status: 'processing',
  };
}

// ─── Queue Queries ───────────────────────────────────────────

export async function getQueuePosition(saleId: string, userId: string): Promise<QueuePosition | null> {
  const redis = getRedisClient();
  const entryId = await redis.get(userQueueKey(saleId, userId));

  if (!entryId) {
    return null;
  }

  const entryData = await redis.hgetall(queueEntryKey(entryId));
  if (!entryData || Object.keys(entryData).length === 0) {
    return null;
  }

  // ZRANK: 0-based position in sorted set
  const rank = await redis.zrank(queueSetKey(saleId), entryId);
  const position = rank !== null && rank !== undefined ? rank + 1 : -1;

  const queueDepth = await getQueueLength(saleId);
  const estimatedWaitSeconds = position > 0
    ? Math.ceil(position * (config.queue.avgProcessingTimeMs / 1000))
    : 0;

  return {
    position,
    queueDepth,
    estimatedWaitSeconds,
    status: (entryData.status as QueueEntryStatus) || 'waiting',
  };
}

export async function getQueueLength(saleId: string): Promise<number> {
  const redis = getRedisClient();
  return redis.zcard(queueSetKey(saleId));
}

// ─── Queue Processing Worker ─────────────────────────────────

/**
 * Worker function that processes the queue for a given sale.
 * Dequeues entries one by one and attempts to create orders via RabbitMQ.
 */
export async function processQueue(saleId: string): Promise<number> {
  let processed = 0;
  const maxBatchPerTick = 50;

  for (let i = 0; i < maxBatchPerTick; i++) {
    const entry = await dequeue(saleId);
    if (!entry) break;

    try {
      // Get full entry data from DB
      const dbEntry = await queryOne<Record<string, unknown>>(
        'SELECT * FROM queue_entries WHERE id = $1',
        [entry.id]
      );

      if (!dbEntry) {
        logger.warn({ entryId: entry.id }, 'Queue entry not found in DB');
        continue;
      }

      const userId = dbEntry.user_id as string;
      const productId = dbEntry.product_id as string;
      const quantity = Number(dbEntry.quantity);

      // Publish to RabbitMQ for async order creation
      await publishMessage('order.create', {
        queueEntryId: entry.id,
        saleId,
        userId,
        productId,
        quantity,
        timestamp: new Date().toISOString(),
      });

      processed++;
    } catch (err) {
      logger.error({ err, entryId: entry.id }, 'Failed to process queue entry');

      // Mark as failed
      await execute(
        `UPDATE queue_entries SET status = 'failed_no_stock' WHERE id = $1`,
        [entry.id]
      );
    }
  }

  if (processed > 0) {
    logger.info({ saleId, processed }, 'Queue entries processed');
  }

  return processed;
}

// ─── Cleanup ─────────────────────────────────────────────────

/**
 * Remove entries that have been in the queue longer than the timeout.
 */
export async function cleanupExpiredEntries(): Promise<number> {
  const redis = getRedisClient();
  const now = Date.now();
  const timeoutMs = config.queue.entryTimeoutMs;
  const cutoff = now - timeoutMs;

  let cleanedCount = 0;

  // Get all active sales to clean up their queues
  const activeSales = await query<{ id: string }>(
    `SELECT id FROM flash_sales WHERE status = 'active'`
  );

  for (const sale of activeSales) {
    const setKey = queueSetKey(sale.id);

    try {
      // ZRANGEBYSCORE: get entries with score < cutoff (older than timeout)
      const expired = await redis.zrangebyscore(setKey, '-inf', cutoff.toString(), 'LIMIT', 0, 100);

      for (const entryId of expired) {
        // Get entry data before removing
        const entryData = await redis.hgetall(queueEntryKey(entryId));
        const userId = entryData.userId;

        // Remove from sorted set
        await redis.zrem(setKey, entryId);

        // Clean up Redis keys
        await redis.del(queueEntryKey(entryId));
        if (userId) {
          await redis.del(userQueueKey(sale.id, userId));
        }

        // Update DB
        await execute(
          `UPDATE queue_entries SET status = 'expired' WHERE id = $1 AND status = 'waiting'`,
          [entryId]
        );

        cleanedCount++;
      }
    } catch (err) {
      logger.error({ err, saleId: sale.id }, 'Queue cleanup failed for sale');
    }
  }

  if (cleanedCount > 0) {
    logger.info({ cleanedCount }, 'Expired queue entries cleaned up');
  }

  return cleanedCount;
}

// ─── Scheduler ──────────────────────────────────────────────

let cleanupTimer: NodeJS.Timeout | null = null;
let workerTimers: Map<string, NodeJS.Timeout> = new Map();

export function startQueueCleanupScheduler(intervalMs?: number): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
  }

  const interval = intervalMs || config.queue.cleanupIntervalMs;

  cleanupTimer = setInterval(async () => {
    try {
      await cleanupExpiredEntries();
    } catch (err) {
      logger.error({ err }, 'Queue cleanup tick failed');
    }
  }, interval);

  logger.info({ intervalMs: interval }, 'Queue cleanup scheduler started');
}

export function stopQueueCleanupScheduler(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }

  for (const [saleId, timer] of workerTimers) {
    clearInterval(timer);
    logger.info({ saleId }, 'Queue worker stopped');
  }
  workerTimers.clear();

  logger.info('Queue schedulers stopped');
}

/**
 * Start a worker that processes the queue for a specific sale at a regular interval.
 */
export function startQueueWorker(saleId: string, intervalMs?: number): void {
  if (workerTimers.has(saleId)) {
    clearInterval(workerTimers.get(saleId)!);
  }

  const interval = intervalMs || config.queue.workerIntervalMs;

  const timer = setInterval(async () => {
    try {
      await processQueue(saleId);
    } catch (err) {
      logger.error({ err, saleId }, 'Queue worker tick failed');
    }
  }, interval);

  workerTimers.set(saleId, timer);
  logger.info({ saleId, intervalMs: interval }, 'Queue worker started');
}

export function stopQueueWorker(saleId: string): void {
  const timer = workerTimers.get(saleId);
  if (timer) {
    clearInterval(timer);
    workerTimers.delete(saleId);
    logger.info({ saleId }, 'Queue worker stopped');
  }
}

import { v4 as uuidv4 } from 'uuid';
import { getRedisClient } from '../infra/redis.js';
import { queryOne, query, execute, withTransaction } from '../infra/postgres.js';
import { config } from '../config/index.js';
import { AppError, Reservation, ReservationData } from '../types/index.js';
import { logger } from '../infra/logger.js';

export type { Reservation };

// ─── Lua Scripts (inline) ───────────────────────────────────

const DEDUCT_LUA = `
-- Deduct stock atomically
-- KEYS[1]: stock key
-- ARGV[1]: quantity to deduct
-- Returns: {1, remaining} on success, {0, current_stock} on insufficient

local key = KEYS[1]
local qty = tonumber(ARGV[1])

local current = tonumber(redis.call("GET", key) or "0")

if current >= qty then
  local remaining = redis.call("DECRBY", key, qty)
  return {1, remaining}
else
  return {0, current}
end
`;

const RESERVE_LUA = `
-- Reserve stock: deduct from available, set reservation key with TTL
-- KEYS[1]: stock key (flash-sale:stock:<saleId>:<productId>)
-- KEYS[2]: reservation key (flash-sale:reservation:<reservationId>)
-- ARGV[1]: quantity to reserve
-- ARGV[2]: reservation data (JSON string)
-- ARGV[3]: TTL in seconds
-- Returns: {1, remaining} on success, {0, current_stock} on insufficient stock

local stockKey = KEYS[1]
local resKey = KEYS[2]
local qty = tonumber(ARGV[1])
local data = ARGV[2]
local ttl = tonumber(ARGV[3])

local current = tonumber(redis.call("GET", stockKey) or "0")

if current >= qty then
  local remaining = redis.call("DECRBY", stockKey, qty)
  redis.call("SETEX", resKey, ttl, data)
  return {1, remaining}
else
  return {0, current}
end
`;

const COMMIT_LUA = `
-- Commit reservation: delete the reservation key (stock already deducted)
-- KEYS[1]: reservation key
-- Returns: {1} on success, {0} if reservation not found

local resKey = KEYS[1]

if redis.call("EXISTS", resKey) == 1 then
  redis.call("DEL", resKey)
  return {1}
else
  return {0}
end
`;

const RELEASE_LUA = `
-- Release reservation: delete reservation key, increment stock back
-- KEYS[1]: stock key
-- KEYS[2]: reservation key
-- ARGV[1]: quantity to return
-- ARGV[2]: new TTL for stock key (optional, 0 to skip)
-- Returns: {1, new_stock} on success, {0, reason} on failure

local stockKey = KEYS[1]
local resKey = KEYS[2]
local qty = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2] or "0")

if redis.call("EXISTS", resKey) == 1 then
  redis.call("DEL", resKey)
  local newStock = redis.call("INCRBY", stockKey, qty)
  if ttl > 0 then
    redis.call("EXPIRE", stockKey, ttl)
  end
  return {1, newStock}
else
  return {0, "reservation not found"}
end
`;

let deductSha: string | null = null;
let reserveSha: string | null = null;
let commitSha: string | null = null;
let releaseSha: string | null = null;

// ─── Script Loading ─────────────────────────────────────────

export async function loadInventoryScripts(): Promise<{
  deductSha: string;
  reserveSha: string;
  commitSha: string;
  releaseSha: string;
}> {
  const redis = getRedisClient();

  try {
    deductSha = await (redis as any).script('LOAD', DEDUCT_LUA) as string;
    logger.info({ sha: deductSha }, 'Deduct Lua script loaded');
  } catch (err) {
    logger.error({ err }, 'Failed to load deduct Lua script');
    throw err;
  }

  try {
    reserveSha = await (redis as any).script('LOAD', RESERVE_LUA) as string;
    logger.info({ sha: reserveSha }, 'Reserve Lua script loaded');
  } catch (err) {
    logger.error({ err }, 'Failed to load reserve Lua script');
    throw err;
  }

  try {
    commitSha = await (redis as any).script('LOAD', COMMIT_LUA) as string;
    logger.info({ sha: commitSha }, 'Commit Lua script loaded');
  } catch (err) {
    logger.error({ err }, 'Failed to load commit Lua script');
    throw err;
  }

  try {
    releaseSha = await (redis as any).script('LOAD', RELEASE_LUA) as string;
    logger.info({ sha: releaseSha }, 'Release Lua script loaded');
  } catch (err) {
    logger.error({ err }, 'Failed to load release Lua script');
    throw err;
  }

  return {
    deductSha: deductSha!,
    reserveSha: reserveSha!,
    commitSha: commitSha!,
    releaseSha: releaseSha!,
  };
}

// ─── Key Helpers ────────────────────────────────────────────

function stockKey(saleId: string, productId: string): string {
  return `${config.redis.keyPrefix}stock:${saleId}:${productId}`;
}

function reservationKey(reservationId: string): string {
  return `${config.redis.keyPrefix}reservation:${reservationId}`;
}

// ─── Stock Operations ──────────────────────────────────────

/**
 * Deduct stock atomically. Returns success/failure with remaining count.
 */
export async function deductStock(
  saleId: string,
  productId: string,
  quantity: number
): Promise<{ success: boolean; remaining: number }> {
  const redis = getRedisClient();
  const key = stockKey(saleId, productId);

  if (!deductSha) {
    throw new AppError('Deduct Lua script not loaded', 500, 'INTERNAL_ERROR');
  }

  try {
    const result: [number, number] = await (redis as any).evalsha(
      deductSha,
      1,
      key,
      quantity
    );
    return { success: result[0] === 1, remaining: result[1] };
  } catch (err) {
    logger.error({ err, saleId, productId, quantity }, 'Deduct stock failed');
    throw err;
  }
}

/**
 * Reserve stock: atomically deduct from Redis AND create reservation record in Redis + DB.
 */
export async function reserveStock(
  saleId: string,
  productId: string,
  userId: string,
  quantity: number
): Promise<Reservation> {
  if (!reserveSha) {
    throw new AppError('Reserve Lua script not loaded', 500, 'INTERNAL_ERROR');
  }

  const reservationId = uuidv4();
  const ttl = config.inventory.reservationTtlSeconds;
  const expiresAt = new Date(Date.now() + ttl * 1000);

  const stockRedisKey = stockKey(saleId, productId);
  const resRedisKey = reservationKey(reservationId);

  const reservationData: ReservationData = {
    saleId,
    productId,
    userId,
    quantity,
    expiresAt: expiresAt.toISOString(),
  };

  // Run atomic reserve in Redis
  const redis = getRedisClient();
  let result: [number, number | string];

  try {
    result = await (redis as any).evalsha(
      reserveSha,
      2,
      stockRedisKey,
      resRedisKey,
      quantity,
      JSON.stringify(reservationData),
      ttl
    );
  } catch (err) {
    logger.error({ err, saleId, productId, userId, quantity }, 'Redis reserve failed');
    throw new AppError('Failed to reserve stock', 500, 'INTERNAL_ERROR');
  }

  if (result[0] !== 1) {
    throw new AppError(
      `Insufficient stock. Available: ${result[1]}`,
      409,
      'OUT_OF_STOCK'
    );
  }

  // Persist reservation to DB
  try {
    await execute(
      `INSERT INTO reservations (id, sale_id, product_id, user_id, quantity, reserved_at, expires_at, status)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6, 'active')`,
      [reservationId, saleId, productId, userId, quantity, expiresAt]
    );

    logger.info({ reservationId, saleId, productId, userId, quantity }, 'Stock reserved');
  } catch (dbErr) {
    // Compensation: release the Redis reservation
    logger.error({ err: dbErr, reservationId }, 'DB reservation insert failed, releasing Redis reservation');
    try {
      await (redis as any).evalsha(releaseSha, 2, stockRedisKey, resRedisKey, quantity, ttl);
    } catch (releaseErr) {
      logger.error({ err: releaseErr, reservationId }, 'Compensation release also failed');
    }
    throw new AppError('Failed to persist reservation', 500, 'INTERNAL_ERROR');
  }

  return {
    id: reservationId,
    saleId,
    productId,
    userId,
    quantity,
    reservedAt: new Date(),
    expiresAt,
    status: 'active',
  };
}

/**
 * Commit a reservation (delete Redis key, update DB status).
 */
export async function commitReservation(reservationId: string): Promise<void> {
  if (!commitSha) {
    throw new AppError('Commit Lua script not loaded', 500, 'INTERNAL_ERROR');
  }

  const reservation = await queryOne<Record<string, unknown>>(
    'SELECT * FROM reservations WHERE id = $1',
    [reservationId]
  );

  if (!reservation) {
    throw new AppError('Reservation not found', 404, 'RESERVATION_NOT_FOUND');
  }

  if (reservation.status !== 'active') {
    throw new AppError(
      `Cannot commit reservation with status '${reservation.status}'`,
      400,
      'INVALID_TRANSITION'
    );
  }

  const resRedisKey = reservationKey(reservationId);
  const redis = getRedisClient();

  try {
    await (redis as any).evalsha(commitSha, 1, resRedisKey);
  } catch (err) {
    logger.error({ err, reservationId }, 'Redis commit failed');
    throw new AppError('Failed to commit reservation', 500, 'INTERNAL_ERROR');
  }

  await execute(
    `UPDATE reservations SET status = 'committed' WHERE id = $1`,
    [reservationId]
  );

  logger.info({ reservationId }, 'Reservation committed');
}

/**
 * Release a reservation (delete Redis key, increment stock back, update DB).
 */
export async function releaseReservation(reservationId: string): Promise<void> {
  const reservation = await queryOne<Record<string, unknown>>(
    'SELECT * FROM reservations WHERE id = $1',
    [reservationId]
  );

  if (!reservation) {
    throw new AppError('Reservation not found', 404, 'RESERVATION_NOT_FOUND');
  }

  if (reservation.status !== 'active') {
    throw new AppError(
      `Cannot release reservation with status '${reservation.status}'`,
      400,
      'INVALID_TRANSITION'
    );
  }

  const saleId = reservation.sale_id as string;
  const productId = reservation.product_id as string;
  const quantity = Number(reservation.quantity);

  const stockRedisKey = stockKey(saleId, productId);
  const resRedisKey = reservationKey(reservationId);
  const ttl = config.inventory.reservationTtlSeconds;

  if (releaseSha) {
    const redis = getRedisClient();
    try {
      await (redis as any).evalsha(releaseSha, 2, stockRedisKey, resRedisKey, quantity, ttl);
    } catch (err) {
      logger.error({ err, reservationId }, 'Redis release failed');
      // Continue to update DB anyway
    }
  } else {
    // Fallback: manually release
    const redis = getRedisClient();
    const exists = await redis.exists(resRedisKey);
    if (exists) {
      await redis.del(resRedisKey);
      await redis.incrby(stockRedisKey, quantity);
      await redis.expire(stockRedisKey, ttl);
    }
  }

  await execute(
    `UPDATE reservations SET status = 'released' WHERE id = $1`,
    [reservationId]
  );

  logger.info({ reservationId, saleId, productId, quantity }, 'Reservation released');
}

// ─── Stock Query ─────────────────────────────────────────────

/**
 * Get current stock from Redis. Falls back to DB if Redis key doesn't exist.
 */
export async function getStock(saleId: string, productId: string): Promise<number> {
  const redis = getRedisClient();
  const key = stockKey(saleId, productId);

  try {
    const value = await redis.get(key);
    if (value !== null) {
      return parseInt(value, 10);
    }
  } catch (err) {
    logger.error({ err, saleId, productId }, 'Redis getStock failed, falling back to DB');
  }

  // Fallback to DB
  const row = await queryOne<{ stock_allocated: number }>(
    'SELECT stock_allocated FROM flash_sale_products WHERE sale_id = $1 AND product_id = $2',
    [saleId, productId]
  );

  if (!row) {
    throw new AppError('Sale product not found', 404, 'NOT_FOUND');
  }

  const stock = Number(row.stock_allocated);

  // Populate cache
  try {
    await redis.set(key, stock.toString());
    const ttl = config.inventory.reservationTtlSeconds;
    await redis.expire(key, ttl);
  } catch (err) {
    logger.warn({ err, saleId, productId }, 'Failed to populate stock cache');
  }

  return stock;
}

// ─── Cleanup ────────────────────────────────────────────────

/**
 * Find and release expired reservations in both Redis and DB.
 */
export async function cleanupExpiredReservations(): Promise<number> {
  const now = new Date();

  const expired = await query<Record<string, unknown>>(
    `SELECT * FROM reservations
     WHERE status = 'active' AND expires_at <= $1
     LIMIT 100`,
    [now]
  );

  let releasedCount = 0;
  const redis = getRedisClient();

  for (const r of expired) {
    const reservationId = r.id as string;
    const saleId = r.sale_id as string;
    const productId = r.product_id as string;
    const quantity = Number(r.quantity);

    try {
      // Release in Redis
      const stockRedisKey = stockKey(saleId, productId);
      const resRedisKey = reservationKey(reservationId);

      if (releaseSha) {
        try {
          await (redis as any).evalsha(
            releaseSha,
            2,
            stockRedisKey,
            resRedisKey,
            quantity,
            config.inventory.reservationTtlSeconds
          );
        } catch {
          // Reservation may have already been released
        }
      } else {
        const exists = await redis.exists(resRedisKey);
        if (exists) {
          await redis.del(resRedisKey);
          await redis.incrby(stockRedisKey, quantity);
        }
      }

      // Update DB
      await execute(
        `UPDATE reservations SET status = 'expired' WHERE id = $1`,
        [reservationId]
      );

      releasedCount++;
    } catch (err) {
      logger.error({ err, reservationId }, 'Failed to cleanup expired reservation');
    }
  }

  if (releasedCount > 0) {
    logger.info({ releasedCount }, 'Expired reservations cleaned up');
  }

  return releasedCount;
}

let cleanupTimer: NodeJS.Timeout | null = null;

export function startCleanupScheduler(intervalMs?: number): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
  }

  const interval = intervalMs || config.inventory.syncIntervalMs;

  cleanupTimer = setInterval(async () => {
    try {
      await cleanupExpiredReservations();
    } catch (err) {
      logger.error({ err }, 'Reservation cleanup tick failed');
    }
  }, interval);

  logger.info({ intervalMs: interval }, 'Reservation cleanup scheduler started');
}

export function stopCleanupScheduler(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
    logger.info('Reservation cleanup scheduler stopped');
  }
}

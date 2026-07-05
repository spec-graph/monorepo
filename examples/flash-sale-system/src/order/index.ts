import { v4 as uuidv4 } from 'uuid';
import { queryOne, query, execute, withTransaction } from '../infra/postgres.js';
import { getRedisClient } from '../infra/redis.js';
import { config } from '../config/index.js';
import { AppError, Order, OrderRow, OrderStatus, PaginatedResult } from '../types/index.js';
import { logger } from '../infra/logger.js';
import { reserveStock, commitReservation, releaseReservation } from '../inventory/index.js';
import { publishMessage, QUEUES, consumeMessages } from '../infra/rabbitmq.js';

export type { Order };

// ─── Row Mapping ─────────────────────────────────────────────

function mapOrder(row: OrderRow): Order {
  return {
    id: row.id,
    userId: row.user_id,
    saleId: row.sale_id,
    productId: row.product_id,
    salePrice: Number(row.sale_price),
    quantity: row.quantity,
    status: row.status,
    reservationId: row.reservation_id || undefined,
    queueEntryId: row.queue_entry_id || undefined,
    idempotencyKey: row.idempotency_key,
    paidAt: row.paid_at || undefined,
    cancelledAt: row.cancelled_at || undefined,
    cancelReason: row.cancel_reason || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── Idempotency ─────────────────────────────────────────────

async function checkIdempotency(idempotencyKey: string): Promise<Order | null> {
  const existing = await queryOne<OrderRow>(
    'SELECT * FROM orders WHERE idempotency_key = $1',
    [idempotencyKey]
  );
  return existing ? mapOrder(existing) : null;
}

async function saveIdempotencyKey(
  idempotencyKey: string,
  orderId: string
): Promise<void> {
  const redis = getRedisClient();
  const key = `${config.redis.keyPrefix}idempotency:${idempotencyKey}`;
  await redis.setex(key, config.security.idempotencyTtlSeconds, orderId);
}

// ─── Create Order ────────────────────────────────────────────

export async function createOrder(
  userId: string,
  saleId: string,
  productId: string,
  quantity: number,
  idempotencyKey: string
): Promise<Order> {
  // Validate idempotency key
  if (!idempotencyKey || idempotencyKey.trim().length === 0) {
    throw new AppError('Idempotency key is required', 400, 'VALIDATION_ERROR');
  }

  // Check Redis idempotency cache first (fast path)
  const redis = getRedisClient();
  const cachedOrderId = await redis.get(`${config.redis.keyPrefix}idempotency:${idempotencyKey}`);
  if (cachedOrderId) {
    const existing = await queryOne<OrderRow>(
      'SELECT * FROM orders WHERE id = $1',
      [cachedOrderId]
    );
    if (existing) {
      logger.info({ orderId: cachedOrderId, idempotencyKey }, 'Idempotent order returned from cache');
      return mapOrder(existing);
    }
  }

  // Check DB idempotency (slow path, for persisted records whose cache TTL expired)
  const existingOrder = await checkIdempotency(idempotencyKey);
  if (existingOrder) {
    // Re-populate cache
    await saveIdempotencyKey(idempotencyKey, existingOrder.id);
    return existingOrder;
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
    throw new AppError('Flash sale is not active', 400, 'INVALID_TRANSITION');
  }

  // Verify sale product
  const saleProduct = await queryOne<Record<string, unknown>>(
    'SELECT * FROM flash_sale_products WHERE sale_id = $1 AND product_id = $2',
    [saleId, productId]
  );
  if (!saleProduct) {
    throw new AppError('Product not found in this flash sale', 404, 'NOT_FOUND');
  }

  const salePrice = Number(saleProduct.sale_price);
  const perUserLimit = Number(saleProduct.per_user_limit);

  // Validate quantity
  if (!quantity || quantity <= 0) {
    throw new AppError('Quantity must be positive', 400, 'VALIDATION_ERROR');
  }

  // Check per-user limit
  const purchaseCountRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM orders
     WHERE sale_id = $1 AND user_id = $2 AND product_id = $3 AND status IN ('pending', 'paid')`,
    [saleId, userId, productId]
  );
  const purchaseCount = parseInt(purchaseCountRow?.count || '0', 10);

  if (purchaseCount + quantity > perUserLimit) {
    throw new AppError(
      `Per-user purchase limit reached. Limit: ${perUserLimit}, already purchased: ${purchaseCount}`,
      400,
      'USER_LIMIT_REACHED'
    );
  }

  // Reserve stock
  let reservation;
  try {
    reservation = await reserveStock(saleId, productId, userId, quantity);
  } catch (err) {
    if (err instanceof AppError && err.code === 'OUT_OF_STOCK') {
      throw err;
    }
    throw new AppError('Failed to reserve stock', 500, 'INTERNAL_ERROR');
  }

  // Create order with reservation in a transaction
  const orderId = uuidv4();

  try {
    const order = await withTransaction(async (clientQuery) => {
      const result = await clientQuery(
        `INSERT INTO orders (id, user_id, sale_id, product_id, sale_price, quantity, status, reservation_id, idempotency_key, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, NOW(), NOW())
         RETURNING *`,
        [orderId, userId, saleId, productId, salePrice, quantity, reservation.id, idempotencyKey]
      );

      return mapOrder(result.rows[0] as unknown as OrderRow);
    });

    // Cache idempotency key
    await saveIdempotencyKey(idempotencyKey, orderId);

    // Publish to RabbitMQ for async processing (e.g., payment processing)
    try {
      await publishMessage('order.create', {
        queueEntryId: '',
        saleId,
        userId,
        productId,
        quantity,
        timestamp: new Date().toISOString(),
        payload: { orderId, reservationId: reservation.id },
      });
    } catch (rmqErr) {
      logger.warn({ err: rmqErr, orderId }, 'Failed to publish order creation event, order still created');
    }

    logger.info({ orderId, userId, saleId, productId, quantity, salePrice }, 'Order created');
    return order;
  } catch (err) {
    // Compensation: release reservation if order creation fails
    logger.error({ err, orderId, reservationId: reservation.id }, 'Order creation failed, releasing reservation');
    try {
      await releaseReservation(reservation.id);
    } catch (releaseErr) {
      logger.error({ err: releaseErr, reservationId: reservation.id }, 'Compensation release failed');
    }
    throw err;
  }
}

// ─── Read Operations ─────────────────────────────────────────

export async function getOrder(id: string): Promise<Order | null> {
  const row = await queryOne<OrderRow>(
    'SELECT * FROM orders WHERE id = $1',
    [id]
  );
  return row ? mapOrder(row) : null;
}

export async function listOrders(
  userId: string,
  page: number = 1,
  limit: number = 20
): Promise<{ items: Order[]; totalCount: number; page: number; totalPages: number }> {
  page = Math.max(1, page);
  limit = Math.min(100, Math.max(1, limit));
  const offset = (page - 1) * limit;

  const countRow = await queryOne<{ count: string }>(
    'SELECT COUNT(*)::text as count FROM orders WHERE user_id = $1',
    [userId]
  );
  const totalCount = parseInt(countRow?.count || '0', 10);

  const rows = await query<OrderRow>(
    `SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  return {
    items: rows.map(mapOrder),
    totalCount,
    page,
    totalPages: Math.ceil(totalCount / limit),
  };
}

// ─── Payment Processing ──────────────────────────────────────

/**
 * Mock payment processing based on config.payment.successRate.
 * Simulates latency and randomly succeeds/fails.
 */
export async function processPayment(orderId: string): Promise<Order> {
  const order = await queryOne<OrderRow>(
    'SELECT * FROM orders WHERE id = $1',
    [orderId]
  );

  if (!order) {
    throw new AppError('Order not found', 404, 'NOT_FOUND');
  }

  if (order.status !== 'pending') {
    throw new AppError(
      `Cannot process payment for order with status '${order.status}'`,
      400,
      'INVALID_TRANSITION'
    );
  }

  // Simulate payment latency
  await new Promise(resolve => setTimeout(resolve, config.payment.latencyMs));

  // Random success/failure based on configured rate
  const isSuccess = Math.random() < config.payment.successRate;

  if (!isSuccess) {
    logger.warn({ orderId }, 'Payment failed (simulated)');
    throw new AppError('Payment processing failed. Please try again.', 402, 'PAYMENT_FAILED');
  }

  // Commit reservation (stock was already deducted, just clean up the reservation key)
  if (order.reservation_id) {
    try {
      await commitReservation(order.reservation_id);
    } catch (err) {
      logger.error({ err, orderId, reservationId: order.reservation_id }, 'Failed to commit reservation on payment');
      // Don't fail the payment - the stock was already deducted
    }
  }

  // Mark order as paid
  const updated = await queryOne<OrderRow>(
    `UPDATE orders SET status = 'paid', paid_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [orderId]
  );

  if (!updated) {
    throw new AppError('Failed to process payment - order may have been modified', 409, 'CONFLICT');
  }

  logger.info({ orderId, amount: Number(order.sale_price) * order.quantity }, 'Payment processed successfully');
  return mapOrder(updated);
}

// ─── Cancel Order ────────────────────────────────────────────

export async function cancelOrder(orderId: string, reason: string): Promise<Order> {
  const order = await queryOne<OrderRow>(
    'SELECT * FROM orders WHERE id = $1',
    [orderId]
  );

  if (!order) {
    throw new AppError('Order not found', 404, 'NOT_FOUND');
  }

  if (order.status === 'cancelled') {
    throw new AppError('Order is already cancelled', 400, 'INVALID_TRANSITION');
  }

  if (order.status === 'paid') {
    throw new AppError('Cannot cancel a paid order', 400, 'INVALID_TRANSITION');
  }

  // Release reserved stock
  if (order.reservation_id) {
    try {
      await releaseReservation(order.reservation_id);
    } catch (err) {
      logger.error({ err, orderId, reservationId: order.reservation_id }, 'Failed to release reservation on cancel');
      // Continue with cancellation
    }
  }

  const updated = await queryOne<OrderRow>(
    `UPDATE orders SET status = 'cancelled', cancelled_at = NOW(), cancel_reason = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [orderId, reason || 'Cancelled by user']
  );

  if (!updated) {
    throw new AppError('Failed to cancel order', 500, 'INTERNAL_ERROR');
  }

  logger.info({ orderId, reason }, 'Order cancelled');
  return mapOrder(updated);
}

// ─── Auto-Cancel Expired Orders ──────────────────────────────

/**
 * Find pending orders older than paymentTimeoutMs and cancel them.
 */
export async function autoCancelExpiredOrders(): Promise<number> {
  const cutoff = new Date(Date.now() - config.order.paymentTimeoutMs);

  const expiredOrders = await query<OrderRow>(
    `SELECT * FROM orders
     WHERE status = 'pending' AND created_at <= $1
     LIMIT 100`,
    [cutoff]
  );

  let cancelledCount = 0;

  for (const order of expiredOrders) {
    try {
      await cancelOrder(order.id, 'Payment timeout - auto cancelled');
      cancelledCount++;
    } catch (err) {
      logger.error({ err, orderId: order.id }, 'Failed to auto-cancel expired order');
    }
  }

  if (cancelledCount > 0) {
    logger.info({ cancelledCount }, 'Expired orders auto-cancelled');
  }

  return cancelledCount;
}

// ─── Scheduler ──────────────────────────────────────────────

let autoCancelTimer: NodeJS.Timeout | null = null;

export function startAutoCancelScheduler(intervalMs?: number): void {
  if (autoCancelTimer) {
    clearInterval(autoCancelTimer);
  }

  const interval = intervalMs || config.order.autoCancelIntervalMs;

  autoCancelTimer = setInterval(async () => {
    try {
      await autoCancelExpiredOrders();
    } catch (err) {
      logger.error({ err }, 'Auto-cancel orders tick failed');
    }
  }, interval);

  logger.info({ intervalMs: interval }, 'Auto-cancel scheduler started');
}

export function stopAutoCancelScheduler(): void {
  if (autoCancelTimer) {
    clearInterval(autoCancelTimer);
    autoCancelTimer = null;
    logger.info('Auto-cancel scheduler stopped');
  }
}

// ─── RabbitMQ Consumer for Async Order Processing ────────────

/**
 * Start consuming order creation messages from RabbitMQ.
 * This handles the async path: queue entry -> order creation.
 */
export async function startOrderConsumer(): Promise<void> {
  await consumeMessages(
    QUEUES.ORDER_CREATE,
    async (msg, ack, nack) => {
      try {
        const { queueEntryId, saleId, userId, productId, quantity, payload } = msg;

        // If this came from queue worker, use the queue entry info
        const payloadData = msg.payload as Record<string, unknown> | undefined;
        if (queueEntryId && payloadData?.orderId) {
          // Update queue entry status
          await execute(
            `UPDATE queue_entries SET status = 'served' WHERE id = $1`,
            [queueEntryId]
          );
          ack();
          return;
        }

        // Otherwise it's a direct order creation event - order already created in DB
        ack();
      } catch (err) {
        logger.error({ err, message: msg }, 'Error processing order message');
        nack(false); // send to DLQ
      }
    }
  );

  logger.info('Order consumer started');
}

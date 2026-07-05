import { v4 as uuidv4 } from 'uuid';
import { queryOne, query, execute, withTransaction } from '../infra/postgres.js';
import { getRedisClient } from '../infra/redis.js';
import { config } from '../config/index.js';
import {
  AppError,
  FlashSale,
  SaleProduct,
  SaleRow,
  SaleProductRow,
  SaleStatus,
} from '../types/index.js';
import { logger } from '../infra/logger.js';

export type { FlashSale, SaleProduct };

// ─── Row Mapping ─────────────────────────────────────────────

function mapSaleRow(row: SaleRow, products: SaleProduct[]): FlashSale {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    startTime: row.start_time,
    endTime: row.end_time,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    products,
  };
}

function mapSaleProductRow(row: Record<string, unknown>): SaleProduct {
  return {
    id: row.id as string,
    saleId: row.sale_id as string,
    productId: row.product_id as string,
    salePrice: Number(row.sale_price),
    stockAllocated: Number(row.stock_allocated),
    perUserLimit: Number(row.per_user_limit),
  };
}

// ─── Helpers ─────────────────────────────────────────────────

function validateFlashSaleTimes(startTime: string, endTime: string): void {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  const now = Date.now();

  if (isNaN(start) || isNaN(end)) {
    throw new AppError('Invalid startTime or endTime format', 400, 'VALIDATION_ERROR');
  }

  if (start >= end) {
    throw new AppError('startTime must be before endTime', 400, 'VALIDATION_ERROR');
  }

  if (end <= now) {
    throw new AppError('endTime must be in the future', 400, 'VALIDATION_ERROR');
  }
}

async function loadSaleProducts(saleId: string): Promise<SaleProduct[]> {
  const rows = await query<Record<string, unknown>>(
    'SELECT * FROM flash_sale_products WHERE sale_id = $1',
    [saleId]
  );
  return rows.map(mapSaleProductRow);
}

function deriveStatus(startTime: Date, endTime: Date): SaleStatus {
  const now = Date.now();
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();

  if (now < start) return 'upcoming';
  if (now >= start && now < end) return 'active';
  return 'ended';
}

// ─── CRUD ───────────────────────────────────────────────────

export async function createFlashSale(data: {
  name: string;
  description?: string;
  startTime: string;
  endTime: string;
  createdBy: string;
  products: Array<{
    productId: string;
    salePrice: number;
    stockAllocated: number;
    perUserLimit: number;
  }>;
}): Promise<FlashSale> {
  // Validate name
  if (!data.name || data.name.trim().length === 0) {
    throw new AppError('Sale name is required', 400, 'VALIDATION_ERROR');
  }

  if (data.name.trim().length > 200) {
    throw new AppError('Sale name must be 200 characters or less', 400, 'VALIDATION_ERROR');
  }

  // Validate times
  validateFlashSaleTimes(data.startTime, data.endTime);

  // Validate products
  if (!data.products || data.products.length === 0) {
    throw new AppError('At least one product is required for a flash sale', 400, 'VALIDATION_ERROR');
  }

  for (const p of data.products) {
    if (!p.productId) {
      throw new AppError('Product ID is required for each sale product', 400, 'VALIDATION_ERROR');
    }
    if (p.salePrice === undefined || p.salePrice < 0) {
      throw new AppError('Sale price must be non-negative', 400, 'VALIDATION_ERROR');
    }
    if (p.stockAllocated === undefined || p.stockAllocated <= 0) {
      throw new AppError('Stock allocated must be positive', 400, 'VALIDATION_ERROR');
    }
    if (p.perUserLimit === undefined || p.perUserLimit <= 0) {
      throw new AppError('Per-user limit must be positive', 400, 'VALIDATION_ERROR');
    }

    // Verify product exists
    const product = await queryOne<Record<string, unknown>>(
      'SELECT id FROM products WHERE id = $1',
      [p.productId]
    );
    if (!product) {
      throw new AppError(`Product ${p.productId} not found`, 404, 'NOT_FOUND');
    }
  }

  const status = deriveStatus(new Date(data.startTime), new Date(data.endTime));
  const saleId = uuidv4();

  const sale = await withTransaction(async (clientQuery) => {
    // Create the sale
    const saleResult = await clientQuery(
      `INSERT INTO flash_sales (id, name, description, status, start_time, end_time, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       RETURNING *`,
      [saleId, data.name.trim(), data.description?.trim() || '', status, data.startTime, data.endTime, data.createdBy]
    );
    const saleRow = saleResult.rows[0] as unknown as SaleRow;

    // Create sale products
    const saleProducts: SaleProduct[] = [];
    for (const p of data.products) {
      const spId = uuidv4();
      const spResult = await clientQuery(
        `INSERT INTO flash_sale_products (id, sale_id, product_id, sale_price, stock_allocated, per_user_limit)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [spId, saleId, p.productId, p.salePrice, p.stockAllocated, p.perUserLimit]
      );
      saleProducts.push(mapSaleProductRow(spResult.rows[0] as Record<string, unknown>));
    }

    return mapSaleRow(saleRow, saleProducts);
  });

  logger.info({ saleId, name: data.name, productCount: data.products.length }, 'Flash sale created');
  return sale;
}

export async function getFlashSale(id: string): Promise<FlashSale | null> {
  const row = await queryOne<SaleRow>(
    'SELECT * FROM flash_sales WHERE id = $1',
    [id]
  );
  if (!row) return null;

  const products = await loadSaleProducts(id);
  return mapSaleRow(row, products);
}

export async function listFlashSales(
  status?: SaleStatus,
  page: number = 1,
  limit: number = 20
): Promise<{ items: FlashSale[]; totalCount: number; page: number; totalPages: number }> {
  page = Math.max(1, page);
  limit = Math.min(100, Math.max(1, limit));
  const offset = (page - 1) * limit;

  let whereClause = '';
  const values: unknown[] = [];
  let paramIdx = 0;

  if (status) {
    paramIdx++;
    whereClause = `WHERE status = $${paramIdx}`;
    values.push(status);
  }

  // Count
  const countRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM flash_sales ${whereClause}`,
    values
  );
  const totalCount = parseInt(countRow?.count || '0', 10);

  // Query
  const limitParam = paramIdx + 1;
  const offsetParam = paramIdx + 2;
  const rows = await query<SaleRow>(
    `SELECT * FROM flash_sales ${whereClause} ORDER BY start_time DESC LIMIT $${limitParam} OFFSET $${offsetParam}`,
    [...values, limit, offset]
  );

  // Load products for each sale
  const items: FlashSale[] = [];
  for (const row of rows) {
    const products = await loadSaleProducts(row.id);
    items.push(mapSaleRow(row, products));
  }

  return {
    items,
    totalCount,
    page,
    totalPages: Math.ceil(totalCount / limit),
  };
}

export async function updateFlashSale(
  id: string,
  data: Partial<{
    name: string;
    description: string;
    startTime: string;
    endTime: string;
  }>
): Promise<FlashSale> {
  const existing = await queryOne<SaleRow>(
    'SELECT * FROM flash_sales WHERE id = $1',
    [id]
  );
  if (!existing) {
    throw new AppError('Flash sale not found', 404, 'NOT_FOUND');
  }

  if (existing.status !== 'upcoming') {
    throw new AppError('Can only update upcoming flash sales', 400, 'INVALID_TRANSITION');
  }

  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIdx = 0;

  if (data.name !== undefined) {
    if (!data.name || data.name.trim().length === 0) {
      throw new AppError('Sale name is required', 400, 'VALIDATION_ERROR');
    }
    paramIdx++;
    updates.push(`name = $${paramIdx}`);
    values.push(data.name.trim());
  }

  if (data.description !== undefined) {
    paramIdx++;
    updates.push(`description = $${paramIdx}`);
    values.push(data.description.trim());
  }

  if (data.startTime !== undefined || data.endTime !== undefined) {
    const startTime = data.startTime || existing.start_time.toISOString();
    const endTime = data.endTime || existing.end_time.toISOString();
    validateFlashSaleTimes(startTime, endTime);

    if (data.startTime !== undefined) {
      paramIdx++;
      updates.push(`start_time = $${paramIdx}`);
      values.push(data.startTime);
    }

    if (data.endTime !== undefined) {
      paramIdx++;
      updates.push(`end_time = $${paramIdx}`);
      values.push(data.endTime);
    }

    // Re-derive status
    const newStatus = deriveStatus(
      new Date(startTime),
      new Date(endTime)
    );
    paramIdx++;
    updates.push(`status = $${paramIdx}`);
    values.push(newStatus);
  }

  if (updates.length === 0) {
    const products = await loadSaleProducts(id);
    return mapSaleRow(existing, products);
  }

  paramIdx++;
  updates.push(`updated_at = NOW()`);
  values.push(id);

  const row = await queryOne<SaleRow>(
    `UPDATE flash_sales SET ${updates.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
    values
  );

  if (!row) {
    throw new AppError('Failed to update flash sale', 500, 'INTERNAL_ERROR');
  }

  const products = await loadSaleProducts(id);

  logger.info({ saleId: id }, 'Flash sale updated');
  return mapSaleRow(row, products);
}

// ─── Status Transitions ─────────────────────────────────────

/**
 * Warm up Redis cache with stock data for the given flash sale.
 * This is called when a sale transitions to 'active'.
 */
async function warmUpStockCache(saleId: string): Promise<void> {
  const redis = getRedisClient();
  const products = await loadSaleProducts(saleId);

  let successCount = 0;
  let retryCount = 0;

  for (const product of products) {
    const stockKey = `${config.redis.keyPrefix}stock:${saleId}:${product.productId}`;
    let success = false;

    while (!success && retryCount < 3) {
      try {
        // Only set if not already cached
        const exists = await redis.exists(stockKey);
        if (!exists) {
          await redis.set(stockKey, product.stockAllocated.toString());
          // Set TTL based on sale duration + buffer
          const ttl = 86400 * 2; // 2 days default
          await redis.expire(stockKey, ttl);
        }
        success = true;
        successCount++;
      } catch (err) {
        retryCount++;
        logger.error({ err, saleId, productId: product.productId, retryCount }, 'Failed to warm up stock cache, retrying');
        if (retryCount < 3) {
          await new Promise(resolve => setTimeout(resolve, config.sale.warmUpRetryMs));
        }
      }
    }

    if (!success) {
      logger.error({ saleId, productId: product.productId }, 'Failed to warm up stock cache after retries');
    }
  }

  logger.info({ saleId, successCount, totalProducts: products.length }, 'Stock cache warm-up completed');
}

export async function startFlashSale(id: string): Promise<FlashSale> {
  const row = await queryOne<SaleRow>(
    'SELECT * FROM flash_sales WHERE id = $1',
    [id]
  );
  if (!row) {
    throw new AppError('Flash sale not found', 404, 'NOT_FOUND');
  }

  if (row.status !== 'upcoming') {
    throw new AppError(
      `Cannot start sale with status '${row.status}'. Only upcoming sales can be started.`,
      400,
      'INVALID_TRANSITION'
    );
  }

  const updated = await queryOne<SaleRow>(
    `UPDATE flash_sales SET status = 'active', updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [id]
  );

  if (!updated) {
    throw new AppError('Failed to start flash sale', 500, 'INTERNAL_ERROR');
  }

  // Warm up Redis cache in the background (don't block)
  warmUpStockCache(id).catch(err => {
    logger.error({ err, saleId: id }, 'Background stock cache warm-up failed');
  });

  const products = await loadSaleProducts(id);

  logger.info({ saleId: id }, 'Flash sale started');
  return mapSaleRow(updated, products);
}

export async function endFlashSale(id: string): Promise<FlashSale> {
  const row = await queryOne<SaleRow>(
    'SELECT * FROM flash_sales WHERE id = $1',
    [id]
  );
  if (!row) {
    throw new AppError('Flash sale not found', 404, 'NOT_FOUND');
  }

  if (row.status === 'ended') {
    throw new AppError('Flash sale is already ended', 400, 'INVALID_TRANSITION');
  }

  const updated = await queryOne<SaleRow>(
    `UPDATE flash_sales SET status = 'ended', updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [id]
  );

  if (!updated) {
    throw new AppError('Failed to end flash sale', 500, 'INTERNAL_ERROR');
  }

  const products = await loadSaleProducts(id);

  logger.info({ saleId: id }, 'Flash sale ended');
  return mapSaleRow(updated, products);
}

// ─── User Purchase Count ────────────────────────────────────

export async function getUserPurchaseCount(saleId: string, userId: string): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM orders
     WHERE sale_id = $1 AND user_id = $2 AND status IN ('pending', 'paid')`,
    [saleId, userId]
  );
  return parseInt(row?.count || '0', 10);
}

// ─── Auto-Transition ─────────────────────────────────────────

let autoTransitionTimer: NodeJS.Timeout | null = null;

/**
 * Cron-style function that auto-transitions sales based on their times.
 * Runs at intervals defined by config.sale.autoTransitionIntervalMs.
 */
export async function autoTransitionSales(): Promise<{ started: number; ended: number }> {
  const now = new Date().toISOString();
  let started = 0;
  let ended = 0;

  try {
    // Transition upcoming -> active
    const toStart = await query<SaleRow>(
      `UPDATE flash_sales SET status = 'active', updated_at = NOW()
       WHERE status = 'upcoming' AND start_time <= $1
       RETURNING *`,
      [now]
    );
    started = toStart.length;

    for (const sale of toStart) {
      logger.info({ saleId: sale.id }, 'Auto-started flash sale');
      warmUpStockCache(sale.id).catch(err => {
        logger.error({ err, saleId: sale.id }, 'Auto-start stock cache warm-up failed');
      });
    }

    // Transition active -> ended
    const toEnd = await query<SaleRow>(
      `UPDATE flash_sales SET status = 'ended', updated_at = NOW()
       WHERE status = 'active' AND end_time <= $1
       RETURNING *`,
      [now]
    );
    ended = toEnd.length;

    for (const sale of toEnd) {
      logger.info({ saleId: sale.id }, 'Auto-ended flash sale');
    }
  } catch (err) {
    logger.error({ err }, 'Auto-transition sales failed');
  }

  return { started, ended };
}

export function startAutoTransition(intervalMs?: number): void {
  if (autoTransitionTimer) {
    clearInterval(autoTransitionTimer);
  }

  const interval = intervalMs || config.sale.autoTransitionIntervalMs;

  autoTransitionTimer = setInterval(async () => {
    try {
      await autoTransitionSales();
    } catch (err) {
      logger.error({ err }, 'Auto-transition tick failed');
    }
  }, interval);

  logger.info({ intervalMs: interval }, 'Auto-transition scheduler started');
}

export function stopAutoTransition(): void {
  if (autoTransitionTimer) {
    clearInterval(autoTransitionTimer);
    autoTransitionTimer = null;
    logger.info('Auto-transition scheduler stopped');
  }
}

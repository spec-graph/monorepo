import { v4 as uuidv4 } from 'uuid';
import { queryOne, query, execute, withTransaction } from '../infra/postgres.js';
import { AppError, Product, ProductRow, ProductSearchParams, PaginatedResult } from '../types/index.js';
import { logger } from '../infra/logger.js';

export type { Product, PaginatedResult };

// ─── Row Mapping ─────────────────────────────────────────────

function mapProduct(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    basePrice: Number(row.base_price),
    imageUrl: row.image_url || undefined,
    category: row.category || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── CRUD Operations ────────────────────────────────────────

export async function createProduct(
  data: {
    name: string;
    description?: string;
    basePrice: number;
    imageUrl?: string;
    category?: string;
  }
): Promise<Product> {
  if (!data.name || data.name.trim().length === 0) {
    throw new AppError('Product name is required', 400, 'VALIDATION_ERROR');
  }

  if (data.basePrice === undefined || data.basePrice < 0) {
    throw new AppError('Product base price must be non-negative', 400, 'VALIDATION_ERROR');
  }

  const id = uuidv4();
  const row = await queryOne<ProductRow>(
    `INSERT INTO products (id, name, description, base_price, image_url, category, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
     RETURNING *`,
    [id, data.name.trim(), data.description?.trim() || '', data.basePrice, data.imageUrl || null, data.category || null]
  );

  if (!row) {
    throw new AppError('Failed to create product', 500, 'INTERNAL_ERROR');
  }

  logger.info({ productId: id, name: data.name }, 'Product created');
  return mapProduct(row);
}

export async function getProduct(id: string): Promise<Product | null> {
  const row = await queryOne<ProductRow>(
    'SELECT * FROM products WHERE id = $1',
    [id]
  );
  return row ? mapProduct(row) : null;
}

export async function updateProduct(
  id: string,
  data: Partial<{ name: string; description: string; basePrice: number; imageUrl: string; category: string }>
): Promise<Product> {
  const existing = await getProduct(id);
  if (!existing) {
    throw new AppError('Product not found', 404, 'NOT_FOUND');
  }

  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIdx = 0;

  if (data.name !== undefined) {
    paramIdx++;
    updates.push(`name = $${paramIdx}`);
    values.push(data.name.trim());
  }
  if (data.description !== undefined) {
    paramIdx++;
    updates.push(`description = $${paramIdx}`);
    values.push(data.description.trim());
  }
  if (data.basePrice !== undefined) {
    if (data.basePrice < 0) {
      throw new AppError('Product base price must be non-negative', 400, 'VALIDATION_ERROR');
    }
    paramIdx++;
    updates.push(`base_price = $${paramIdx}`);
    values.push(data.basePrice);
  }
  if (data.imageUrl !== undefined) {
    paramIdx++;
    updates.push(`image_url = $${paramIdx}`);
    values.push(data.imageUrl);
  }
  if (data.category !== undefined) {
    paramIdx++;
    updates.push(`category = $${paramIdx}`);
    values.push(data.category);
  }

  if (updates.length === 0) {
    return existing;
  }

  paramIdx++;
  updates.push(`updated_at = NOW()`);
  values.push(id);

  const row = await queryOne<ProductRow>(
    `UPDATE products SET ${updates.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
    values
  );

  if (!row) {
    throw new AppError('Failed to update product', 500, 'INTERNAL_ERROR');
  }

  logger.info({ productId: id }, 'Product updated');
  return mapProduct(row);
}

export async function deleteProduct(id: string): Promise<void> {
  const existing = await getProduct(id);
  if (!existing) {
    throw new AppError('Product not found', 404, 'NOT_FOUND');
  }

  await execute('DELETE FROM products WHERE id = $1', [id]);
  logger.info({ productId: id }, 'Product deleted');
}

// ─── Search ──────────────────────────────────────────────────

export async function searchProducts(params: ProductSearchParams = {}): Promise<PaginatedResult<Product>> {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, Math.max(1, params.limit || 20));
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIdx = 0;

  if (params.search) {
    paramIdx++;
    conditions.push(`(name ILIKE $${paramIdx} OR description ILIKE $${paramIdx})`);
    values.push(`%${params.search}%`);
  }

  if (params.category) {
    paramIdx++;
    conditions.push(`category = $${paramIdx}`);
    values.push(params.category);
  }

  if (params.minPrice !== undefined) {
    paramIdx++;
    conditions.push(`base_price >= $${paramIdx}`);
    values.push(params.minPrice);
  }

  if (params.maxPrice !== undefined) {
    paramIdx++;
    conditions.push(`base_price <= $${paramIdx}`);
    values.push(params.maxPrice);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Count total
  const countRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM products ${whereClause}`,
    values
  );
  const totalCount = parseInt(countRow?.count || '0', 10);

  // Get page
  const limitParam = paramIdx + 1;
  const offsetParam = paramIdx + 2;
  const rows = await query<ProductRow>(
    `SELECT * FROM products ${whereClause} ORDER BY created_at DESC LIMIT $${limitParam} OFFSET $${offsetParam}`,
    [...values, limit, offset]
  );

  return {
    items: rows.map(mapProduct),
    totalCount,
    page,
    totalPages: Math.ceil(totalCount / limit),
  };
}

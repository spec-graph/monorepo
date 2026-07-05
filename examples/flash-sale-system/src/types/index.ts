import { Request, Response, NextFunction } from 'express';

// ─── API Response ────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    correlationId: string;
  };
  meta?: {
    page?: number;
    limit?: number;
    totalCount?: number;
    totalPages?: number;
  };
}

// ─── App Error ───────────────────────────────────────────────

export type ErrorCode =
  | 'INTERNAL_ERROR'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNPROCESSABLE_ENTITY'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  | 'PAYMENT_FAILED'
  | 'OUT_OF_STOCK'
  | 'USER_LIMIT_REACHED'
  | 'RESERVATION_NOT_FOUND'
  | 'ALREADY_QUEUED'
  | 'INVALID_TRANSITION'
  | 'NONCE_REPLAYED'
  | 'TIMESTAMP_STALE'
  | 'INVALID_SIGNATURE'
  | 'IDEMPOTENCY_MISMATCH'
  | 'TOKEN_REVOKED';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly details?: unknown;

  constructor(message: string, statusCode: number = 500, code: ErrorCode = 'INTERNAL_ERROR', details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      code: this.code,
      details: this.details,
    };
  }
}

// ─── Health ──────────────────────────────────────────────────

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'shutting_down';
  uptime: number;
  timestamp: string;
  dependencies: Record<string, { status: 'up' | 'down'; latencyMs?: number; error?: string }>;
}

// ─── JWT ─────────────────────────────────────────────────────

export interface JwtPayload {
  sub: string;
  email: string;
  role: 'buyer' | 'admin' | 'operator';
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// ─── User ────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  role: 'buyer' | 'admin' | 'operator';
  createdAt: Date;
  updatedAt: Date;
}

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: 'buyer' | 'admin' | 'operator';
  created_at: Date;
  updated_at: Date;
}

// ─── Product ─────────────────────────────────────────────────

export interface Product {
  id: string;
  name: string;
  description: string;
  basePrice: number;
  imageUrl?: string;
  category?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductRow {
  id: string;
  name: string;
  description: string;
  base_price: number;
  image_url?: string;
  category?: string;
  created_at: Date;
  updated_at: Date;
}

export interface ProductSearchParams {
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  category?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  totalPages: number;
}

// ─── Flash Sale ──────────────────────────────────────────────

export type SaleStatus = 'upcoming' | 'active' | 'ended';

export interface FlashSale {
  id: string;
  name: string;
  description: string;
  status: SaleStatus;
  startTime: Date;
  endTime: Date;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  products: SaleProduct[];
}

export interface SaleProduct {
  id: string;
  saleId: string;
  productId: string;
  salePrice: number;
  stockAllocated: number;
  perUserLimit: number;
}

export interface SaleRow {
  id: string;
  name: string;
  description: string;
  status: SaleStatus;
  start_time: Date;
  end_time: Date;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface SaleProductRow {
  id: string;
  sale_id: string;
  product_id: string;
  sale_price: number;
  stock_allocated: number;
  per_user_limit: number;
}

// ─── Inventory / Reservation ─────────────────────────────────

export interface Reservation {
  id: string;
  saleId: string;
  productId: string;
  userId: string;
  quantity: number;
  reservedAt: Date;
  expiresAt: Date;
  status: 'active' | 'committed' | 'released' | 'expired';
}

export interface ReservationData {
  saleId: string;
  productId: string;
  userId: string;
  quantity: number;
  expiresAt: string;
}

// ─── Queue ───────────────────────────────────────────────────

export type QueueEntryStatus = 'waiting' | 'processing' | 'served' | 'expired' | 'timeout' | 'failed_no_stock';

export interface QueueEntry {
  id: string;
  saleId: string;
  userId: string;
  enqueuedAt: Date;
  position: number;
  estimatedWaitSeconds: number;
  status: QueueEntryStatus;
}

export interface PurchaseRequest {
  userId: string;
  saleId: string;
  quantity: number;
}

export interface QueuePosition {
  position: number;
  queueDepth: number;
  estimatedWaitSeconds: number;
  status: QueueEntryStatus;
}

// ─── Order ───────────────────────────────────────────────────

export type OrderStatus = 'pending' | 'paid' | 'cancelled';

export interface Order {
  id: string;
  userId: string;
  saleId: string;
  productId: string;
  salePrice: number;
  quantity: number;
  status: OrderStatus;
  reservationId?: string;
  queueEntryId?: string;
  idempotencyKey: string;
  paidAt?: Date;
  cancelledAt?: Date;
  cancelReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderRow {
  id: string;
  user_id: string;
  sale_id: string;
  product_id: string;
  sale_price: number;
  quantity: number;
  status: OrderStatus;
  reservation_id?: string;
  queue_entry_id?: string;
  idempotency_key: string;
  paid_at?: Date;
  cancelled_at?: Date;
  cancel_reason?: string;
  created_at: Date;
  updated_at: Date;
}

// ─── Metrics ─────────────────────────────────────────────────

export interface MetricsSnapshot {
  qps: {
    current: number;
    oneMinAvg: number;
    fiveMinAvg: number;
  };
  inventory: Array<{
    saleId: string;
    productId: string;
    remainingStock: number;
    drainRatePerMinute: number;
  }>;
  queues: Array<{
    saleId: string;
    depth: number;
    avgWaitSeconds: number;
  }>;
  orders: {
    creationRatePerMinute: number;
    paymentSuccessRate: number;
  };
  uptime: number;
  latency: {
    p50: number;
    p95: number;
    p99: number;
  };
}

// ─── Express Extension ───────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      correlationId: string;
      user?: JwtPayload;
      rawBody?: string;
    }
  }
}

// ─── Middleware Types ────────────────────────────────────────

export type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void>;

export type MiddlewareFactory<T = void> = (options: T) => AsyncRequestHandler;

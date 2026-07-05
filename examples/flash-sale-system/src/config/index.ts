import dotenv from 'dotenv';
dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    console.error(
      JSON.stringify({
        level: 'fatal',
        message: `Missing required environment variable: ${key}`,
        timestamp: new Date().toISOString(),
      })
    );
    process.exit(1);
  }
  return value;
}

function parseIntEnv(key: string, defaultVal: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return defaultVal;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) {
    console.error(
      JSON.stringify({
        level: 'fatal',
        message: `Invalid integer for env var ${key}: ${raw}`,
        timestamp: new Date().toISOString(),
      })
    );
    process.exit(1);
  }
  return parsed;
}

function parseFloatEnv(key: string, defaultVal: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return defaultVal;
  const parsed = parseFloat(raw);
  if (isNaN(parsed)) {
    console.error(
      JSON.stringify({
        level: 'fatal',
        message: `Invalid float for env var ${key}: ${raw}`,
        timestamp: new Date().toISOString(),
      })
    );
    process.exit(1);
  }
  return parsed;
}

export const config = {
  port: parseIntEnv('PORT', 3000),
  nodeEnv: process.env.NODE_ENV || 'development',

  redis: {
    url: requireEnv('REDIS_URL'),
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'flash-sale:',
    mode: (process.env.REDIS_MODE || 'single') as 'single' | 'sentinel' | 'cluster',
    sentinels: process.env.REDIS_SENTINELS
      ? process.env.REDIS_SENTINELS.split(',').map((s) => {
          const [host, port] = s.trim().split(':');
          return { host, port: parseInt(port, 10) };
        })
      : undefined,
    masterName: process.env.REDIS_MASTER_NAME || 'mymaster',
    maxRetries: parseIntEnv('REDIS_MAX_RETRIES', 5),
    retryDelayMs: parseIntEnv('REDIS_RETRY_DELAY_MS', 100),
  },

  rabbitmq: {
    url: requireEnv('RABBITMQ_URL'),
    exchange: process.env.RABBITMQ_EXCHANGE || 'flash-sale',
    prefetch: parseIntEnv('RABBITMQ_PREFETCH', 50),
    reconnectTimeoutMs: parseIntEnv('RABBITMQ_RECONNECT_MS', 5000),
  },

  postgres: {
    url: requireEnv('DATABASE_URL'),
    maxPool: parseIntEnv('DB_POOL_MAX', 20),
    idleTimeoutMs: parseIntEnv('DB_IDLE_TIMEOUT_MS', 30000),
    connectionTimeoutMs: parseIntEnv('DB_CONNECTION_TIMEOUT_MS', 5000),
  },

  jwt: {
    secret: requireEnv('JWT_SECRET'),
    accessTokenTtl: process.env.JWT_ACCESS_TTL || '15m',
    refreshTokenTtlMs: parseIntEnv('JWT_REFRESH_TTL_MS', 7 * 24 * 60 * 60 * 1000),
  },

  bcrypt: {
    costFactor: parseIntEnv('BCRYPT_COST', 12),
  },

  rateLimit: {
    userMaxTokens: parseIntEnv('RATE_LIMIT_USER_MAX', 30),
    userRefillPerSec: parseIntEnv('RATE_LIMIT_USER_REFILL', 10),
    ipMaxTokens: parseIntEnv('RATE_LIMIT_IP_MAX', 60),
    ipRefillPerSec: parseIntEnv('RATE_LIMIT_IP_REFILL', 20),
    loginMaxTokens: parseIntEnv('RATE_LIMIT_LOGIN_MAX', 5),
    loginRefillPerSec: parseIntEnv('RATE_LIMIT_LOGIN_REFILL', 1),
  },

  order: {
    paymentTimeoutMs: parseIntEnv('ORDER_PAYMENT_TIMEOUT_MS', 15 * 60 * 1000),
    autoCancelIntervalMs: parseIntEnv('ORDER_AUTO_CANCEL_INTERVAL_MS', 60000),
  },

  inventory: {
    reservationTtlSeconds: parseIntEnv('INVENTORY_RESERVATION_TTL_SEC', 300),
    syncIntervalMs: parseIntEnv('INVENTORY_SYNC_INTERVAL_MS', 30000),
  },

  queue: {
    entryTimeoutMs: parseIntEnv('QUEUE_ENTRY_TIMEOUT_MS', 10 * 60 * 1000),
    cleanupIntervalMs: parseIntEnv('QUEUE_CLEANUP_INTERVAL_MS', 30000),
    avgProcessingTimeMs: parseFloatEnv('QUEUE_AVG_PROCESSING_MS', 100),
    workerIntervalMs: parseIntEnv('QUEUE_WORKER_INTERVAL_MS', 200),
  },

  security: {
    hmacSecret: requireEnv('HMAC_SECRET'),
    timestampWindowMs: parseIntEnv('TIMESTAMP_WINDOW_MS', 5 * 60 * 1000),
    nonceTtlSeconds: parseIntEnv('NONCE_TTL_SECONDS', 300),
    idempotencyTtlSeconds: parseIntEnv('IDEMPOTENCY_TTL_SECONDS', 24 * 60 * 60),
    maxBodySize: parseIntEnv('MAX_BODY_SIZE', 1 * 1024 * 1024),
    maxStringLength: parseIntEnv('MAX_STRING_LENGTH', 10000),
  },

  payment: {
    successRate: parseFloatEnv('PAYMENT_SUCCESS_RATE', 0.95),
    latencyMs: parseIntEnv('PAYMENT_LATENCY_MS', 200),
  },

  sale: {
    warmUpAdvanceMs: parseIntEnv('SALE_WARMUP_ADVANCE_MS', 60000),
    warmUpRetryMs: parseIntEnv('SALE_WARMUP_RETRY_MS', 5000),
    autoTransitionIntervalMs: parseIntEnv('SALE_AUTO_TRANSITION_MS', 1000),
  },

  shutdown: {
    drainTimeoutMs: parseIntEnv('SHUTDOWN_DRAIN_TIMEOUT_MS', 30000),
  },
} as const;

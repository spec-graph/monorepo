import { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import { getRedisClient } from '../infra/redis.js';
import { config } from '../config/index.js';
import { AppError } from '../types/index.js';
import { logger } from '../infra/logger.js';

// The Lua script SHA will be loaded at startup
let tokenBucketSha: string | null = null;

const TOKEN_BUCKET_LUA = `
-- Token bucket rate limiter
-- KEYS[1]: bucket key
-- ARGV[1]: capacity (max tokens)
-- ARGV[2]: refill_rate (tokens per second)
-- ARGV[3]: current timestamp in seconds
-- ARGV[4]: tokens requested (default 1)
--
-- Returns: {allowed (1|0), remaining_tokens, retry_after_seconds}

local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local requested = tonumber(ARGV[4] or 1)

-- Get current bucket state
local bucket = redis.call("HMGET", key, "tokens", "last_refill")
local tokens = tonumber(bucket[1]) or capacity
local last_refill = tonumber(bucket[2]) or now

-- Calculate token refill
local elapsed = math.max(0, now - last_refill)
local refill = math.floor(elapsed * refill_rate)
tokens = math.min(capacity, tokens + refill)

-- Check if enough tokens
if tokens >= requested then
  tokens = tokens - requested
  redis.call("HMSET", key, "tokens", tokens, "last_refill", now)

  -- Set TTL: time until bucket would be full from empty
  local ttl = math.ceil(capacity / refill_rate) + 1
  redis.call("EXPIRE", key, ttl)

  return {1, tokens, 0}
else
  -- Set TTL to keep the bucket around
  local ttl = math.ceil(capacity / refill_rate) + 1
  redis.call("EXPIRE", key, ttl)

  -- Calculate time until next token is available
  local retry_after = math.ceil((requested - tokens) / refill_rate)
  return {0, tokens, retry_after}
end
`;

export async function loadTokenBucketScript(): Promise<string> {
  const redis = getRedisClient();
  try {
    // Try to load script
    tokenBucketSha = await (redis as any).script('LOAD', TOKEN_BUCKET_LUA) as string;
    logger.info({ sha: tokenBucketSha }, 'Token bucket Lua script loaded');
    return tokenBucketSha;
  } catch (err) {
    logger.error({ err }, 'Failed to load token bucket Lua script');
    throw err;
  }
}

export interface RateLimitOptions {
  /** Bucket capacity (burst size) */
  capacity: number;
  /** Token refill rate per second */
  refillPerSec: number;
  /** Function to extract the rate limit key from the request */
  keyExtractor: (req: Request) => string;
  /** Optional: skip rate limiting */
  skip?: (req: Request) => boolean;
}

export function createRateLimiter(options: RateLimitOptions) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      // Skip if configured
      if (options.skip && options.skip(req)) {
        return next();
      }

      const redis = getRedisClient();
      const key = `${config.redis.keyPrefix}rate:${options.keyExtractor(req)}`;
      const now = Math.floor(Date.now() / 1000);

      const result: [number, number, number] = await (redis as any).evalsha(
        tokenBucketSha!,
        1,
        key,
        options.capacity,
        options.refillPerSec,
        now,
        1
      );

      const [allowed, remaining, retryAfter] = result;

      // Always set rate limit headers
      _res.setHeader('X-RateLimit-Remaining', String(remaining));

      if (allowed === 1) {
        return next();
      }

      _res.setHeader('Retry-After', String(retryAfter));
      throw new AppError('Rate limit exceeded. Try again later.', 429, 'RATE_LIMITED');
    } catch (err) {
      if (err instanceof AppError) {
        throw err;
      }
      // If Redis is down, allow the request through (fail open)
      logger.warn({ err }, 'Rate limiter error - failing open');
      next();
    }
  };
}

// ─── Pre-configured rate limiters ────────────────────────────

export const generalUserRateLimiter = createRateLimiter({
  capacity: config.rateLimit.userMaxTokens,
  refillPerSec: config.rateLimit.userRefillPerSec,
  keyExtractor: (req: Request) => {
    const userId = req.user?.sub || 'anonymous';
    return `user:${userId}`;
  },
  skip: (req: Request) => req.path === '/health' || req.path === '/metrics',
});

export const ipRateLimiter = createRateLimiter({
  capacity: config.rateLimit.ipMaxTokens,
  refillPerSec: config.rateLimit.ipRefillPerSec,
  keyExtractor: (req: Request) => {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || req.ip
      || req.socket.remoteAddress
      || 'unknown';
    return `ip:${ip}`;
  },
  skip: (req: Request) => req.path === '/health' || req.path === '/metrics',
});

export const loginRateLimiter = createRateLimiter({
  capacity: config.rateLimit.loginMaxTokens,
  refillPerSec: config.rateLimit.loginRefillPerSec,
  keyExtractor: (req: Request) => {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || req.ip
      || req.socket.remoteAddress
      || 'unknown';
    return `login:ip:${ip}`;
  },
});

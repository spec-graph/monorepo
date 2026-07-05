import { Request, Response, NextFunction } from 'express';
import { createHmac, createHash, randomBytes } from 'crypto';
import { getRedisClient } from '../infra/redis.js';
import { config } from '../config/index.js';
import { AppError } from '../types/index.js';
import { logger } from '../infra/logger.js';

// ─── HMAC Signature ──────────────────────────────────────────

export interface SignatureInput {
  method: string;
  path: string;
  timestamp: string;
  nonce: string;
  body: string;
}

export function generateSignature(input: SignatureInput, secret: string): string {
  const bodyHash = input.body ? createHash('sha256').update(input.body).digest('hex') : '';
  const canonical = `${input.method}|${input.path}|${input.timestamp}|${input.nonce}|${bodyHash}`;
  return createHmac('sha256', secret).update(canonical).digest('hex');
}

export function verifySignature(
  signature: string,
  input: SignatureInput,
  secret: string
): boolean {
  const expected = generateSignature(input, secret);

  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual
      ? crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
      : signature === expected;
  } catch {
    return false;
  }
}

// Need crypto for timingSafeEqual
import crypto from 'crypto';

// ─── Nonce Deduplication ─────────────────────────────────────

export async function checkAndStoreNonce(nonce: string): Promise<boolean> {
  const redis = getRedisClient();
  const key = `${config.redis.keyPrefix}nonce:${nonce}`;

  // SET NX with TTL
  const result = await (redis as any).set(
    key,
    '1',
    'EX',
    config.security.nonceTtlSeconds,
    'NX'
  );

  return result === 'OK';
}

// ─── Idempotency Key ─────────────────────────────────────────

export interface CachedResponse {
  statusCode: number;
  body: string;
  bodyHash: string;
}

export async function checkIdempotencyKey(
  key: string,
  bodyHash: string
): Promise<CachedResponse | null> {
  const redis = getRedisClient();
  const redisKey = `${config.redis.keyPrefix}idempotent:${key}`;
  const cached = await redis.get(redisKey);

  if (!cached) return null;

  try {
    const parsed: CachedResponse = JSON.parse(cached);

    if (parsed.bodyHash !== bodyHash) {
      throw new AppError(
        'Idempotency key reused with different request body',
        422,
        'IDEMPOTENCY_MISMATCH'
      );
    }

    return parsed;
  } catch (err) {
    if (err instanceof AppError) throw err;
    return null;
  }
}

export async function storeIdempotencyResult(
  key: string,
  statusCode: number,
  body: string
): Promise<void> {
  const redis = getRedisClient();
  const redisKey = `${config.redis.keyPrefix}idempotent:${key}`;
  const bodyHash = createHash('sha256').update(body).digest('hex');

  const cached: CachedResponse = { statusCode, body, bodyHash };

  await redis.set(
    redisKey,
    JSON.stringify(cached),
    'EX',
    config.security.idempotencyTtlSeconds
  );
}

// ─── HMAC Verification Middleware ────────────────────────────

export function hmacMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const signature = req.headers['x-signature'] as string;
  const timestamp = req.headers['x-timestamp'] as string;
  const nonce = req.headers['x-nonce'] as string;

  // Check required headers
  if (!signature || !timestamp || !nonce) {
    throw new AppError('Missing HMAC headers: X-Signature, X-Timestamp, X-Nonce', 401, 'INVALID_SIGNATURE');
  }

  // Validate timestamp (within window)
  const now = Date.now();
  const requestTime = parseInt(timestamp, 10);

  if (isNaN(requestTime)) {
    throw new AppError('Invalid timestamp format', 401, 'TIMESTAMP_STALE');
  }

  const diff = Math.abs(now - requestTime);
  if (diff > config.security.timestampWindowMs) {
    throw new AppError(
      `Timestamp outside allowed window of ${config.security.timestampWindowMs}ms`,
      401,
      'TIMESTAMP_STALE'
    );
  }

  // Nonce and signature verification happen in the combined middleware
  // Store values on request for the nonce middleware to use
  (req as any).hmacSignature = signature;
  (req as any).hmacTimestamp = timestamp;
  (req as any).hmacNonce = nonce;

  next();
}

// ─── Nonce Middleware ────────────────────────────────────────

export async function nonceMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const nonce = (req as any).hmacNonce || req.headers['x-nonce'] as string;

  if (!nonce) {
    return next(); // Skip if no nonce header
  }

  try {
    const isNew = await checkAndStoreNonce(nonce);
    if (!isNew) {
      throw new AppError('Nonce has already been used', 401, 'NONCE_REPLAYED');
    }
    next();
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.warn({ err }, 'Nonce check failed - failing open');
    next();
  }
}

// ─── Complete HMAC Verification (combined) ───────────────────

export async function hmacVerificationMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const signature = req.headers['x-signature'] as string;
  const timestamp = req.headers['x-timestamp'] as string;
  const nonce = req.headers['x-nonce'] as string;

  if (!signature || !timestamp || !nonce) {
    return next(); // Let individual middleware handle missing headers
  }

  // Verify the signature
  const input: SignatureInput = {
    method: req.method,
    path: req.originalUrl || req.path,
    timestamp,
    nonce,
    body: req.rawBody || (typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {})),
  };

  const isValid = verifySignature(signature, input, config.security.hmacSecret);

  if (!isValid) {
    throw new AppError('HMAC signature verification failed', 401, 'INVALID_SIGNATURE');
  }

  next();
}

// ─── Idempotency Key Middleware ──────────────────────────────

export function createIdempotencyMiddleware() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const idempotencyKey = req.headers['idempotency-key'] as string;

    if (!idempotencyKey) {
      return next(); // Skip if not provided
    }

    const bodyStr = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    const bodyHash = createHash('sha256').update(bodyStr).digest('hex');

    try {
      const cached = await checkIdempotencyKey(idempotencyKey, bodyHash);

      if (cached) {
        // Return cached response
        res.status(cached.statusCode);
        res.setHeader('Content-Type', 'application/json');
        res.send(cached.body);
        return;
      }

      // Store original send to capture response
      const originalSend = res.send.bind(res);
      res.send = function (body: any): Response {
        // Store the result for future idempotent requests
        const responseBody = typeof body === 'string' ? body : JSON.stringify(body);
        storeIdempotencyResult(idempotencyKey, res.statusCode, responseBody).catch((err) => {
          logger.warn({ err }, 'Failed to store idempotency result');
        });

        return originalSend(body);
      } as any;

      next();
    } catch (err) {
      if (err instanceof AppError) throw err;
      logger.warn({ err }, 'Idempotency check failed - failing open');
      next();
    }
  };
}

// ─── Parameter Sanitization Middleware ────────────────────────

export function sanitizationMiddleware(req: Request, _res: Response, next: NextFunction): void {
  // Sanitize query parameters
  if (req.query) {
    for (const key of Object.keys(req.query)) {
      const val = req.query[key];
      if (typeof val === 'string') {
        if (val.length > config.security.maxStringLength) {
          throw new AppError(
            `Query parameter '${key}' exceeds maximum length ${config.security.maxStringLength}`,
            400,
            'VALIDATION_ERROR'
          );
        }
        req.query[key] = val.trim();
      }
    }
  }

  // Sanitize body fields
  if (req.body && typeof req.body === 'object') {
    sanitizeObject(req.body);
  }

  next();
}

function sanitizeObject(obj: Record<string, unknown>): void {
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (typeof val === 'string') {
      if (val.length > config.security.maxStringLength) {
        throw new AppError(
          `Field '${key}' exceeds maximum length ${config.security.maxStringLength}`,
          400,
          'VALIDATION_ERROR'
        );
      }
      obj[key] = val.trim();
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      sanitizeObject(val as Record<string, unknown>);
    }
  }
}

// ─── Security Middleware Factory ─────────────────────────────

export function createSecurityMiddleware() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Step 1: Parameter sanitization
      sanitizationMiddleware(req, res, () => {});

      // Step 2: HMAC verification
      await hmacVerificationMiddleware(req, res, () => {});

      // Step 3: Nonce check
      await nonceMiddleware(req, res, () => {});

      // Step 4: Idempotency check
      const idempotencyMiddleware = createIdempotencyMiddleware();
      let idempotencyHandled = false;
      await idempotencyMiddleware(req, {
        ...res,
        send: res.send.bind(res),
      } as Response, (err?: any) => {
        if (err) throw err;
      });

      next();
    } catch (err) {
      next(err);
    }
  };
}

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { JwtPayload, AppError } from '../types/index.js';
import { logger } from '../infra/logger.js';

/**
 * Verify JWT Bearer token and attach user to request.
 */
export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError('Missing or invalid authorization header', 401, 'UNAUTHORIZED');
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, config.jwt.secret, {
      algorithms: ['HS256'],
    }) as JwtPayload;

    req.user = decoded;
    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      throw new AppError('Token expired', 401, 'UNAUTHORIZED');
    }
    if (err.name === 'JsonWebTokenError') {
      throw new AppError('Invalid token', 401, 'UNAUTHORIZED');
    }
    throw new AppError('Authentication failed', 401, 'UNAUTHORIZED');
  }
}

/**
 * Create a middleware factory that checks user has one of the required roles.
 */
export function requireRole(...roles: JwtPayload['role'][]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    if (!roles.includes(req.user.role)) {
      throw new AppError(
        `Role '${req.user.role}' is not authorized. Required: ${roles.join(', ')}`,
        403,
        'FORBIDDEN'
      );
    }

    next();
  };
}

/**
 * Verify JWT token string (useful for non-middleware contexts).
 */
export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwt.secret, {
    algorithms: ['HS256'],
  }) as JwtPayload;
}

/**
 * Generate access token from payload.
 */
export function generateAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, config.jwt.secret, {
    algorithm: 'HS256',
    expiresIn: config.jwt.accessTokenTtl,
  });
}

/**
 * Generate refresh token from user info.
 */
export function generateRefreshToken(
  userId: string,
  familyId: string
): string {
  return jwt.sign(
    { sub: userId, familyId, type: 'refresh' },
    config.jwt.secret,
    {
      algorithm: 'HS256',
      expiresIn: Math.floor(config.jwt.refreshTokenTtlMs / 1000),
    }
  );
}

/**
 * Verify refresh token and return payload.
 */
export function verifyRefreshToken(token: string): { sub: string; familyId: string } {
  const payload = jwt.verify(token, config.jwt.secret, {
    algorithms: ['HS256'],
  }) as any;

  if (payload.type !== 'refresh') {
    throw new AppError('Invalid token type', 401, 'UNAUTHORIZED');
  }

  return { sub: payload.sub, familyId: payload.familyId };
}

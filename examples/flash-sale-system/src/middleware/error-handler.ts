import { Request, Response, NextFunction } from 'express';
import { AppError, ErrorCode } from '../types/index.js';
import { logger } from '../infra/logger.js';

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR',
  503: 'SERVICE_UNAVAILABLE',
};

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  const correlationId = req.correlationId || 'unknown';

  if (err instanceof AppError) {
    const log = (req as any).log || logger.child({ correlationId });

    if (err.statusCode >= 500) {
      log.error({ err: err.toJSON() }, 'Application error');
    } else {
      log.warn({ code: err.code, message: err.message }, 'Client error');
    }

    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        correlationId,
      },
    });
    return;
  }

  // Handle JSON parse errors
  if (err instanceof SyntaxError && 'body' in err) {
    logger.warn({ correlationId, err }, 'JSON parse error');
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid JSON in request body',
        correlationId,
      },
    });
    return;
  }

  // Handle payload too large
  if (err.name === 'PayloadTooLargeError' || (err as any).type === 'entity.too.large') {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request body too large',
        correlationId,
      },
    });
    return;
  }

  // Unknown error
  logger.error({ err, correlationId }, 'Unhandled error');
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An internal error occurred',
      correlationId,
    },
  });
}

// Wrapper to catch async errors in route handlers
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

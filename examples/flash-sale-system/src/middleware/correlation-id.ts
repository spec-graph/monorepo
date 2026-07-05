import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../infra/logger.js';

export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const correlationId = (req.headers['x-correlation-id'] as string) || uuidv4();

  req.correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);

  // Attach a child logger to the request for downstream use
  (req as any).log = logger.child({ correlationId });

  next();
}

import pino from 'pino';
import { config } from '../config/index.js';

const isProduction = config.nodeEnv === 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      }),
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
  redact: {
    paths: [
      'password',
      'password_hash',
      'passwordHash',
      'secret',
      'token',
      'accessToken',
      'refreshToken',
      'authorization',
      'body.password',
      'headers.authorization',
      'body.token',
    ],
    censor: '[REDACTED]',
  },
});

export function createChildLogger(correlationId: string): pino.Logger {
  return logger.child({ correlationId });
}

import Redis, { Cluster, RedisOptions } from 'ioredis';
import { config } from '../config/index.js';
import { logger } from './logger.js';

let redisClient: Redis | Cluster | null = null;
let isShuttingDown = false;

export function getRedisClient(): Redis | Cluster {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call initRedis() first.');
  }
  return redisClient;
}

export async function initRedis(): Promise<Redis | Cluster> {
  if (redisClient) return redisClient;

  const baseOptions: RedisOptions = {
    keyPrefix: config.redis.keyPrefix,
    maxRetriesPerRequest: config.redis.maxRetries,
    retryStrategy(times: number) {
      if (isShuttingDown) return undefined;
      if (times > config.redis.maxRetries) {
        logger.error({ times }, 'Redis max retries exceeded');
        return undefined;
      }
      const delay = Math.min(times * config.redis.retryDelayMs, 3000);
      logger.warn({ times, delayMs: delay }, 'Redis reconnecting');
      return delay;
    },
    lazyConnect: true,
    enableReadyCheck: true,
  };

  if (config.redis.mode === 'cluster') {
    redisClient = new Cluster(
      [{ host: 'localhost', port: 6379 }],
      {
        redisOptions: baseOptions,
        clusterRetryStrategy(times: number) {
          if (times > config.redis.maxRetries) return undefined;
          return Math.min(times * config.redis.retryDelayMs, 3000);
        },
      }
    );
    logger.info('Initializing Redis Cluster client');
  } else if (config.redis.mode === 'sentinel' && config.redis.sentinels) {
    redisClient = new Redis({
      ...baseOptions,
      sentinels: config.redis.sentinels,
      name: config.redis.masterName,
      sentinelPassword: process.env.REDIS_SENTINEL_PASSWORD,
    });
    logger.info({ sentinels: config.redis.sentinels, master: config.redis.masterName }, 'Initializing Redis Sentinel client');
  } else {
    redisClient = new Redis(config.redis.url, baseOptions);
    logger.info('Initializing Redis standalone client');
  }

  redisClient.on('connect', () => {
    logger.info('Redis connected');
  });

  redisClient.on('error', (err: Error) => {
    logger.error({ err }, 'Redis error');
  });

  redisClient.on('close', () => {
    logger.warn('Redis connection closed');
  });

  await redisClient.connect();
  await redisClient.ping();
  logger.info('Redis ping successful');

  return redisClient;
}

export async function closeRedis(): Promise<void> {
  isShuttingDown = true;
  if (!redisClient) return;

  logger.info('Closing Redis connection');
  try {
    await redisClient.quit();
  } catch {
    redisClient.disconnect();
  }
  redisClient = null;
  logger.info('Redis connection closed');
}

export async function healthCheckRedis(): Promise<{ status: 'up' | 'down'; latencyMs?: number }> {
  if (!redisClient) return { status: 'down' };

  try {
    const start = Date.now();
    await redisClient.ping();
    return { status: 'up', latencyMs: Date.now() - start };
  } catch {
    return { status: 'down' };
  }
}

import amqplib, { Connection, Channel, ConsumeMessage } from 'amqplib';
import { config } from '../config/index.js';
import { logger } from './logger.js';

let connection: Connection | null = null;
let publishChannel: Channel | null = null;
let isShuttingDown = false;

const QUEUES = {
  ORDER_CREATE: 'flash-sale.order.create',
  ORDER_DLQ: 'flash-sale.order.dlq',
} as const;

export { QUEUES };

export interface RabbitMessage<T = unknown> {
  queueEntryId: string;
  saleId: string;
  userId: string;
  productId: string;
  quantity: number;
  timestamp: string;
  payload?: T;
}

export async function initRabbitMQ(): Promise<{ connection: Connection; channel: Channel }> {
  if (connection && publishChannel) {
    return { connection, channel: publishChannel };
  }

  connection = await amqplib.connect(config.rabbitmq.url);

  connection.on('close', () => {
    logger.warn('RabbitMQ connection closed');
    if (!isShuttingDown) {
      scheduleReconnect();
    }
  });

  connection.on('error', (err: Error) => {
    logger.error({ err }, 'RabbitMQ connection error');
  });

  publishChannel = await connection.createConfirmChannel();

  // Assert exchange
  await publishChannel.assertExchange(config.rabbitmq.exchange, 'topic', {
    durable: true,
  });

  // Assert queues
  await publishChannel.assertQueue(QUEUES.ORDER_CREATE, {
    durable: true,
    deadLetterExchange: '',
    deadLetterRoutingKey: QUEUES.ORDER_DLQ,
  });

  await publishChannel.assertQueue(QUEUES.ORDER_DLQ, {
    durable: true,
    messageTtl: 7 * 24 * 60 * 60 * 1000, // 7 days in DLQ
  });

  // Bind queues to exchange
  await publishChannel.bindQueue(QUEUES.ORDER_CREATE, config.rabbitmq.exchange, 'order.create');
  await publishChannel.bindQueue(QUEUES.ORDER_DLQ, config.rabbitmq.exchange, 'order.dlq');

  logger.info('RabbitMQ initialized: exchange and queues asserted');

  return { connection, channel: publishChannel };
}

let reconnectTimer: NodeJS.Timeout | null = null;

function scheduleReconnect(): void {
  if (isShuttingDown) return;
  if (reconnectTimer) clearTimeout(reconnectTimer);

  reconnectTimer = setTimeout(async () => {
    logger.info('Attempting RabbitMQ reconnect');
    try {
      connection = null;
      publishChannel = null;
      await initRabbitMQ();
      logger.info('RabbitMQ reconnected successfully');
    } catch (err) {
      logger.error({ err }, 'RabbitMQ reconnection failed');
      scheduleReconnect();
    }
  }, config.rabbitmq.reconnectTimeoutMs);
}

export async function publishMessage(
  routingKey: string,
  message: RabbitMessage
): Promise<boolean> {
  if (!publishChannel) {
    throw new Error('RabbitMQ publish channel not initialized');
  }

  const buffer = Buffer.from(JSON.stringify(message));

  return new Promise((resolve, reject) => {
    publishChannel!.publish(
      config.rabbitmq.exchange,
      routingKey,
      buffer,
      { persistent: true, contentType: 'application/json' },
      (err) => {
        if (err) {
          logger.error({ err, routingKey }, 'Failed to publish RabbitMQ message');
          reject(err);
        } else {
          resolve(true);
        }
      }
    );
  });
}

export async function consumeMessages(
  queue: string,
  handler: (msg: RabbitMessage, ack: () => void, nack: (requeue?: boolean) => void) => Promise<void>
): Promise<void> {
  if (!connection) {
    throw new Error('RabbitMQ not initialized');
  }

  const channel = await connection.createChannel();
  await channel.prefetch(config.rabbitmq.prefetch);

  await channel.consume(queue, async (msg: ConsumeMessage | null) => {
    if (!msg) return;

    try {
      const content = JSON.parse(msg.content.toString()) as RabbitMessage;

      const ack = () => {
        channel.ack(msg);
      };

      const nack = (requeue: boolean = false) => {
        channel.nack(msg, false, requeue);
      };

      await handler(content, ack, nack);
    } catch (err) {
      logger.error({ err, queue }, 'Error processing RabbitMQ message');
      channel.nack(msg, false, false); // send to DLQ
    }
  });

  logger.info({ queue, prefetch: config.rabbitmq.prefetch }, 'RabbitMQ consumer started');
}

export async function getQueueMessageCount(queue: string): Promise<number> {
  if (!publishChannel) return 0;
  try {
    const result = await publishChannel.checkQueue(queue);
    return result.messageCount;
  } catch {
    return 0;
  }
}

export async function closeRabbitMQ(): Promise<void> {
  isShuttingDown = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);

  if (publishChannel) {
    try { await publishChannel.close(); } catch { /* ignore */ }
    publishChannel = null;
  }

  if (connection) {
    try { await connection.close(); } catch { /* ignore */ }
    connection = null;
  }

  logger.info('RabbitMQ connections closed');
}

export async function healthCheckRabbitMQ(): Promise<{ status: 'up' | 'down'; latencyMs?: number }> {
  if (!connection) return { status: 'down' };
  try {
    const start = Date.now();
    if (!publishChannel) return { status: 'down' };
    await publishChannel.checkExchange(config.rabbitmq.exchange);
    return { status: 'up', latencyMs: Date.now() - start };
  } catch {
    return { status: 'down' };
  }
}

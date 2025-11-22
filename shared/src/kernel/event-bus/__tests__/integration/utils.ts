import amqplib from 'amqplib';

/**
 * Load environment variables for integration tests
 */
export function loadTestEnv(): {
  rabbitmqUrl: string;
} {
  // Load .env.test if dotenv is available
  try {
    require('dotenv').config({ path: '.env.test' });
  } catch (error) {
    // dotenv may not be available or .env.test may not exist
  }

  return {
    rabbitmqUrl: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
  };
}

/**
 * Check if RabbitMQ is available
 */
export async function checkServiceAvailability(
  service: 'rabbitmq',
  config?: { url?: string }
): Promise<boolean> {
  const env = loadTestEnv();
  const url = config?.url || env.rabbitmqUrl;

  try {
    const connection = await amqplib.connect(url);
    await connection.close();
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Cleanup test queues and exchanges
 */
export async function cleanupRabbitMQ(
  queues: string[],
  exchanges: string[] = [],
  url?: string
): Promise<void> {
  const env = loadTestEnv();
  const connectionUrl = url || env.rabbitmqUrl;

  try {
    const connection = await amqplib.connect(connectionUrl);
    const channel = await connection.createChannel();

    // Delete queues
    for (const queue of queues) {
      try {
        await channel.deleteQueue(queue, { ifEmpty: false });
      } catch (error) {
        // Queue may not exist, that's okay
        if (process.env.VERBOSE) {
          console.warn(`Failed to delete queue ${queue}:`, error);
        }
      }
    }

    // Delete exchanges
    for (const exchange of exchanges) {
      try {
        await channel.deleteExchange(exchange, { ifUnused: false });
      } catch (error) {
        // Exchange may not exist, that's okay
        if (process.env.VERBOSE) {
          console.warn(`Failed to delete exchange ${exchange}:`, error);
        }
      }
    }

    await channel.close();
    await connection.close();
  } catch (error) {
    // Silently fail cleanup - RabbitMQ may not be available
    if (process.env.VERBOSE) {
      console.warn('Failed to cleanup RabbitMQ resources:', error);
    }
  }
}

/**
 * Generate a unique test queue name
 */
export function generateTestQueueName(prefix = 'test'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Generate a unique test exchange name
 */
export function generateTestExchangeName(prefix = 'test'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout = 5000,
  interval = 100
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Condition not met within ${timeout}ms`);
}


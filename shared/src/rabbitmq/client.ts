import amqplib from 'amqplib';
import { EventType, MessageEvent } from '../types';

export class RabbitMQClient {
  private connection: any = null;
  private channel: any = null;
  private url: string;

  constructor(url: string = process.env.RABBITMQ_URL || 'amqp://localhost:5672') {
    this.url = url;
  }

  async connect(): Promise<void> {
    try {
      const connection = await amqplib.connect(this.url);
      this.connection = connection;
      this.channel = await connection.createChannel();
      
      console.log('✅ Connected to RabbitMQ');

      // Handle connection errors
      connection.on('error', (err) => {
        console.error('❌ RabbitMQ connection error:', err);
      });

      connection.on('close', () => {
        console.log('⚠️  RabbitMQ connection closed');
      });
    } catch (error) {
      console.error('❌ Failed to connect to RabbitMQ:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
      console.log('✅ Disconnected from RabbitMQ');
    } catch (error) {
      console.error('❌ Error disconnecting from RabbitMQ:', error);
      throw error;
    }
  }

  async assertExchange(exchange: string, type: string = 'topic'): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }
    await this.channel.assertExchange(exchange, type, { durable: true });
  }

  async assertQueue(queue: string): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }
    await this.channel.assertQueue(queue, { durable: true });
  }

  async bindQueue(queue: string, exchange: string, routingKey: string): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }
    await this.channel.bindQueue(queue, exchange, routingKey);
  }

  async publish(
    exchange: string,
    routingKey: string,
    event: MessageEvent
  ): Promise<boolean> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }

    const message = Buffer.from(JSON.stringify(event));
    return this.channel.publish(exchange, routingKey, message, {
      persistent: true,
      contentType: 'application/json',
    });
  }

  async consume(
    queue: string,
    onMessage: (event: MessageEvent) => Promise<void>
  ): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }

    await this.channel.consume(
      queue,
      async (msg: amqplib.ConsumeMessage | null) => {
        if (!msg) return;

        try {
          const event: MessageEvent = JSON.parse(msg.content.toString());
          await onMessage(event);
          this.channel?.ack(msg);
        } catch (error) {
          console.error('❌ Error processing message:', error);
          // Reject and don't requeue if processing fails
          this.channel?.nack(msg, false, false);
        }
      },
      { noAck: false }
    );
  }

  getChannel(): any {
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }
    return this.channel;
  }
}

// Exchange names
export const EXCHANGES = {
  USERS: 'users',
  AUTH: 'auth',
} as const;

// Queue names
export const QUEUES = {
  USER_SERVICE: 'user-service',
  AUTH_SERVICE: 'auth-service',
} as const;

// Routing keys
export const ROUTING_KEYS = {
  USER_CREATED: EventType.USER_CREATED,
  USER_UPDATED: EventType.USER_UPDATED,
  USER_DELETED: EventType.USER_DELETED,
  USER_REGISTERED: EventType.USER_REGISTERED,
  USER_LOGIN: EventType.USER_LOGIN,
} as const;


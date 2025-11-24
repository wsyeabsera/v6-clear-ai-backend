import amqplib, { Options } from 'amqplib';
import { EventType, MessageEvent } from '../types';

export class RabbitMQClient {
  private connection: any = null;
  private channel: any = null;
  private url: string;
  private isConnecting: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = parseInt(process.env.RABBITMQ_MAX_RECONNECT_ATTEMPTS || '5');
  private reconnectDelay: number = parseInt(process.env.RABBITMQ_RECONNECT_DELAY_MS || '5000');
  private connectionOptions: Options.Connect;

  constructor(url: string = process.env.RABBITMQ_URL || 'amqp://localhost:5672') {
    this.url = url;
    this.connectionOptions = {
      heartbeat: parseInt(process.env.RABBITMQ_HEARTBEAT || '60'),
      connectionTimeout: parseInt(process.env.RABBITMQ_CONNECTION_TIMEOUT_MS || '10000'),
    };
  }

  async connect(): Promise<void> {
    if (this.isConnecting) {
      // Wait for existing connection attempt
      while (this.isConnecting) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (this.connection && this.channel) {
        return; // Already connected
      }
    }

    this.isConnecting = true;
    const maxRetries = parseInt(process.env.RABBITMQ_MAX_CONNECT_RETRIES || '3');
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const connection = await amqplib.connect(this.url, this.connectionOptions);
        this.connection = connection;
        this.channel = await connection.createChannel();
        this.reconnectAttempts = 0;
        this.isConnecting = false;
        
        console.log('✅ Connected to RabbitMQ');

        // Handle connection errors
        connection.on('error', (err) => {
          console.error('❌ RabbitMQ connection error:', err);
          // Reset connection state
          this.connection = null;
          this.channel = null;
          this.isConnecting = false;
          // Attempt reconnection
          this.handleReconnect().catch(() => {
            // Reconnection will be retried on next operation
          });
        });

        connection.on('close', () => {
          console.log('⚠️  RabbitMQ connection closed');
          // Reset connection state
          const wasConnected = !!this.connection;
          this.connection = null;
          this.channel = null;
          this.isConnecting = false;
          // Only attempt reconnect if we were actually connected
          if (wasConnected) {
            this.handleReconnect().catch(() => {
              // Reconnection will be retried on next operation
            });
          }
        });

        return;
      } catch (error) {
        lastError = error as Error;
        if (attempt < maxRetries) {
          const delay = attempt * 1000; // Exponential backoff
          console.log(`⚠️  RabbitMQ connection attempt ${attempt}/${maxRetries} failed, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    this.isConnecting = false;
    console.error('❌ Failed to connect to RabbitMQ after retries:', lastError);
    throw lastError || new Error('Failed to connect to RabbitMQ');
  }

  private async handleReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`❌ Max reconnection attempts (${this.maxReconnectAttempts}) reached. RabbitMQ unavailable.`);
      this.connection = null;
      this.channel = null;
      this.isConnecting = false;
      return;
    }

    this.reconnectAttempts++;
    console.log(`🔄 Attempting to reconnect to RabbitMQ (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
    
    // Clean up existing connection
    try {
      if (this.channel) {
        await this.channel.close().catch(() => {});
        this.channel = null;
      }
      if (this.connection) {
        await this.connection.close().catch(() => {});
        this.connection = null;
      }
    } catch (error) {
      // Ignore cleanup errors
    }

    // Wait before reconnecting (exponential backoff)
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);
    await new Promise(resolve => setTimeout(resolve, delay));

    // Attempt to reconnect (but prevent infinite recursion)
    if (this.isConnecting) {
      return; // Already attempting to reconnect
    }

    try {
      await this.connect();
    } catch (error) {
      console.error('❌ Reconnection failed:', error);
      // Will retry on next connection attempt or error
    }
  }

  private async ensureConnected(): Promise<void> {
    // Check if connection is alive
    if (this.connection && this.channel) {
      // Verify connection is still valid by checking if channel is open
      try {
        // Quick check: try to get channel properties (will throw if closed)
        if (this.channel && !this.channel.closed) {
          return; // Connection is valid
        }
      } catch (error) {
        // Channel is closed or invalid
        console.warn('⚠️  RabbitMQ channel appears closed, reconnecting...');
        this.connection = null;
        this.channel = null;
      }
    }

    // Not connected or connection invalid, connect now
    await this.connect();
  }

  async disconnect(): Promise<void> {
    try {
      this.isConnecting = false; // Stop any reconnection attempts
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      console.log('✅ Disconnected from RabbitMQ');
    } catch (error) {
      console.error('❌ Error disconnecting from RabbitMQ:', error);
      // Don't throw - cleanup is best effort
      this.connection = null;
      this.channel = null;
    }
  }

  isConnected(): boolean {
    return this.connection !== null && this.channel !== null;
  }

  async assertExchange(exchange: string, type: string = 'topic'): Promise<void> {
    await this.ensureConnected();
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }
    await this.channel.assertExchange(exchange, type, { durable: true });
  }

  async assertQueue(queue: string): Promise<void> {
    await this.ensureConnected();
    if (!this.channel) {
      throw new Error('Channel not initialized');
    }
    await this.channel.assertQueue(queue, { durable: true });
  }

  async bindQueue(queue: string, exchange: string, routingKey: string): Promise<void> {
    await this.ensureConnected();
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
    try {
      await this.ensureConnected();
      if (!this.channel) {
        throw new Error('Channel not initialized');
      }

      const message = Buffer.from(JSON.stringify(event));
      return this.channel.publish(exchange, routingKey, message, {
        persistent: true,
        contentType: 'application/json',
      });
    } catch (error) {
      console.error('❌ Error publishing message to RabbitMQ:', error);
      // Don't throw - allow graceful degradation
      return false;
    }
  }

  async consume(
    queue: string,
    onMessage: (event: MessageEvent) => Promise<void>
  ): Promise<void> {
    try {
      await this.ensureConnected();
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
    } catch (error) {
      console.error('❌ Error setting up consumer:', error);
      throw error;
    }
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


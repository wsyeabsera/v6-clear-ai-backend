import { RabbitMQClient } from '../../../rabbitmq/client';
import {
  IEventBus,
  EventHandler,
  EventMessage,
  EventOptions,
  SubscribeOptions,
  RabbitMQEventConfig,
} from '../types';
import amqplib from 'amqplib';

interface HandlerRegistry {
  handlers: EventHandler[];
  consumerTag?: string;
  queue?: string;
  eventFilter?: string; // For internal events, filter by event type
}

export class RabbitMQEventBus implements IEventBus {
  private client: RabbitMQClient;
  private config: Required<Pick<RabbitMQEventConfig, 'serviceName' | 'defaultExchange' | 'internalQueuePrefix'>> &
    Pick<RabbitMQEventConfig, 'url' | 'deadLetterExchange'>;
  private internalQueueName: string;
  private handlers: Map<string, HandlerRegistry> = new Map();
  private isConnected: boolean = false;

  constructor(config: RabbitMQEventConfig) {
    if (!config.serviceName) {
      throw new Error('RabbitMQEventBus requires serviceName in config');
    }

    this.config = {
      url: config.url,
      serviceName: config.serviceName,
      defaultExchange: config.defaultExchange || config.serviceName,
      internalQueuePrefix: config.internalQueuePrefix || `${config.serviceName}.internal`,
      deadLetterExchange: config.deadLetterExchange,
    };

    this.internalQueueName = this.config.internalQueuePrefix;
    this.client = new RabbitMQClient(this.config.url);
  }

  /**
   * Initialize connection and set up queues/exchanges
   */
  async connect(): Promise<void> {
    if (this.isConnected && this.client.isConnected()) {
      return;
    }

    try {
      await this.client.connect();

      // Create internal queue
      await this.client.assertQueue(this.internalQueueName);

      // Assert default exchange for external events
      await this.client.assertExchange(this.config.defaultExchange, 'topic');

      this.isConnected = true;
    } catch (error) {
      this.isConnected = false;
      console.error('❌ Failed to connect RabbitMQEventBus:', error);
      throw error;
    }
  }

  /**
   * Disconnect from RabbitMQ
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    // Cancel all consumers
    for (const [event, registry] of this.handlers.entries()) {
      if (registry.consumerTag) {
        try {
          const channel = this.client.getChannel();
          await channel.cancel(registry.consumerTag);
        } catch (error) {
          console.warn(`Failed to cancel consumer for event ${event}:`, error);
        }
      }
    }

    this.handlers.clear();
    await this.client.disconnect();
    this.isConnected = false;
  }

  /**
   * Emit an event (publish to queue or exchange)
   */
  async emit(event: string, data: any, options: EventOptions = {}): Promise<void> {
    if (!this.isConnected || !this.client.isConnected()) {
      try {
        await this.connect();
      } catch (error) {
        console.error(`❌ Failed to connect RabbitMQEventBus for emit:`, error);
        // Allow graceful degradation - event is lost but service continues
        return;
      }
    }

    const scope = options.scope || 'internal';
    const eventMessage = this.constructEventMessage(event, data, options);

    if (scope === 'internal') {
      // Publish to internal queue (use empty exchange, queue name as routing key)
      const channel = this.client.getChannel();
      const buffer = Buffer.from(JSON.stringify(eventMessage));
      await channel.sendToQueue(this.internalQueueName, buffer, {
        persistent: true,
        contentType: 'application/json',
      });
    } else {
      // Publish to external exchange
      const exchange = options.exchange || this.config.defaultExchange;
      const routingKey = options.routingKey || this.deriveRoutingKey(event);
      // Convert EventMessage to format compatible with RabbitMQClient
      // RabbitMQClient.publish expects MessageEvent which has type: EventType
      // We'll use the EventMessage structure but cast appropriately
      // Include all fields from EventMessage (metadata, sessionId, userId)
      const message = {
        type: eventMessage.type as any,
        timestamp: eventMessage.timestamp,
        data: eventMessage.data,
        sessionId: eventMessage.sessionId,
        userId: eventMessage.userId,
        metadata: eventMessage.metadata,
      };
      await this.client.publish(exchange, routingKey, message as any);
    }
  }

  /**
   * Subscribe to an event
   */
  async on(event: string, handler: EventHandler, options: SubscribeOptions = {}): Promise<void> {
    if (!this.isConnected || !this.client.isConnected()) {
      try {
        await this.connect();
      } catch (error) {
        console.error(`❌ Failed to connect RabbitMQEventBus for subscribe:`, error);
        throw error; // Subscription failures should be thrown
      }
    }

    const scope = options.scope || 'internal';
    const eventKey = this.getEventKey(event, options);

    // Get or create handler registry
    let registry = this.handlers.get(eventKey);
    if (!registry) {
      registry = { handlers: [] };
      this.handlers.set(eventKey, registry);
    }

    // Add handler
    registry.handlers.push(handler);

    // If this is the first handler, set up consumer
    if (registry.handlers.length === 1) {
      if (scope === 'internal') {
        // Subscribe to internal queue
        await this.setupInternalConsumer(event, eventKey, registry);
      } else {
        // Subscribe to external exchange
        await this.setupExternalConsumer(event, options, eventKey, registry);
      }
    }
  }

  /**
   * Unsubscribe from an event
   */
  async off(_event: string, handler: EventHandler): Promise<void> {
    // Find the handler in any registry (could be internal or external)
    for (const [eventKey, registry] of this.handlers.entries()) {
      const index = registry.handlers.indexOf(handler);
      if (index !== -1) {
        registry.handlers.splice(index, 1);

        // If no more handlers, cancel consumer and remove registry
        if (registry.handlers.length === 0) {
          if (registry.consumerTag) {
            try {
              const channel = this.client.getChannel();
              await channel.cancel(registry.consumerTag);
            } catch (error) {
              console.warn(`Failed to cancel consumer for event ${eventKey}:`, error);
            }
          }
          this.handlers.delete(eventKey);
        }
        return;
      }
    }
  }

  /**
   * Set up consumer for internal events
   */
  private async setupInternalConsumer(
    event: string,
    eventKey: string,
    registry: HandlerRegistry
  ): Promise<void> {
    registry.queue = this.internalQueueName;
    registry.eventFilter = event;

    const channel = this.client.getChannel();

    // Use channel.consume directly to get consumer tag
    const consumeResult = await channel.consume(
      this.internalQueueName,
      async (msg: amqplib.ConsumeMessage | null) => {
        if (!msg) return;

        try {
          const eventMessage: EventMessage = JSON.parse(msg.content.toString());
          
          // Only process messages with matching event type
          if (eventMessage.type === event) {
            // Check if handlers still exist (might have been removed)
            const currentRegistry = this.handlers.get(eventKey);
            if (currentRegistry && currentRegistry.handlers.length > 0) {
              for (const handler of currentRegistry.handlers) {
                try {
                  await handler(eventMessage);
                } catch (error) {
                  await this.recordHandlerError(eventKey, eventMessage, error);
                }
              }
            }
          }
          
          channel.ack(msg);
        } catch (error) {
          console.error(`Error processing message for ${eventKey}:`, error);
          channel.nack(msg, false, false);
        }
      },
      { noAck: false }
    );

    registry.consumerTag = consumeResult.consumerTag;
  }

  /**
   * Set up consumer for external events
   */
  private async setupExternalConsumer(
    event: string,
    options: SubscribeOptions,
    eventKey: string,
    registry: HandlerRegistry
  ): Promise<void> {
    const exchange = options.exchange || this.config.defaultExchange;
    const routingKey = options.routingKey || this.deriveRoutingKey(event);

    // Create a unique queue for this subscription
    const queueName = options.queue || this.getExternalQueueName(routingKey);
    registry.queue = queueName;

    // Assert exchange (must exist before binding)
    await this.client.assertExchange(exchange, 'topic');

    // Assert queue
    await this.client.assertQueue(queueName);

    // Bind queue to exchange with routing key pattern
    await this.client.bindQueue(queueName, exchange, routingKey);

    const channel = this.client.getChannel();

    // Use channel.consume directly to get consumer tag
    const consumeResult = await channel.consume(
      queueName,
      async (msg: amqplib.ConsumeMessage | null) => {
        if (!msg) return;

        try {
          const eventMessage: EventMessage = JSON.parse(msg.content.toString());
          
          // Check if handlers still exist (might have been removed)
          const currentRegistry = this.handlers.get(eventKey);
          if (currentRegistry && currentRegistry.handlers.length > 0) {
            for (const handler of currentRegistry.handlers) {
              try {
                await handler(eventMessage);
              } catch (error) {
                await this.recordHandlerError(eventKey, eventMessage, error);
              }
            }
          }
          
          channel.ack(msg);
        } catch (error) {
          console.error(`Error processing message for ${eventKey}:`, error);
          channel.nack(msg, false, false);
        }
      },
      { noAck: false }
    );

    registry.consumerTag = consumeResult.consumerTag;
  }

  /**
   * Derive routing key from event name
   */
  private deriveRoutingKey(event: string): string {
    // Event name becomes the routing key
    // e.g., 'ai-service.ask.query.received' -> 'ai-service.ask.query.received'
    return event;
  }

  /**
   * Construct EventMessage with auto-added metadata
   */
  private constructEventMessage(event: string, data: any, options: EventOptions): EventMessage {
    return {
      type: event,
      timestamp: new Date().toISOString(),
      data,
      sessionId: options.sessionId,
      userId: options.userId,
      metadata: options.metadata,
    };
  }

  /**
   * Get external queue name for a routing key
   */
  private getExternalQueueName(routingKey: string): string {
    // Generate a unique queue name based on service and routing key
    const sanitized = routingKey.replace(/[^a-zA-Z0-9.-]/g, '_');
    return `${this.config.serviceName}.external.${sanitized}`;
  }

  /**
   * Get event key for handler registry
   */
  private getEventKey(event: string, options: SubscribeOptions): string {
    const scope = options.scope || 'internal';
    if (scope === 'internal') {
      return `internal:${event}`;
    } else {
      const exchange = options.exchange || this.config.defaultExchange;
      const routingKey = options.routingKey || this.deriveRoutingKey(event);
      return `external:${exchange}:${routingKey}`;
    }
  }

  private async recordHandlerError(eventKey: string, eventMessage: EventMessage, error: unknown): Promise<void> {
    const message = (error as Error)?.message || String(error);
    console.warn(`[RabbitMQEventBus] handler error for ${eventKey}: ${message}`);

    if (!this.config.deadLetterExchange) {
      return;
    }

    try {
      await this.client.publish(this.config.deadLetterExchange, `${eventKey}.deadletter`, {
        type: `${eventKey}.deadletter`,
        timestamp: new Date().toISOString(),
        data: {
          originalEvent: eventMessage,
          error: message,
        },
      } as any);
    } catch (publishError) {
      console.error(
        `[RabbitMQEventBus] failed to publish dead-letter for ${eventKey}:`,
        (publishError as Error)?.message || publishError
      );
    }
  }
}


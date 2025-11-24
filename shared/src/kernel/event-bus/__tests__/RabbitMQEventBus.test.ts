import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RabbitMQEventBus } from '../implementations/RabbitMQEventBus';
import { RabbitMQClient } from '../../../rabbitmq/client';
import { EventMessage } from '../types';
import amqplib from 'amqplib';

// Mock RabbitMQClient
vi.mock('../../../rabbitmq/client');

describe('RabbitMQEventBus', () => {
  let eventBus: RabbitMQEventBus;
  let mockClient: any;
  let mockChannel: any;

  beforeEach(() => {
    // Create mock channel
    mockChannel = {
      assertExchange: vi.fn().mockResolvedValue(undefined),
      assertQueue: vi.fn().mockResolvedValue(undefined),
      bindQueue: vi.fn().mockResolvedValue(undefined),
      publish: vi.fn().mockResolvedValue(true),
      sendToQueue: vi.fn().mockResolvedValue(true),
      consume: vi.fn().mockResolvedValue({ consumerTag: 'test-consumer-tag' }),
      cancel: vi.fn().mockResolvedValue(undefined),
      ack: vi.fn().mockResolvedValue(undefined),
      nack: vi.fn().mockResolvedValue(undefined),
    };

    // Create mock client
    mockClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      assertExchange: vi.fn().mockResolvedValue(undefined),
      assertQueue: vi.fn().mockResolvedValue(undefined),
      bindQueue: vi.fn().mockResolvedValue(undefined),
      publish: vi.fn().mockResolvedValue(true),
      consume: vi.fn().mockResolvedValue(undefined),
      getChannel: vi.fn().mockReturnValue(mockChannel),
    };

    // Mock RabbitMQClient constructor
    (RabbitMQClient as any).mockImplementation(() => mockClient);

    eventBus = new RabbitMQEventBus({
      serviceName: 'test-service',
    });
  });

  afterEach(async () => {
    if (eventBus) {
      try {
        await eventBus.disconnect();
      } catch (error) {
        // Ignore disconnect errors in tests
      }
    }
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create event bus with required config', () => {
      const bus = new RabbitMQEventBus({
        serviceName: 'my-service',
      });
      expect(bus).toBeInstanceOf(RabbitMQEventBus);
    });

    it('should throw error if serviceName is missing', () => {
      expect(() => {
        new RabbitMQEventBus({} as any);
      }).toThrow('RabbitMQEventBus requires serviceName in config');
    });

    it('should use default exchange and queue prefix', () => {
      const bus = new RabbitMQEventBus({
        serviceName: 'my-service',
      });
      expect(bus).toBeInstanceOf(RabbitMQEventBus);
    });

    it('should use custom exchange and queue prefix', () => {
      const bus = new RabbitMQEventBus({
        serviceName: 'my-service',
        defaultExchange: 'custom-exchange',
        internalQueuePrefix: 'custom-queue',
      });
      expect(bus).toBeInstanceOf(RabbitMQEventBus);
    });
  });

  describe('connect', () => {
    it('should connect to RabbitMQ and set up queues/exchanges', async () => {
      await eventBus.connect();

      expect(mockClient.connect).toHaveBeenCalled();
      expect(mockClient.assertQueue).toHaveBeenCalledWith('test-service.internal');
      expect(mockClient.assertExchange).toHaveBeenCalledWith('test-service', 'topic');
    });

    it('should not connect twice if already connected', async () => {
      await eventBus.connect();
      await eventBus.connect();

      expect(mockClient.connect).toHaveBeenCalledTimes(1);
    });
  });

  describe('emit - internal events', () => {
    beforeEach(async () => {
      await eventBus.connect();
    });

    it('should emit internal event to internal queue', async () => {
      const event = 'test.event';
      const data = { message: 'test' };

      await eventBus.emit(event, data, { scope: 'internal' });

      expect(mockChannel.sendToQueue).toHaveBeenCalledWith(
        'test-service.internal',
        expect.any(Buffer),
        {
          persistent: true,
          contentType: 'application/json',
        }
      );

      const sentMessage = JSON.parse(mockChannel.sendToQueue.mock.calls[0][1].toString());
      expect(sentMessage.type).toBe(event);
      expect(sentMessage.data).toEqual(data);
      expect(sentMessage.timestamp).toBeDefined();
    });

    it('should auto-construct event message with timestamp', async () => {
      const event = 'test.event';
      const data = { message: 'test' };

      await eventBus.emit(event, data, { scope: 'internal' });

      const sentMessage = JSON.parse(mockChannel.sendToQueue.mock.calls[0][1].toString());
      expect(sentMessage.timestamp).toBeDefined();
      expect(new Date(sentMessage.timestamp).getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('should include sessionId and userId in event message', async () => {
      const event = 'test.event';
      const data = { message: 'test' };

      await eventBus.emit(event, data, {
        scope: 'internal',
        sessionId: 'session-123',
        userId: 'user-456',
      });

      const sentMessage = JSON.parse(mockChannel.sendToQueue.mock.calls[0][1].toString());
      expect(sentMessage.sessionId).toBe('session-123');
      expect(sentMessage.userId).toBe('user-456');
    });

    it('should include custom metadata in event message', async () => {
      const event = 'test.event';
      const data = { message: 'test' };

      await eventBus.emit(event, data, {
        scope: 'internal',
        metadata: { custom: 'value' },
      });

      const sentMessage = JSON.parse(mockChannel.sendToQueue.mock.calls[0][1].toString());
      expect(sentMessage.metadata).toEqual({ custom: 'value' });
    });

    it('should default to internal scope', async () => {
      const event = 'test.event';
      const data = { message: 'test' };

      await eventBus.emit(event, data);

      expect(mockChannel.sendToQueue).toHaveBeenCalled();
    });
  });

  describe('emit - external events', () => {
    beforeEach(async () => {
      await eventBus.connect();
    });

    it('should emit external event to exchange', async () => {
      const event = 'test.event';
      const data = { message: 'test' };

      await eventBus.emit(event, data, { scope: 'external' });

      expect(mockClient.publish).toHaveBeenCalledWith(
        'test-service',
        'test.event',
        expect.objectContaining({
          type: event,
          data,
        })
      );
    });

    it('should use custom exchange if provided', async () => {
      const event = 'test.event';
      const data = { message: 'test' };

      await eventBus.emit(event, data, {
        scope: 'external',
        exchange: 'custom-exchange',
      });

      expect(mockClient.publish).toHaveBeenCalledWith(
        'custom-exchange',
        expect.any(String),
        expect.any(Object)
      );
    });

    it('should use custom routing key if provided', async () => {
      const event = 'test.event';
      const data = { message: 'test' };

      await eventBus.emit(event, data, {
        scope: 'external',
        routingKey: 'custom.routing.key',
      });

      expect(mockClient.publish).toHaveBeenCalledWith(
        expect.any(String),
        'custom.routing.key',
        expect.any(Object)
      );
    });

    it('should auto-derive routing key from event name', async () => {
      const event = 'ai-service.ask.query.received';
      const data = { message: 'test' };

      await eventBus.emit(event, data, { scope: 'external' });

      expect(mockClient.publish).toHaveBeenCalledWith(
        expect.any(String),
        'ai-service.ask.query.received',
        expect.any(Object)
      );
    });
  });

  describe('on - internal events', () => {
    beforeEach(async () => {
      await eventBus.connect();
    });

    it('should subscribe to internal event', async () => {
      const event = 'test.event';
      const handler = vi.fn();

      await eventBus.on(event, handler, { scope: 'internal' });

      expect(mockChannel.consume).toHaveBeenCalledWith(
        'test-service.internal',
        expect.any(Function),
        { noAck: false }
      );
    });

    it('should call handler when event is received', async () => {
      const event = 'test.event';
      const handler = vi.fn();
      let messageHandler: (msg: amqplib.ConsumeMessage | null) => Promise<void>;

      mockChannel.consume.mockImplementation((queue: string, callback: any) => {
        messageHandler = callback;
        return Promise.resolve({ consumerTag: 'test-tag' });
      });

      await eventBus.on(event, handler, { scope: 'internal' });

      const eventMessage: EventMessage = {
        type: event,
        timestamp: new Date().toISOString(),
        data: { message: 'test' },
      };

      const mockMsg = {
        content: Buffer.from(JSON.stringify(eventMessage)),
      } as amqplib.ConsumeMessage;

      await messageHandler!(mockMsg);

      expect(handler).toHaveBeenCalledWith(eventMessage);
      expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
    });

    it('should filter messages by event type', async () => {
      const event = 'test.event';
      const handler = vi.fn();
      let messageHandler: (msg: amqplib.ConsumeMessage | null) => Promise<void>;

      mockChannel.consume.mockImplementation((queue: string, callback: any) => {
        messageHandler = callback;
        return Promise.resolve({ consumerTag: 'test-tag' });
      });

      await eventBus.on(event, handler, { scope: 'internal' });

      const otherEventMessage: EventMessage = {
        type: 'other.event',
        timestamp: new Date().toISOString(),
        data: { message: 'test' },
      };

      const mockMsg = {
        content: Buffer.from(JSON.stringify(otherEventMessage)),
      } as amqplib.ConsumeMessage;

      await messageHandler!(mockMsg);

      expect(handler).not.toHaveBeenCalled();
    });

    it('should support multiple handlers for same event', async () => {
      const event = 'test.event';
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      let messageHandler: (msg: amqplib.ConsumeMessage | null) => Promise<void>;

      mockChannel.consume.mockImplementation((queue: string, callback: any) => {
        messageHandler = callback;
        return Promise.resolve({ consumerTag: 'test-tag' });
      });

      await eventBus.on(event, handler1, { scope: 'internal' });
      await eventBus.on(event, handler2, { scope: 'internal' });

      const eventMessage: EventMessage = {
        type: event,
        timestamp: new Date().toISOString(),
        data: { message: 'test' },
      };

      const mockMsg = {
        content: Buffer.from(JSON.stringify(eventMessage)),
      } as amqplib.ConsumeMessage;

      await messageHandler!(mockMsg);

      expect(handler1).toHaveBeenCalledWith(eventMessage);
      expect(handler2).toHaveBeenCalledWith(eventMessage);
    });

    it('should default to internal scope', async () => {
      const event = 'test.event';
      const handler = vi.fn();

      await eventBus.on(event, handler);

      expect(mockChannel.consume).toHaveBeenCalled();
    });
  });

  describe('on - external events', () => {
    beforeEach(async () => {
      await eventBus.connect();
    });

    it('should subscribe to external event', async () => {
      const event = 'test.event';
      const handler = vi.fn();

      await eventBus.on(event, handler, { scope: 'external' });

      expect(mockClient.assertQueue).toHaveBeenCalled();
      expect(mockClient.bindQueue).toHaveBeenCalled();
      expect(mockChannel.consume).toHaveBeenCalled();
    });

    it('should create queue and bind to exchange with routing key', async () => {
      const event = 'test.event';
      const handler = vi.fn();

      await eventBus.on(event, handler, { scope: 'external' });

      // Find the external queue call (last one, after internal queue from connect)
      const queueCalls = mockClient.assertQueue.mock.calls;
      const externalQueueCall = queueCalls.find((call: any[]) => 
        call[0].includes('test-service.external')
      );
      expect(externalQueueCall).toBeDefined();
      const queueName = externalQueueCall[0];
      expect(queueName).toContain('test-service.external');

      const bindCall = mockClient.bindQueue.mock.calls[0];
      expect(bindCall[0]).toBe(queueName);
      expect(bindCall[1]).toBe('test-service');
      expect(bindCall[2]).toBe('test.event');
    });

    it('should use custom exchange and routing key', async () => {
      const event = 'test.event';
      const handler = vi.fn();

      await eventBus.on(event, handler, {
        scope: 'external',
        exchange: 'custom-exchange',
        routingKey: 'custom.*',
      });

      const bindCall = mockClient.bindQueue.mock.calls[0];
      expect(bindCall[1]).toBe('custom-exchange');
      expect(bindCall[2]).toBe('custom.*');
    });

    it('should call handler when external event is received', async () => {
      const event = 'test.event';
      const handler = vi.fn();
      let messageHandler: (msg: amqplib.ConsumeMessage | null) => Promise<void>;

      mockChannel.consume.mockImplementation((queue: string, callback: any) => {
        messageHandler = callback;
        return Promise.resolve({ consumerTag: 'test-tag' });
      });

      await eventBus.on(event, handler, { scope: 'external' });

      const eventMessage: EventMessage = {
        type: event,
        timestamp: new Date().toISOString(),
        data: { message: 'test' },
      };

      const mockMsg = {
        content: Buffer.from(JSON.stringify(eventMessage)),
      } as amqplib.ConsumeMessage;

      await messageHandler!(mockMsg);

      expect(handler).toHaveBeenCalledWith(eventMessage);
      expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
    });
  });

  describe('off', () => {
    beforeEach(async () => {
      await eventBus.connect();
    });

    it('should remove handler from subscription', async () => {
      const event = 'test.event';
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      mockChannel.consume.mockResolvedValue({ consumerTag: 'test-tag' });

      await eventBus.on(event, handler1, { scope: 'internal' });
      await eventBus.on(event, handler2, { scope: 'internal' });

      await eventBus.off(event, handler1);

      // Handler2 should still be registered
      expect(mockChannel.cancel).not.toHaveBeenCalled();
    });

    it('should cancel consumer when last handler is removed', async () => {
      const event = 'test.event';
      const handler = vi.fn();

      mockChannel.consume.mockResolvedValue({ consumerTag: 'test-tag' });

      await eventBus.on(event, handler, { scope: 'internal' });

      await eventBus.off(event, handler);

      expect(mockChannel.cancel).toHaveBeenCalledWith('test-tag');
    });

    it('should handle handler not found gracefully', async () => {
      const event = 'test.event';
      const handler = vi.fn();

      await eventBus.off(event, handler);

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle connection errors', async () => {
      mockClient.connect.mockRejectedValue(new Error('Connection failed'));

      await expect(eventBus.connect()).rejects.toThrow('Connection failed');
    });

    it('should handle message processing errors', async () => {
      await eventBus.connect();

      const event = 'test.event';
      const handler = vi.fn().mockRejectedValue(new Error('Handler error'));
      let messageHandler: (msg: amqplib.ConsumeMessage | null) => Promise<void>;

      mockChannel.consume.mockImplementation((queue: string, callback: any) => {
        messageHandler = callback;
        return Promise.resolve({ consumerTag: 'test-tag' });
      });

      await eventBus.on(event, handler, { scope: 'internal' });

      const eventMessage: EventMessage = {
        type: event,
        timestamp: new Date().toISOString(),
        data: { message: 'test' },
      };

      const mockMsg = {
        content: Buffer.from(JSON.stringify(eventMessage)),
      } as amqplib.ConsumeMessage;

      await messageHandler!(mockMsg);

      // Handler errors are logged but message is still acked (not nacked)
      // This is the expected behavior - handler errors don't cause message rejection
      expect(handler).toHaveBeenCalled();
      expect(mockChannel.ack).toHaveBeenCalledWith(mockMsg);
    });

    it('should handle invalid JSON in message', async () => {
      await eventBus.connect();

      const event = 'test.event';
      const handler = vi.fn();
      let messageHandler: (msg: amqplib.ConsumeMessage | null) => Promise<void>;

      mockChannel.consume.mockImplementation((queue: string, callback: any) => {
        messageHandler = callback;
        return Promise.resolve({ consumerTag: 'test-tag' });
      });

      await eventBus.on(event, handler, { scope: 'internal' });

      const mockMsg = {
        content: Buffer.from('invalid json'),
      } as amqplib.ConsumeMessage;

      await messageHandler!(mockMsg);

      expect(mockChannel.nack).toHaveBeenCalledWith(mockMsg, false, false);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should publish dead-letter events when a handler throws and DLX is configured', async () => {
      eventBus = new RabbitMQEventBus({
        serviceName: 'test-service',
        deadLetterExchange: 'test-dead-letter',
      });
      await eventBus.connect();

      const event = 'test.event';
      const handler = vi.fn().mockRejectedValue(new Error('Handler error'));
      let messageHandler: (msg: amqplib.ConsumeMessage | null) => Promise<void>;

      mockChannel.consume.mockImplementation((queue: string, callback: any) => {
        messageHandler = callback;
        return Promise.resolve({ consumerTag: 'test-tag' });
      });

      await eventBus.on(event, handler, { scope: 'internal' });

      const eventMessage: EventMessage = {
        type: event,
        timestamp: new Date().toISOString(),
        data: { message: 'test' },
      };

      const mockMsg = {
        content: Buffer.from(JSON.stringify(eventMessage)),
      } as amqplib.ConsumeMessage;

      await messageHandler!(mockMsg);

      expect(mockClient.publish).toHaveBeenCalledWith(
        'test-dead-letter',
        expect.stringContaining(`internal:${event}.deadletter`),
        expect.objectContaining({
          data: expect.objectContaining({
            error: 'Handler error',
            originalEvent: eventMessage,
          }),
        })
      );
    });
  });

  describe('disconnect', () => {
    it('should disconnect and cancel all consumers', async () => {
      await eventBus.connect();

      const event = 'test.event';
      const handler = vi.fn();

      mockChannel.consume.mockResolvedValue({ consumerTag: 'test-tag' });

      await eventBus.on(event, handler, { scope: 'internal' });

      await eventBus.disconnect();

      expect(mockChannel.cancel).toHaveBeenCalled();
      expect(mockClient.disconnect).toHaveBeenCalled();
    });

    it('should handle disconnect when not connected', async () => {
      await eventBus.disconnect();

      expect(mockClient.disconnect).not.toHaveBeenCalled();
    });
  });
});


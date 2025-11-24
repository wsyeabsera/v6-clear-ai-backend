import { describe, it, expect } from 'vitest';
import * as EventBusExports from '../index';

describe('Event Bus Index Exports', () => {
  it('should export IEventBus interface type', () => {
    // Type test - will fail at compile time if not exported
    const mockBus: EventBusExports.IEventBus = {
      connect: async () => {},
      disconnect: async () => {},
      publish: async () => {},
      subscribe: async () => {},
      emit: () => {},
      on: () => {},
      off: () => {},
    };
    expect(mockBus).toBeDefined();
  });

  it('should export EventBusFactory', () => {
    expect(EventBusExports.EventBusFactory).toBeDefined();
    expect(EventBusExports.EventBusFactory.create).toBeDefined();
    expect(typeof EventBusExports.EventBusFactory.create).toBe('function');
  });

  it('should export RabbitMQEventBus', () => {
    expect(EventBusExports.RabbitMQEventBus).toBeDefined();
    expect(typeof EventBusExports.RabbitMQEventBus).toBe('function');
  });

  it('should export EventBusConfig type', () => {
    // Type test for EventBusConfig
    const config: EventBusExports.EventBusConfig = {
      type: 'rabbitmq',
      config: {
        url: 'amqp://localhost',
        exchange: 'test',
        queue: 'test-queue',
      },
    };
    expect(config).toBeDefined();
  });

  it('should export RabbitMQEventConfig type', () => {
    // Type test for RabbitMQEventConfig
    const config: EventBusExports.RabbitMQEventConfig = {
      url: 'amqp://localhost',
      exchange: 'test',
      queue: 'test-queue',
    };
    expect(config).toBeDefined();
  });

  it('should export EventHandler type', () => {
    // Type test for EventHandler
    const handler: EventBusExports.EventHandler = async (data: any) => {
      expect(data).toBeDefined();
    };
    expect(typeof handler).toBe('function');
  });

  it('should be able to create RabbitMQ instance via factory', () => {
    const eventBus = EventBusExports.EventBusFactory.create(
      EventBusExports.EventBusType.RABBITMQ,
      {
        url: 'amqp://localhost',
        serviceName: 'test-service',
      }
    );
    expect(eventBus).toBeInstanceOf(EventBusExports.RabbitMQEventBus);
  });
});


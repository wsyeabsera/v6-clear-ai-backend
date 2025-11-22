import { describe, it, expect } from 'vitest';
import { EventBusFactory } from '../factory';
import { EventBusType, RabbitMQEventConfig } from '../types';
import { RabbitMQEventBus } from '../implementations/RabbitMQEventBus';

describe('EventBusFactory', () => {
  describe('create', () => {
    it('should create RabbitMQEventBus with valid config', () => {
      const config: RabbitMQEventConfig = {
        serviceName: 'test-service',
      };

      const eventBus = EventBusFactory.create(EventBusType.RABBITMQ, config);

      expect(eventBus).toBeInstanceOf(RabbitMQEventBus);
    });

    it('should create RabbitMQEventBus with custom config', () => {
      const config: RabbitMQEventConfig = {
        serviceName: 'test-service',
        url: 'amqp://custom:5672',
        defaultExchange: 'custom-exchange',
        internalQueuePrefix: 'custom-queue',
      };

      const eventBus = EventBusFactory.create(EventBusType.RABBITMQ, config);

      expect(eventBus).toBeInstanceOf(RabbitMQEventBus);
    });

    it('should throw error if serviceName is missing', () => {
      const config = {} as RabbitMQEventConfig;

      expect(() => {
        EventBusFactory.create(EventBusType.RABBITMQ, config);
      }).toThrow('RabbitMQEventBus requires serviceName in config');
    });

    it('should throw error for invalid event bus type', () => {
      const config: RabbitMQEventConfig = {
        serviceName: 'test-service',
      };

      expect(() => {
        EventBusFactory.create('invalid-type' as EventBusType, config);
      }).toThrow('Invalid event bus type: invalid-type');
    });
  });
});


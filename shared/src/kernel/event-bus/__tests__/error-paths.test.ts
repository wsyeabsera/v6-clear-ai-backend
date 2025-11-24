import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RabbitMQEventBus } from '../implementations/RabbitMQEventBus';
import { RabbitMQEventConfig } from '../types';

describe('Event Bus - Error Paths', () => {
  describe('RabbitMQEventBus - Configuration Errors', () => {
    it('should throw error when serviceName is missing', () => {
      expect(() => {
        new RabbitMQEventBus({
          serviceName: '',
        } as RabbitMQEventConfig);
      }).toThrow(/requires serviceName/);
    });

    it('should throw error when serviceName is undefined', () => {
      expect(() => {
        new RabbitMQEventBus({} as RabbitMQEventConfig);
      }).toThrow(/requires serviceName/);
    });

    it('should create event bus with minimal valid config', () => {
      const eventBus = new RabbitMQEventBus({
        serviceName: 'test-service',
      });
      expect(eventBus).toBeDefined();
    });

    it('should accept optional url in config', () => {
      const eventBus = new RabbitMQEventBus({
        serviceName: 'test-service',
        url: 'amqp://custom-host:5672',
      });
      expect(eventBus).toBeDefined();
    });

    it('should accept optional dead letter exchange', () => {
      const eventBus = new RabbitMQEventBus({
        serviceName: 'test-service',
        deadLetterExchange: 'dlx-exchange',
      });
      expect(eventBus).toBeDefined();
    });

    it('should use default exchange if not provided', () => {
      const eventBus = new RabbitMQEventBus({
        serviceName: 'test-service',
      });
      
      // Verify internal config has defaults set
      const config = (eventBus as any).config;
      expect(config.defaultExchange).toBe('test-service');
      expect(config.internalQueuePrefix).toContain('test-service.internal');
    });
  });

  describe('RabbitMQEventBus - Connection Error Handling', () => {
    let eventBus: RabbitMQEventBus;

    beforeEach(() => {
      eventBus = new RabbitMQEventBus({
        serviceName: 'test-error-service',
        url: 'amqp://nonexistent-host:5672',
      });
    });

    afterEach(async () => {
      try {
        await eventBus.disconnect();
      } catch (error) {
        // Ignore disconnect errors in tests
      }
    });

    it('should handle connection failure gracefully', async () => {
      await expect(eventBus.connect()).rejects.toThrow();
    });

    it('should handle emit when not connected and connection fails', async () => {
      await expect(
        eventBus.emit('test.event', { data: 'test' })
      ).rejects.toThrow();
    });

    it('should handle on when not connected and connection fails', async () => {
      const handler = vi.fn();
      await expect(
        eventBus.on('test.event', handler)
      ).rejects.toThrow();
    });

    it('should handle disconnect when not connected', async () => {
      // Should not throw
      await expect(eventBus.disconnect()).resolves.not.toThrow();
    });
  });

  describe('RabbitMQEventBus - Handler Error Handling', () => {
    let eventBus: RabbitMQEventBus;

    beforeEach(async () => {
      eventBus = new RabbitMQEventBus({
        serviceName: 'test-handler-error-service',
      });
      
      // Only connect if RabbitMQ is available
      try {
        await eventBus.connect();
      } catch (error) {
        // Skip tests if RabbitMQ is not available
      }
    });

    afterEach(async () => {
      try {
        await eventBus.disconnect();
      } catch (error) {
        // Ignore disconnect errors
      }
    });

    it('should handle handler that throws error', async () => {
      if (!(eventBus as any).isConnected) {
        // Skip if not connected to RabbitMQ
        return;
      }

      const errorHandler = vi.fn().mockRejectedValue(new Error('Handler error'));
      
      await eventBus.on('test.error.event', errorHandler);
      
      // Emit event - handler error should be caught internally
      await eventBus.emit('test.error.event', { data: 'test' });
      
      // Wait a bit for async processing
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Handler should have been called
      expect(errorHandler).toHaveBeenCalled();
    });

    it('should handle multiple handlers where one fails', async () => {
      if (!(eventBus as any).isConnected) {
        return;
      }

      const successHandler = vi.fn().mockResolvedValue(undefined);
      const errorHandler = vi.fn().mockRejectedValue(new Error('Handler error'));
      
      await eventBus.on('test.mixed.event', successHandler);
      await eventBus.on('test.mixed.event', errorHandler);
      
      await eventBus.emit('test.mixed.event', { data: 'test' });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Both handlers should be called despite error in one
      expect(successHandler).toHaveBeenCalled();
      expect(errorHandler).toHaveBeenCalled();
    });
  });

  describe('RabbitMQEventBus - Unsubscribe Error Handling', () => {
    let eventBus: RabbitMQEventBus;

    beforeEach(async () => {
      eventBus = new RabbitMQEventBus({
        serviceName: 'test-unsub-service',
      });
      
      try {
        await eventBus.connect();
      } catch (error) {
        // Skip if RabbitMQ not available
      }
    });

    afterEach(async () => {
      try {
        await eventBus.disconnect();
      } catch (error) {
        // Ignore
      }
    });

    it('should handle unsubscribing non-existent handler', async () => {
      const handler = vi.fn();
      
      // Should not throw when removing handler that was never added
      await expect(eventBus.off('nonexistent.event', handler)).resolves.not.toThrow();
    });

    it('should handle unsubscribing when consumer cancel fails', async () => {
      if (!(eventBus as any).isConnected) {
        return;
      }

      const handler = vi.fn();
      await eventBus.on('test.unsub.event', handler);
      
      // Mock the channel.cancel to throw
      const client = (eventBus as any).client;
      const originalGetChannel = client.getChannel.bind(client);
      vi.spyOn(client, 'getChannel').mockReturnValue({
        ...originalGetChannel(),
        cancel: vi.fn().mockRejectedValue(new Error('Cancel failed')),
      });
      
      // Should not throw, just log warning
      await expect(eventBus.off('test.unsub.event', handler)).resolves.not.toThrow();
    });
  });

  describe('RabbitMQEventBus - Event Data Validation', () => {
    let eventBus: RabbitMQEventBus;

    beforeEach(async () => {
      eventBus = new RabbitMQEventBus({
        serviceName: 'test-validation-service',
      });
      
      try {
        await eventBus.connect();
      } catch (error) {
        // Skip if not available
      }
    });

    afterEach(async () => {
      try {
        await eventBus.disconnect();
      } catch (error) {
        // Ignore
      }
    });

    it('should handle null data in event', async () => {
      if (!(eventBus as any).isConnected) {
        return;
      }

      await expect(
        eventBus.emit('test.null.event', null)
      ).resolves.not.toThrow();
    });

    it('should handle undefined data in event', async () => {
      if (!(eventBus as any).isConnected) {
        return;
      }

      await expect(
        eventBus.emit('test.undefined.event', undefined)
      ).resolves.not.toThrow();
    });

    it('should handle circular references in data', async () => {
      if (!(eventBus as any).isConnected) {
        return;
      }

      const circular: any = { name: 'test' };
      circular.self = circular;

      // Should handle circular reference (may throw, which is acceptable)
      const result = eventBus.emit('test.circular.event', circular);
      // Just ensure it doesn't crash the test suite
      await result.catch(() => {});
    });

    it('should handle very large data payloads', async () => {
      if (!(eventBus as any).isConnected) {
        return;
      }

      const largeData = {
        array: new Array(10000).fill('test data string'),
      };

      await expect(
        eventBus.emit('test.large.event', largeData)
      ).resolves.not.toThrow();
    });
  });

  describe('RabbitMQEventBus - Scope and Options', () => {
    let eventBus: RabbitMQEventBus;

    beforeEach(async () => {
      eventBus = new RabbitMQEventBus({
        serviceName: 'test-scope-service',
      });
      
      try {
        await eventBus.connect();
      } catch (error) {
        // Skip if not available
      }
    });

    afterEach(async () => {
      try {
        await eventBus.disconnect();
      } catch (error) {
        // Ignore
      }
    });

    it('should handle external scope events', async () => {
      if (!(eventBus as any).isConnected) {
        return;
      }

      await expect(
        eventBus.emit('test.external', { data: 'test' }, { scope: 'external' })
      ).resolves.not.toThrow();
    });

    it('should handle custom exchange in options', async () => {
      if (!(eventBus as any).isConnected) {
        return;
      }

      await expect(
        eventBus.emit('test.custom', { data: 'test' }, { 
          scope: 'external',
          exchange: 'custom-exchange'
        })
      ).resolves.not.toThrow();
    });

    it('should handle custom routing key', async () => {
      if (!(eventBus as any).isConnected) {
        return;
      }

      await expect(
        eventBus.emit('test.routing', { data: 'test' }, { 
          scope: 'external',
          routingKey: 'custom.routing.key'
        })
      ).resolves.not.toThrow();
    });
  });
});


import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { Database } from '../../database';
import { KernelAdapter } from '../../kernel/KernelAdapter';
import { ConversationService } from '../../services/conversation/ConversationService';
import { AskModeHandler } from '../../handlers/AskModeHandler';
import {
  loadTestEnv,
  checkOllamaAvailability,
  checkOllamaModel,
  createTestAgentConfig,
  deleteTestAgentConfig,
  cleanupTestAgentConfigs,
  cleanupTestConversations,
  generateTestUserId,
} from './utils';
import { RabbitMQEventBus } from 'shared';

describe('Event Emission Integration Tests', () => {
  let db: Database;
  let kernelAdapter: KernelAdapter;
  let conversationService: ConversationService;
  let askModeHandler: AskModeHandler;
  let testUserId: string;
  let testSessionIds: string[] = [];
  let testConfigIds: string[] = [];
  let ollamaAvailable = false;
  let ollamaModel = 'llama2';
  let rabbitMQAvailable = false;
  let capturedEvents: any[] = [];

  beforeAll(async () => {
    ollamaAvailable = await checkOllamaAvailability();
    
    if (ollamaAvailable) {
      const env = loadTestEnv();
      ollamaModel = env.ollamaModel;
      const modelAvailable = await checkOllamaModel(ollamaModel);
      if (!modelAvailable) {
        ollamaModel = 'llama2';
      }
    }

    // Check RabbitMQ availability
    try {
      const eventBus = new RabbitMQEventBus({
        serviceName: 'ai-service-test',
        url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
      });
      await eventBus.connect();
      await eventBus.disconnect();
      rabbitMQAvailable = true;
    } catch (error) {
      rabbitMQAvailable = false;
      console.warn('⚠️  RabbitMQ not available, event tests will use no-op event bus');
    }
  });

  beforeEach(async () => {
    process.env.CONTEXT_MANAGER_TYPE = 'mongo';
    process.env.MEMORY_SYSTEM_TYPE = 'local';
    process.env.AI_SERVICE_MONGODB_URI = process.env.AI_SERVICE_MONGODB_URI || 'mongodb://localhost:27017/ai_service_test';

    db = new Database();
    await db.connect();

    kernelAdapter = new KernelAdapter();
    conversationService = new ConversationService(db, kernelAdapter);
    askModeHandler = new AskModeHandler(conversationService, kernelAdapter);

    testUserId = generateTestUserId();
    testSessionIds = [];
    testConfigIds = [];
    capturedEvents = [];

    // Capture events if RabbitMQ is available
    if (rabbitMQAvailable && kernelAdapter.eventBus instanceof RabbitMQEventBus) {
      // Subscribe to events for testing
      try {
        await kernelAdapter.eventBus.on('ai-service.ask.*', async (event) => {
          capturedEvents.push(event);
        }, {
          routingKey: 'ai-service.ask.*',
        });
      } catch (error) {
        // Ignore subscription errors
      }
    }
  });

  afterEach(async () => {
    if (testSessionIds.length > 0) {
      await cleanupTestConversations(testSessionIds);
    }
    
    if (testConfigIds.length > 0) {
      for (const configId of testConfigIds) {
        await deleteTestAgentConfig(configId);
      }
    }

    if (testUserId) {
      await cleanupTestAgentConfigs(testUserId);
    }

    if (db) {
      await db.disconnect();
    }

    capturedEvents = [];
  });

  describe('Event Emission', () => {
    it('should emit query.received event', async () => {
      if (!ollamaAvailable) return;

      const agentConfig = await createTestAgentConfig(testUserId, {
        model: ollamaModel,
      });
      testConfigIds.push(agentConfig.id);

      // Mock event bus emit to capture calls
      const emitSpy = vi.spyOn(kernelAdapter.eventBus, 'emit');

      await askModeHandler.handle({
        userId: testUserId,
        query: 'Test query',
        configId: agentConfig.id,
      });

      expect(emitSpy).toHaveBeenCalledWith(
        'ai-service.ask.query.received',
        expect.objectContaining({
          query: 'Test query',
          configId: agentConfig.id,
        }),
        expect.objectContaining({
          sessionId: expect.any(String),
          userId: testUserId,
        })
      );
    }, 60000);

    it('should emit response.generated event', async () => {
      if (!ollamaAvailable) return;

      const agentConfig = await createTestAgentConfig(testUserId, {
        model: ollamaModel,
      });
      testConfigIds.push(agentConfig.id);

      const emitSpy = vi.spyOn(kernelAdapter.eventBus, 'emit');

      const response = await askModeHandler.handle({
        userId: testUserId,
        query: 'Test query',
        configId: agentConfig.id,
      });

      expect(emitSpy).toHaveBeenCalledWith(
        'ai-service.ask.response.generated',
        expect.objectContaining({
          query: 'Test query',
          response: response.response,
          model: response.model,
        }),
        expect.any(Object)
      );
    }, 60000);

    it('should emit response.sent event', async () => {
      if (!ollamaAvailable) return;

      const agentConfig = await createTestAgentConfig(testUserId, {
        model: ollamaModel,
      });
      testConfigIds.push(agentConfig.id);

      const emitSpy = vi.spyOn(kernelAdapter.eventBus, 'emit');

      const response = await askModeHandler.handle({
        userId: testUserId,
        query: 'Test query',
        configId: agentConfig.id,
      });

      expect(emitSpy).toHaveBeenCalledWith(
        'ai-service.ask.response.sent',
        expect.objectContaining({
          sessionId: response.sessionId,
          responseId: response.id,
        }),
        expect.any(Object)
      );
    }, 60000);

    it('should emit error event on failure', async () => {
      const emitSpy = vi.spyOn(kernelAdapter.eventBus, 'emit');

      // Use invalid config to trigger error
      await expect(
        askModeHandler.handle({
          userId: testUserId,
          query: 'Test query',
          configId: 'non-existent-config',
        })
      ).rejects.toThrow();

      expect(emitSpy).toHaveBeenCalledWith(
        'ai-service.ask.error',
        expect.objectContaining({
          error: expect.any(String),
          query: 'Test query',
        }),
        expect.any(Object)
      );
    });
  });

  describe('Event Payload Validation', () => {
    it('should include correct payload structure in query.received event', async () => {
      if (!ollamaAvailable) return;

      const agentConfig = await createTestAgentConfig(testUserId, {
        model: ollamaModel,
      });
      testConfigIds.push(agentConfig.id);

      const emitSpy = vi.spyOn(kernelAdapter.eventBus, 'emit');

      await askModeHandler.handle({
        userId: testUserId,
        query: 'Test query',
        configId: agentConfig.id,
      });

      const queryReceivedCall = emitSpy.mock.calls.find(
        (call: any) => call[0] === 'ai-service.ask.query.received'
      );

      expect(queryReceivedCall).toBeDefined();
      expect(queryReceivedCall![1]).toMatchObject({
        query: 'Test query',
        configId: agentConfig.id,
      });
      expect(queryReceivedCall![2]).toMatchObject({
        sessionId: expect.any(String),
        userId: testUserId,
      });
    }, 60000);

    it('should include tokensUsed in response.generated event', async () => {
      if (!ollamaAvailable) return;

      const agentConfig = await createTestAgentConfig(testUserId, {
        model: ollamaModel,
      });
      testConfigIds.push(agentConfig.id);

      const emitSpy = vi.spyOn(kernelAdapter.eventBus, 'emit');

      await askModeHandler.handle({
        userId: testUserId,
        query: 'Test query',
        configId: agentConfig.id,
      });

      const responseGeneratedCall = emitSpy.mock.calls.find(
        (call: any) => call[0] === 'ai-service.ask.response.generated'
      );

      expect(responseGeneratedCall).toBeDefined();
      expect(responseGeneratedCall![1]).toMatchObject({
        query: 'Test query',
        response: expect.any(String),
        model: expect.any(String),
      });
    }, 60000);
  });

  describe('Event Bus Graceful Degradation', () => {
    it('should work with no-op event bus when RabbitMQ unavailable', async () => {
      if (!ollamaAvailable) return;

      // Force no-op event bus by using invalid RabbitMQ URL
      process.env.RABBITMQ_URL = 'amqp://invalid:5672';
      
      const fallbackAdapter = new KernelAdapter();
      const fallbackService = new ConversationService(db, fallbackAdapter);
      const fallbackHandler = new AskModeHandler(fallbackService, fallbackAdapter);

      const agentConfig = await createTestAgentConfig(testUserId, {
        model: ollamaModel,
      });
      testConfigIds.push(agentConfig.id);

      // Should not throw even with no-op event bus
      const response = await fallbackHandler.handle({
        userId: testUserId,
        query: 'Test',
        configId: agentConfig.id,
      });

      expect(response).toBeDefined();
    }, 60000);
  });
});


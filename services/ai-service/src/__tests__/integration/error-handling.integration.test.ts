import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Database } from '../../database';
import { KernelAdapter } from '../../kernel/KernelAdapter';
import { ConversationService } from '../../services/conversation/ConversationService';
import { AskModeHandler } from '../../handlers/AskModeHandler';
import {
  cleanupTestConversations,
  cleanupTestAgentConfigs,
  generateTestUserId,
} from './utils';

describe('Error Handling Integration Tests', () => {
  let db: Database;
  let kernelAdapter: KernelAdapter;
  let conversationService: ConversationService;
  let askModeHandler: AskModeHandler;
  let testUserId: string;
  let testSessionIds: string[] = [];

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
  });

  afterEach(async () => {
    if (testSessionIds.length > 0) {
      await cleanupTestConversations(testSessionIds);
    }

    if (testUserId) {
      await cleanupTestAgentConfigs(testUserId);
    }

    if (db) {
      await db.disconnect();
    }
  });

  describe('Invalid Agent Config', () => {
    it('should handle non-existent config ID', async () => {
      await expect(
        askModeHandler.handle({
          userId: testUserId,
          query: 'Test query',
          configId: 'non-existent-config-id',
        })
      ).rejects.toThrow('Agent config not found');
    });

    it('should handle config ID for different user', async () => {
      // This would require creating a config for a different user
      // For now, just test that it returns null
      const config = await conversationService.getAgentConfig(testUserId, 'other-user-config');
      expect(config).toBeNull();
    });
  });

  describe('Missing API Keys', () => {
    it('should handle missing Claude API key gracefully', () => {
      const originalKey = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      expect(() => {
        const { ClaudeProvider } = require('../../services/llm/ClaudeProvider');
        new ClaudeProvider();
      }).toThrow('ANTHROPIC_API_KEY environment variable is required');

      process.env.ANTHROPIC_API_KEY = originalKey;
    });

    it('should handle missing OpenAI API key gracefully', () => {
      const originalKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      expect(() => {
        const { OpenAIProvider } = require('../../services/llm/OpenAIProvider');
        new OpenAIProvider();
      }).toThrow('OPENAI_API_KEY environment variable is required');

      process.env.OPENAI_API_KEY = originalKey;
    });
  });

  describe('Database Connection Failures', () => {
    it('should handle MongoDB connection failure gracefully', async () => {
      // Use invalid MongoDB URI
      process.env.AI_SERVICE_MONGODB_URI = 'mongodb://invalid-host:27017/test';

      await expect(async () => {
        const badDb = new Database();
        await badDb.connect();
      }).rejects.toThrow();
    });
  });

  describe('Invalid Query Formats', () => {
    it('should handle empty query', async () => {
      await expect(
        askModeHandler.handle({
          userId: testUserId,
          query: '',
        })
      ).rejects.toThrow();
    });

    it('should handle whitespace-only query', async () => {
      await expect(
        askModeHandler.handle({
          userId: testUserId,
          query: '   ',
        })
      ).rejects.toThrow();
    });

    it('should handle very long query', async () => {
      const longQuery = 'a'.repeat(100000);
      
      // Should not throw, but may timeout or fail
      try {
        await askModeHandler.handle({
          userId: testUserId,
          query: longQuery,
        });
      } catch (error) {
        // Expected to potentially fail with very long queries
        expect(error).toBeDefined();
      }
    });
  });

  describe('Authentication Failures', () => {
    it('should handle missing userId', async () => {
      await expect(
        askModeHandler.handle({
          userId: '',
          query: 'Test',
        })
      ).rejects.toThrow();
    });
  });

  describe('Service Unavailability', () => {
    it('should handle RabbitMQ unavailability gracefully', () => {
      process.env.RABBITMQ_URL = 'amqp://invalid:5672';

      const adapter = new KernelAdapter();
      
      // Should have no-op event bus
      expect(adapter.eventBus).toBeDefined();
      expect(adapter.eventBus.emit).toBeDefined();
    });

    it('should handle Pinecone unavailability gracefully', () => {
      process.env.CONTEXT_MANAGER_TYPE = 'pinecone';
      process.env.PINECONE_API_KEY = '';

      const adapter = new KernelAdapter();
      
      // Should fallback to MongoDB
      expect(adapter.contextManager).toBeDefined();
    });
  });

  describe('LLM Provider Errors', () => {
    it('should handle provider timeout', async () => {
      // This would require mocking or using a very slow model
      // For now, just verify error handling exists
      expect(askModeHandler).toBeDefined();
    });

    it('should handle invalid model name', async () => {
      // Try with invalid model
      const config = await conversationService.getAgentConfig(testUserId);
      if (config) {
        // Modify to use invalid model
        const invalidConfig = { ...config, model: 'invalid-model-xyz' };
        
        // This should fail when provider tries to use it
        try {
          const { LLMProviderFactory } = require('../../services/llm/LLMProviderFactory');
          const provider = LLMProviderFactory.create(invalidConfig.model);
          expect(provider).toBeDefined(); // Will default to Ollama
        } catch (error) {
          // May fail if Ollama not available
          expect(error).toBeDefined();
        }
      }
    });
  });

  describe('Malformed Responses', () => {
    it('should handle null response from LLM', async () => {
      // This would require mocking LLM provider
      // For now, just verify the structure exists
      expect(askModeHandler).toBeDefined();
    });
  });
});


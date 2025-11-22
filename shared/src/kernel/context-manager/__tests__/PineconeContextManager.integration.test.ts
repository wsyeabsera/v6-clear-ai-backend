import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { PineconeContextManager } from '../implementations/PineconeContextManager';
import { PineconeConfig } from '../types';
import {
  generateSessionId,
  createTestMessage,
  createTestContext,
  createTestMessages,
  cleanupPinecone,
  loadTestEnv,
  checkServiceAvailability,
} from './integration/utils';

describe('PineconeContextManager Integration Tests', () => {
  let manager: PineconeContextManager;
  let config: PineconeConfig;
  let testSessionIds: string[] = [];
  let pineconeAvailable = false;
  let ollamaAvailable = false;

  beforeAll(async () => {
    const env = loadTestEnv();
    pineconeAvailable = await checkServiceAvailability('pinecone', {
      apiKey: env.pineconeApiKey,
    });
    ollamaAvailable = await checkServiceAvailability('ollama');

    if (!pineconeAvailable) {
      console.warn('Pinecone not available, skipping integration tests');
    }
    if (!ollamaAvailable) {
      console.warn('Ollama not available, embedding generation will be disabled');
    }
  });

  beforeEach(async () => {
    if (!pineconeAvailable) return;

    const env = loadTestEnv();
    config = {
      apiKey: env.pineconeApiKey,
      indexName: env.pineconeIndexName,
      useEmbeddings: ollamaAvailable, // Enable embeddings if Ollama is available
      embeddingConfig: ollamaAvailable
        ? {
            apiUrl: env.ollamaApiUrl,
            model: env.ollamaModel,
          }
        : undefined,
    };

    manager = new PineconeContextManager(config);
    testSessionIds = [];
  });

  afterEach(async () => {
    if (!pineconeAvailable) return;

    // Clean up all test vectors
    if (testSessionIds.length > 0) {
      await cleanupPinecone(manager, testSessionIds, config);
    }
    testSessionIds = [];
  });

  describe('Basic CRUD Operations', () => {
    it('should save context to Pinecone and retrieve it', async () => {
      if (!pineconeAvailable) return;

      const sessionId = generateSessionId();
      testSessionIds.push(sessionId);

      const context = createTestContext(sessionId, [
        createTestMessage('Hello', 'user'),
        createTestMessage('Hi there!', 'assistant'),
      ]);

      await manager.saveContext(sessionId, context);
      const retrieved = await manager.getContext(sessionId);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.sessionId).toBe(sessionId);
      expect(retrieved?.messages).toHaveLength(2);
      expect(retrieved?.messages[0].content).toBe('Hello');
      expect(retrieved?.messages[1].content).toBe('Hi there!');
    });

    it('should add message to existing context', async () => {
      if (!pineconeAvailable) return;

      const sessionId = generateSessionId();
      testSessionIds.push(sessionId);

      const initialContext = createTestContext(sessionId, [
        createTestMessage('First message', 'user'),
      ]);

      await manager.saveContext(sessionId, initialContext);

      const newMessage = createTestMessage('Second message', 'assistant');
      await manager.addMessage(sessionId, newMessage);

      const retrieved = await manager.getContext(sessionId);
      expect(retrieved?.messages).toHaveLength(2);
      expect(retrieved?.messages[1].content).toBe('Second message');
    });

    it('should overwrite existing context when saving again', async () => {
      if (!pineconeAvailable) return;

      const sessionId = generateSessionId();
      testSessionIds.push(sessionId);

      const context1 = createTestContext(sessionId, [
        createTestMessage('First', 'user'),
      ]);

      await manager.saveContext(sessionId, context1);

      const context2 = createTestContext(sessionId, [
        createTestMessage('Second', 'user'),
        createTestMessage('Third', 'assistant'),
      ]);

      await manager.saveContext(sessionId, context2);

      const retrieved = await manager.getContext(sessionId);
      expect(retrieved?.messages).toHaveLength(2);
      expect(retrieved?.messages[0].content).toBe('Second');
    });

    it('should return null for non-existent session', async () => {
      if (!pineconeAvailable) return;

      const sessionId = generateSessionId();
      const retrieved = await manager.getContext(sessionId);
      expect(retrieved).toBeNull();
    });
  });

  describe('Vector Operations with Embeddings', () => {
    it('should generate embeddings when Ollama is available', async () => {
      if (!pineconeAvailable || !ollamaAvailable) return;

      const sessionId = generateSessionId();
      testSessionIds.push(sessionId);

      const context = createTestContext(sessionId, [
        createTestMessage('Hello world', 'user'),
        createTestMessage('Hi there!', 'assistant'),
      ]);

      await manager.saveContext(sessionId, context);

      // Verify vector was saved (embedding should be generated)
      const retrieved = await manager.getContext(sessionId);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.messages).toHaveLength(2);
    }, 30000); // Longer timeout for embedding generation

    it('should use empty vector when embeddings are disabled', async () => {
      if (!pineconeAvailable) return;

      const env = loadTestEnv();
      const managerWithoutEmbeddings = new PineconeContextManager({
        apiKey: env.pineconeApiKey,
        indexName: env.pineconeIndexName,
        useEmbeddings: false,
      });

      const sessionId = generateSessionId();
      testSessionIds.push(sessionId);

      const context = createTestContext(sessionId, [
        createTestMessage('Test message', 'user'),
      ]);

      await managerWithoutEmbeddings.saveContext(sessionId, context);
      const retrieved = await managerWithoutEmbeddings.getContext(sessionId);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.messages).toHaveLength(1);
    });

    it('should handle embedding generation failures gracefully', async () => {
      if (!pineconeAvailable) return;

      // Create manager with invalid Ollama URL to test fallback
      const env = loadTestEnv();
      const managerWithInvalidOllama = new PineconeContextManager({
        apiKey: env.pineconeApiKey,
        indexName: env.pineconeIndexName,
        useEmbeddings: true,
        embeddingConfig: {
          apiUrl: 'http://invalid-ollama-url:11434',
          model: env.ollamaModel,
        },
      });

      const sessionId = generateSessionId();
      testSessionIds.push(sessionId);

      const context = createTestContext(sessionId, [
        createTestMessage('Test message', 'user'),
      ]);

      // Should fall back to empty vector if embedding fails
      await managerWithInvalidOllama.saveContext(sessionId, context);
      const retrieved = await managerWithInvalidOllama.getContext(sessionId);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.messages).toHaveLength(1);
    }, 30000);
  });

  describe('Multi-Session Operations', () => {
    it('should handle multiple sessions in parallel', async () => {
      if (!pineconeAvailable) return;

      const sessionIds = Array.from({ length: 5 }, () => generateSessionId());
      testSessionIds.push(...sessionIds);

      // Create contexts for all sessions
      const contexts = sessionIds.map((sessionId, index) =>
        createTestContext(sessionId, [
          createTestMessage(`Message for session ${index}`, 'user'),
        ])
      );

      // Save all contexts in parallel
      await Promise.all(
        contexts.map((context) => manager.saveContext(context.sessionId, context))
      );

      // Retrieve all contexts in parallel
      const retrieved = await Promise.all(
        sessionIds.map((id) => manager.getContext(id))
      );

      // Verify all contexts were saved and retrieved correctly
      retrieved.forEach((context, index) => {
        expect(context).not.toBeNull();
        expect(context?.sessionId).toBe(sessionIds[index]);
        expect(context?.messages[0].content).toContain(`session ${index}`);
      });
    }, 60000); // Longer timeout for parallel operations with embeddings

    it('should maintain session isolation', async () => {
      if (!pineconeAvailable) return;

      const sessionId1 = generateSessionId();
      const sessionId2 = generateSessionId();
      testSessionIds.push(sessionId1, sessionId2);

      const context1 = createTestContext(sessionId1, [
        createTestMessage('Session 1 message', 'user'),
      ]);

      const context2 = createTestContext(sessionId2, [
        createTestMessage('Session 2 message', 'user'),
      ]);

      await manager.saveContext(sessionId1, context1);
      await manager.saveContext(sessionId2, context2);

      const retrieved1 = await manager.getContext(sessionId1);
      const retrieved2 = await manager.getContext(sessionId2);

      expect(retrieved1?.messages[0].content).toBe('Session 1 message');
      expect(retrieved2?.messages[0].content).toBe('Session 2 message');
      expect(retrieved1?.sessionId).not.toBe(retrieved2?.sessionId);
    });

    it('should handle multiple messages across sessions', async () => {
      if (!pineconeAvailable) return;

      const sessionIds = Array.from({ length: 3 }, () => generateSessionId());
      testSessionIds.push(...sessionIds);

      // Add multiple messages to each session
      for (const sessionId of sessionIds) {
        for (let i = 0; i < 3; i++) {
          await manager.addMessage(
            sessionId,
            createTestMessage(`Message ${i + 1}`, i % 2 === 0 ? 'user' : 'assistant')
          );
        }
      }

      // Verify all sessions have correct message counts
      for (const sessionId of sessionIds) {
        const context = await manager.getContext(sessionId);
        expect(context?.messages).toHaveLength(3);
      }
    }, 60000);
  });

  describe('Conversation Flow', () => {
    it('should maintain full conversation history', async () => {
      if (!pineconeAvailable) return;

      const sessionId = generateSessionId();
      testSessionIds.push(sessionId);

      const messages = createTestMessages(10);

      for (const message of messages) {
        await manager.addMessage(sessionId, message);
      }

      const context = await manager.getContext(sessionId);
      expect(context?.messages).toHaveLength(10);
      expect(context?.messages[0].content).toBe('Test message 1');
      expect(context?.messages[9].content).toBe('Test message 10');
    }, 60000); // Longer timeout for multiple embedding generations

    it('should preserve metadata across operations', async () => {
      if (!pineconeAvailable) return;

      const sessionId = generateSessionId();
      testSessionIds.push(sessionId);

      const context = createTestContext(
        sessionId,
        [createTestMessage('Test', 'user')],
        {
          customField: 'custom-value',
          userId: 'user-123',
        }
      );

      await manager.saveContext(sessionId, context);

      await manager.addMessage(sessionId, createTestMessage('Another message', 'assistant'));

      const retrieved = await manager.getContext(sessionId);
      expect(retrieved?.metadata?.customField).toBe('custom-value');
      expect(retrieved?.metadata?.userId).toBe('user-123');
      expect(retrieved?.metadata?.updatedAt).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid API key gracefully', async () => {
      // Pinecone requires environment, so provide a dummy one to pass validation
      // The actual API call will fail with invalid API key
      const invalidManager = new PineconeContextManager({
        apiKey: 'invalid-api-key',
        indexName: 'context-manager',
        environment: 'us-east-1', // Dummy environment to pass validation
      });

      const sessionId = generateSessionId();

      // This should fail when trying to access Pinecone API
      await expect(invalidManager.getContext(sessionId)).rejects.toThrow();
    });

    it('should handle invalid index name gracefully', async () => {
      const env = loadTestEnv();
      if (!env.pineconeApiKey) {
        // Skip if no API key provided
        return;
      }

      // Use a dummy environment if not provided
      const invalidManager = new PineconeContextManager({
        apiKey: env.pineconeApiKey,
        indexName: 'non-existent-index-12345',
        environment: 'us-east-1', // Provide environment
      });

      const sessionId = generateSessionId();

      // This should fail when trying to access non-existent index
      await expect(invalidManager.getContext(sessionId)).rejects.toThrow();
    });
  });

  describe('Cleanup', () => {
    it('should clean up test vectors after test completion', async () => {
      if (!pineconeAvailable) return;

      const sessionId = generateSessionId();
      testSessionIds.push(sessionId);

      const context = createTestContext(sessionId, [
        createTestMessage('Cleanup test', 'user'),
      ]);

      await manager.saveContext(sessionId, context);

      // Verify context exists
      const retrieved = await manager.getContext(sessionId);
      expect(retrieved).not.toBeNull();

      // Cleanup will be done in afterEach
    });
  });
});


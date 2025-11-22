import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { PineconeMemorySystem } from '../implementations/PineconeMemorySystem';
import { PineconeMemoryConfig } from '../types';
import {
  generateSessionId,
  generateUserId,
  createTestMessage,
  cleanupPineconeMemory,
  loadTestEnv,
  checkServiceAvailability,
} from './integration/utils';

describe('PineconeMemorySystem Integration Tests', () => {
  let memorySystem: PineconeMemorySystem;
  let config: PineconeMemoryConfig;
  let testMemoryIds: string[] = [];
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

    memorySystem = new PineconeMemorySystem(config);
    testMemoryIds = [];
  });

  afterEach(async () => {
    if (!pineconeAvailable) return;

    // Clean up all test vectors
    if (testMemoryIds.length > 0) {
      await cleanupPineconeMemory(memorySystem, testMemoryIds, config);
    }
    testMemoryIds = [];
  });

  describe('Basic Memory Storage', () => {
    it('should store short-term memory in Pinecone', async () => {
      if (!pineconeAvailable) return;

      const sessionId = generateSessionId();
      await memorySystem.storeShortTerm(sessionId, 'Test short-term memory');

      // Verify by searching
      const results = await memorySystem.searchSimilar('Test short-term memory', 1);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].content).toContain('Test short-term memory');
      expect(results[0].metadata?.sessionId).toBe(sessionId);
      expect(results[0].metadata?.type).toBe('short-term');

      // Track for cleanup
      if (results[0].id) {
        testMemoryIds.push(results[0].id);
      }
    });

    it('should store long-term memory in Pinecone', async () => {
      if (!pineconeAvailable) return;

      const userId = generateUserId();
      await memorySystem.storeLongTerm(userId, 'Test long-term memory');

      // Verify by searching
      const results = await memorySystem.searchSimilar('Test long-term memory', 1);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].content).toContain('Test long-term memory');
      expect(results[0].metadata?.userId).toBe(userId);
      expect(results[0].metadata?.type).toBe('long-term');

      // Track for cleanup
      if (results[0].id) {
        testMemoryIds.push(results[0].id);
      }
    });

    it('should store object data as JSON string', async () => {
      if (!pineconeAvailable) return;

      const sessionId = generateSessionId();
      const data = { key: 'value', number: 42 };
      await memorySystem.storeShortTerm(sessionId, data);

      const results = await memorySystem.searchSimilar('value', 1);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].content).toContain('key');
      expect(results[0].content).toContain('value');

      if (results[0].id) {
        testMemoryIds.push(results[0].id);
      }
    });
  });

  describe('Semantic Search', () => {
    it('should find similar memories using semantic search', async () => {
      if (!pineconeAvailable || !ollamaAvailable) return;

      const sessionId = generateSessionId();
      await memorySystem.storeShortTerm(sessionId, 'I love programming in TypeScript');
      await memorySystem.storeShortTerm(sessionId, 'JavaScript is also a great language');
      await memorySystem.storeShortTerm(sessionId, 'Python is perfect for data science');

      // Wait a bit for embeddings to be processed
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Search for similar content
      const results = await memorySystem.searchSimilar('coding languages', 3);
      expect(results.length).toBeGreaterThan(0);

      // Track for cleanup
      for (const result of results) {
        if (result.id) {
          testMemoryIds.push(result.id);
        }
      }
    });

    it('should respect limit parameter in search', async () => {
      if (!pineconeAvailable) return;

      const sessionId = generateSessionId();
      for (let i = 0; i < 5; i++) {
        await memorySystem.storeShortTerm(sessionId, `Memory ${i}`);
      }

      // Wait a bit for processing
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const results = await memorySystem.searchSimilar('Memory', 2);
      expect(results.length).toBeLessThanOrEqual(2);

      // Track for cleanup
      for (const result of results) {
        if (result.id) {
          testMemoryIds.push(result.id);
        }
      }
    });

    it('should return empty array for non-matching query', async () => {
      if (!pineconeAvailable) return;

      const results = await memorySystem.searchSimilar('nonexistentkeywordxyz12345');
      expect(results).toHaveLength(0);
    });
  });

  describe('Conversation History', () => {
    it('should retrieve conversation history from short-term memories', async () => {
      if (!pineconeAvailable) return;

      const sessionId = generateSessionId();
      const message1 = createTestMessage('Hello', 'user');
      const message2 = createTestMessage('Hi there!', 'assistant');

      // Store messages as short-term memories
      await memorySystem.storeShortTerm(sessionId, JSON.stringify(message1));
      await memorySystem.storeShortTerm(sessionId, JSON.stringify(message2));

      // Wait a bit for processing
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const history = await memorySystem.getConversationHistory(sessionId);
      expect(history.length).toBeGreaterThanOrEqual(2);

      // Track for cleanup
      const searchResults = await memorySystem.searchSimilar('Hello', 10);
      for (const result of searchResults) {
        if (result.id && result.metadata?.sessionId === sessionId) {
          testMemoryIds.push(result.id);
        }
      }
    });

    it('should return empty array for non-existent session', async () => {
      if (!pineconeAvailable) return;

      const history = await memorySystem.getConversationHistory('non-existent-session');
      expect(history).toHaveLength(0);
    });

    it('should create messages from plain text content', async () => {
      if (!pineconeAvailable) return;

      const sessionId = generateSessionId();
      await memorySystem.storeShortTerm(sessionId, 'Plain text message');

      // Wait a bit for processing
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const history = await memorySystem.getConversationHistory(sessionId);
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].content).toContain('Plain text message');
      expect(history[0].role).toBe('user');

      // Track for cleanup
      const searchResults = await memorySystem.searchSimilar('Plain text', 1);
      if (searchResults[0]?.id) {
        testMemoryIds.push(searchResults[0].id);
      }
    });
  });

  describe('Memory Separation', () => {
    it('should keep short-term and long-term memories separate', async () => {
      if (!pineconeAvailable) return;

      const sessionId = generateSessionId();
      const userId = generateUserId();

      await memorySystem.storeShortTerm(sessionId, 'Short-term memory');
      await memorySystem.storeLongTerm(userId, 'Long-term memory');

      // Wait a bit for processing
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Both should be searchable
      const shortTermResults = await memorySystem.searchSimilar('Short-term', 1);
      const longTermResults = await memorySystem.searchSimilar('Long-term', 1);

      expect(shortTermResults.length).toBeGreaterThan(0);
      expect(longTermResults.length).toBeGreaterThan(0);
      expect(shortTermResults[0].metadata?.type).toBe('short-term');
      expect(longTermResults[0].metadata?.type).toBe('long-term');

      // Track for cleanup
      if (shortTermResults[0]?.id) {
        testMemoryIds.push(shortTermResults[0].id);
      }
      if (longTermResults[0]?.id) {
        testMemoryIds.push(longTermResults[0].id);
      }
    });
  });

  describe('Multiple Sessions and Users', () => {
    it('should handle multiple sessions independently', async () => {
      if (!pineconeAvailable) return;

      const session1 = generateSessionId('session1');
      const session2 = generateSessionId('session2');

      await memorySystem.storeShortTerm(session1, 'Session 1 memory');
      await memorySystem.storeShortTerm(session2, 'Session 2 memory');

      // Wait a bit for processing
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const history1 = await memorySystem.getConversationHistory(session1);
      const history2 = await memorySystem.getConversationHistory(session2);

      // Both should have their own memories
      const search1 = await memorySystem.searchSimilar('Session 1', 1);
      const search2 = await memorySystem.searchSimilar('Session 2', 1);

      expect(search1.length).toBeGreaterThan(0);
      expect(search2.length).toBeGreaterThan(0);

      // Track for cleanup
      if (search1[0]?.id) {
        testMemoryIds.push(search1[0].id);
      }
      if (search2[0]?.id) {
        testMemoryIds.push(search2[0].id);
      }
    });

    it('should handle multiple users independently', async () => {
      if (!pineconeAvailable) return;

      const user1 = generateUserId('user1');
      const user2 = generateUserId('user2');

      await memorySystem.storeLongTerm(user1, 'User 1 memory');
      await memorySystem.storeLongTerm(user2, 'User 2 memory');

      // Wait a bit for processing
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const search1 = await memorySystem.searchSimilar('User 1', 1);
      const search2 = await memorySystem.searchSimilar('User 2', 1);

      expect(search1.length).toBeGreaterThan(0);
      expect(search2.length).toBeGreaterThan(0);
      expect(search1[0].metadata?.userId).toBe(user1);
      expect(search2[0].metadata?.userId).toBe(user2);

      // Track for cleanup
      if (search1[0]?.id) {
        testMemoryIds.push(search1[0].id);
      }
      if (search2[0]?.id) {
        testMemoryIds.push(search2[0].id);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid Pinecone configuration gracefully', async () => {
      const invalidConfig: PineconeMemoryConfig = {
        apiKey: 'invalid-key',
        indexName: 'non-existent-index',
        environment: 'us-west-2', // Required for Pinecone client
      };

      const invalidSystem = new PineconeMemorySystem(invalidConfig);

      // Should throw error when trying to use
      await expect(
        invalidSystem.storeShortTerm('session-1', 'Test')
      ).rejects.toThrow();
    });
  });
});


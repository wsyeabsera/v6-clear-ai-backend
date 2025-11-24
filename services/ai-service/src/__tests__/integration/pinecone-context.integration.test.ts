import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { Database } from '../../database';
import { KernelAdapter } from '../../kernel/KernelAdapter';
import { ConversationService } from '../../services/conversation/ConversationService';
import { AskModeHandler } from '../../handlers/AskModeHandler';
import {
  checkOllamaAvailability,
  createTestAgentConfig,
  deleteTestAgentConfig,
  cleanupTestAgentConfigs,
  cleanupTestConversations,
  generateTestUserId,
} from './utils';

describe('Pinecone Context Integration Tests', () => {
  let db: Database;
  let kernelAdapter: KernelAdapter;
  let conversationService: ConversationService;
  let askModeHandler: AskModeHandler;
  let testUserId: string;
  let testSessionIds: string[] = [];
  let testConfigIds: string[] = [];
  let pineconeAvailable = false;
  let ollamaAvailable = false;
  let ollamaModel = 'llama2';

  beforeAll(async () => {
    // Check Pinecone availability
    const pineconeApiKey = process.env.PINECONE_API_KEY;
    if (pineconeApiKey) {
      try {
        // Simple check - try to create a Pinecone client
        const { Pinecone } = await import('@pinecone-database/pinecone');
        const client = new Pinecone({ apiKey: pineconeApiKey });
        const index = client.Index(process.env.PINECONE_INDEX_NAME || 'context-manager');
        // Try a simple query to verify
        await index.query({
          vector: new Array(768).fill(0),
          topK: 1,
          includeMetadata: false,
        });
        pineconeAvailable = true;
      } catch (error) {
        pineconeAvailable = false;
      }
    } else {
      pineconeAvailable = false;
    }

    // Check Ollama availability
    ollamaAvailable = await checkOllamaAvailability();
    
    if (ollamaAvailable) {
      ollamaModel = process.env.OLLAMA_MODEL || 'llama2';
    }

    if (!pineconeAvailable) {
      console.warn('⚠️  Pinecone not available, skipping Pinecone integration tests');
    }
    if (!ollamaAvailable) {
      console.warn('⚠️  Ollama not available, embedding generation will be disabled');
    }
  });

  beforeEach(async () => {
    if (!pineconeAvailable) return;

    // Set environment for Pinecone
    process.env.CONTEXT_MANAGER_TYPE = 'pinecone';
    process.env.MEMORY_SYSTEM_TYPE = 'pinecone';
    process.env.PINECONE_API_KEY = process.env.PINECONE_API_KEY || '';
    process.env.PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME || 'context-manager';
    process.env.OLLAMA_API_URL = process.env.OLLAMA_API_URL || 'http://localhost:11434';
    process.env.AI_SERVICE_MONGODB_URI = process.env.AI_SERVICE_MONGODB_URI || 'mongodb://localhost:27017/ai_service_test';

    db = new Database();
    await db.connect();

    kernelAdapter = new KernelAdapter();
    conversationService = new ConversationService(db, kernelAdapter);
    askModeHandler = new AskModeHandler(conversationService, kernelAdapter);

    testUserId = generateTestUserId();
    testSessionIds = [];
    testConfigIds = [];
  });

  afterEach(async () => {
    if (!pineconeAvailable) return;

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
  });

  describe('Context Manager with Pinecone', () => {
    it('should save and retrieve context from Pinecone', async () => {
      if (!pineconeAvailable) return;

      const sessionId = `test-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      testSessionIds.push(sessionId);

      const context = await conversationService.getConversationContext(sessionId);
      expect(context).toBeNull(); // Initially empty

      // Create a conversation
      const agentConfig = await createTestAgentConfig(testUserId, {
        model: ollamaModel,
      });
      testConfigIds.push(agentConfig.id);

      const response = await askModeHandler.handle({
        userId: testUserId,
        query: 'Hello, my name is Bob.',
        sessionId,
        configId: agentConfig.id,
      });

      expect(response).toBeDefined();

      // Retrieve context
      const retrievedContext = await conversationService.getConversationContext(sessionId);
      expect(retrievedContext).toBeDefined();
      expect(retrievedContext?.messages.length).toBeGreaterThanOrEqual(2);
    }, 90000);
  });

  describe('Memory System with Pinecone', () => {
    it('should store and search memories in Pinecone', async () => {
      if (!pineconeAvailable) return;

      const testData = {
        content: 'Test memory content',
        userId: testUserId,
        type: 'short-term',
      };

      await kernelAdapter.memorySystem.storeShortTerm('test-session', testData);

      const results = await kernelAdapter.memorySystem.searchSimilar('Test memory', 5);
      expect(Array.isArray(results)).toBe(true);
    }, 60000);
  });

  describe('Embedding Generation', () => {
    it('should generate embeddings with Ollama when available', async () => {
      if (!pineconeAvailable || !ollamaAvailable) return;

      const sessionId = `test-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      testSessionIds.push(sessionId);

      const agentConfig = await createTestAgentConfig(testUserId, {
        model: ollamaModel,
      });
      testConfigIds.push(agentConfig.id);

      // This should trigger embedding generation
      const response = await askModeHandler.handle({
        userId: testUserId,
        query: 'Test query for embeddings',
        sessionId,
        configId: agentConfig.id,
      });

      expect(response).toBeDefined();
    }, 90000);
  });

  describe('Context Persistence', () => {
    it('should persist context across multiple queries', async () => {
      if (!pineconeAvailable) return;

      const sessionId = `test-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      testSessionIds.push(sessionId);

      const agentConfig = await createTestAgentConfig(testUserId, {
        model: ollamaModel,
      });
      testConfigIds.push(agentConfig.id);

      // First query
      await askModeHandler.handle({
        userId: testUserId,
        query: 'My favorite color is blue.',
        sessionId,
        configId: agentConfig.id,
      });

      // Second query
      const response = await askModeHandler.handle({
        userId: testUserId,
        query: 'What is my favorite color?',
        sessionId,
        configId: agentConfig.id,
      });

      expect(response).toBeDefined();
      // Context should be maintained
      const context = await conversationService.getConversationContext(sessionId);
      expect(context?.messages.length).toBeGreaterThanOrEqual(4);
    }, 120000);
  });

  describe('Fallback to MongoDB', () => {
    it('should fallback to MongoDB when Pinecone unavailable', async () => {
      // Force MongoDB fallback
      process.env.CONTEXT_MANAGER_TYPE = 'pinecone';
      process.env.PINECONE_API_KEY = ''; // Invalid key

      const fallbackAdapter = new KernelAdapter();
      
      // Should have fallen back to MongoDB
      expect(fallbackAdapter.contextManager).toBeDefined();
    });
  });
});


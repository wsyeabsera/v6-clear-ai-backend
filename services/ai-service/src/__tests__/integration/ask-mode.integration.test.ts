import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
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
  generateTestSessionId,
} from './utils';

describe('AI Service Integration Tests - Ask Mode with Ollama', () => {
  let db: Database;
  let kernelAdapter: KernelAdapter;
  let conversationService: ConversationService;
  let askModeHandler: AskModeHandler;
  let testUserId: string;
  let testSessionIds: string[] = [];
  let testConfigIds: string[] = [];
  let ollamaAvailable = false;
  let ollamaModel = 'llama2';

  beforeAll(async () => {
    // Check Ollama availability
    ollamaAvailable = await checkOllamaAvailability();
    
    if (!ollamaAvailable) {
      console.warn('⚠️  Ollama not available at http://localhost:11434');
      console.warn('⚠️  Skipping integration tests. Please start Ollama locally.');
      return;
    }

    // Check for available Ollama models
    const env = loadTestEnv();
    ollamaModel = env.ollamaModel;
    
    const modelAvailable = await checkOllamaModel(ollamaModel);
    if (!modelAvailable) {
      console.warn(`⚠️  Model "${ollamaModel}" not available in Ollama`);
      console.warn('⚠️  Trying default "llama2" model');
      ollamaModel = 'llama2';
    }

    console.log(`✅ Ollama available, using model: ${ollamaModel}`);
  });

  beforeEach(async () => {
    if (!ollamaAvailable) return;

    // Set environment variables for tests (use MongoDB instead of Pinecone)
    process.env.CONTEXT_MANAGER_TYPE = 'mongo';
    process.env.MEMORY_SYSTEM_TYPE = 'local';
    process.env.AI_SERVICE_MONGODB_URI = process.env.AI_SERVICE_MONGODB_URI || 'mongodb://localhost:27017/ai_service_test';

    // Initialize services
    db = new Database();
    await db.connect();

    kernelAdapter = new KernelAdapter();
    conversationService = new ConversationService(db, kernelAdapter);
    askModeHandler = new AskModeHandler(conversationService, kernelAdapter);

    // Generate test user ID
    testUserId = generateTestUserId();
    testSessionIds = [];
    testConfigIds = [];
  });

  afterEach(async () => {
    if (!ollamaAvailable) return;

    // Cleanup test data
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

    // Disconnect database
    if (db) {
      await db.disconnect();
    }
  });

  describe('AskModeHandler - Basic Ask Flow', () => {
    it('should process a simple ask query with Ollama', async () => {
      if (!ollamaAvailable) return;

      // Create an Ollama agent config
      const agentConfig = await createTestAgentConfig(testUserId, {
        name: 'Ollama Test Config',
        model: ollamaModel,
        prompt: 'You are a helpful AI assistant. Answer concisely.',
        temperature: 0.7,
        maxTokens: 100,
      });
      testConfigIds.push(agentConfig.id);

      // Process ask query
      const response = await askModeHandler.handle({
        userId: testUserId,
        query: 'Say hello in one sentence.',
        configId: agentConfig.id,
      });

      expect(response).toBeDefined();
      expect(response.sessionId).toBeDefined();
      expect(response.response).toBeTruthy();
      expect(response.response.length).toBeGreaterThan(0);
      expect(response.model).toBe(ollamaModel);
      expect(response.timestamp).toBeDefined();

      testSessionIds.push(response.sessionId);
    }, 60000); // 60 second timeout for Ollama

    it('should maintain conversation context across multiple queries', async () => {
      if (!ollamaAvailable) return;

      const agentConfig = await createTestAgentConfig(testUserId, {
        name: 'Ollama Conversation Test',
        model: ollamaModel,
        prompt: 'You are a helpful AI assistant.',
        temperature: 0.7,
        maxTokens: 100,
      });
      testConfigIds.push(agentConfig.id);

      const sessionId = generateTestSessionId();
      testSessionIds.push(sessionId);

      // First query
      const response1 = await askModeHandler.handle({
        userId: testUserId,
        query: 'My name is Alice.',
        sessionId,
        configId: agentConfig.id,
      });

      expect(response1).toBeDefined();
      expect(response1.sessionId).toBe(sessionId);

      // Second query that references the first
      const response2 = await askModeHandler.handle({
        userId: testUserId,
        query: 'What is my name?',
        sessionId,
        configId: agentConfig.id,
      });

      expect(response2).toBeDefined();
      expect(response2.sessionId).toBe(sessionId);
      // The response should mention Alice (context awareness)
      expect(response2.response.toLowerCase()).toContain('alice');
    }, 120000); // 2 minute timeout for multiple queries

    it('should auto-generate sessionId if not provided', async () => {
      if (!ollamaAvailable) return;

      const agentConfig = await createTestAgentConfig(testUserId, {
        model: ollamaModel,
      });
      testConfigIds.push(agentConfig.id);

      const response = await askModeHandler.handle({
        userId: testUserId,
        query: 'Hello',
        configId: agentConfig.id,
      });

      expect(response.sessionId).toBeDefined();
      expect(response.sessionId.length).toBeGreaterThan(0);
      testSessionIds.push(response.sessionId);
    }, 60000);
  });

  describe('ConversationService', () => {
    it('should create and retrieve conversation sessions', async () => {
      if (!ollamaAvailable) return;

      const sessionId = await conversationService.getOrCreateSession(testUserId);
      expect(sessionId).toBeDefined();

      const history = await conversationService.getConversationHistory(sessionId);
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBe(0); // Initially empty

      testSessionIds.push(sessionId);
    });

    it('should store and retrieve conversation messages', async () => {
      if (!ollamaAvailable) return;

      const sessionId = await conversationService.getOrCreateSession(testUserId);
      testSessionIds.push(sessionId);

      const agentConfig = await createTestAgentConfig(testUserId, {
        model: ollamaModel,
      });
      testConfigIds.push(agentConfig.id);

      // Process a query
      await askModeHandler.handle({
        userId: testUserId,
        query: 'Test message',
        sessionId,
        configId: agentConfig.id,
      });

      // Retrieve conversation history
      const history = await conversationService.getConversationHistory(sessionId);
      expect(history.length).toBeGreaterThanOrEqual(2); // User message + assistant response
      expect(history[0].role).toBe('user');
      expect(history[0].content).toBe('Test message');
      expect(history[1].role).toBe('assistant');
    }, 60000);
  });

  describe('LLM Provider - Ollama', () => {
    it('should generate response using OllamaProvider', async () => {
      if (!ollamaAvailable) return;

      const { OllamaProvider } = await import('../../services/llm/OllamaProvider');
      const provider = new OllamaProvider();

      const agentConfig = await createTestAgentConfig(testUserId, {
        model: ollamaModel,
        prompt: 'You are a helpful assistant.',
        temperature: 0.7,
        maxTokens: 50,
      });
      testConfigIds.push(agentConfig.id);

      const context = {
        sessionId: generateTestSessionId(),
        messages: [],
      };

      const response = await provider.generateResponse(
        'Say "Hello, World!"',
        context,
        agentConfig
      );

      expect(response).toBeDefined();
      expect(response.content).toBeTruthy();
      expect(response.content.length).toBeGreaterThan(0);
      expect(response.model).toBe(ollamaModel);
    }, 60000);
  });

  describe('Error Handling', () => {
    it('should handle invalid agent config gracefully', async () => {
      if (!ollamaAvailable) return;

      await expect(
        askModeHandler.handle({
          userId: testUserId,
          query: 'Test',
          configId: 'non-existent-config-id',
        })
      ).rejects.toThrow();
    });

    it('should handle empty query', async () => {
      if (!ollamaAvailable) return;

      const agentConfig = await createTestAgentConfig(testUserId, {
        model: ollamaModel,
      });
      testConfigIds.push(agentConfig.id);

      await expect(
        askModeHandler.handle({
          userId: testUserId,
          query: '',
          configId: agentConfig.id,
        })
      ).rejects.toThrow();
    });
  });

  describe('Default Agent Config', () => {
    it('should use default config when configId is not provided', async () => {
      if (!ollamaAvailable) return;

      // Don't create a config - should use default
      const response = await askModeHandler.handle({
        userId: testUserId,
        query: 'Hello',
      });

      expect(response).toBeDefined();
      expect(response.response).toBeTruthy();
      expect(response.model).toBeDefined();
      testSessionIds.push(response.sessionId);
    }, 60000);
  });
});


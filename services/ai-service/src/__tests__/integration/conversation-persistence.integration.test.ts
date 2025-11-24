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
} from './utils';

describe('Conversation Persistence Integration Tests', () => {
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
    ollamaAvailable = await checkOllamaAvailability();
    
    if (ollamaAvailable) {
      const env = loadTestEnv();
      ollamaModel = env.ollamaModel;
      const modelAvailable = await checkOllamaModel(ollamaModel);
      if (!modelAvailable) {
        ollamaModel = 'llama2';
      }
    }
  });

  beforeEach(async () => {
    if (!ollamaAvailable) return;

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
  });

  afterEach(async () => {
    if (!ollamaAvailable) return;

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

  describe('Conversation Persistence', () => {
    it('should persist conversation across service restarts', async () => {
      if (!ollamaAvailable) return;

      const sessionId = `test-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      testSessionIds.push(sessionId);

      const agentConfig = await createTestAgentConfig(testUserId, {
        model: ollamaModel,
      });
      testConfigIds.push(agentConfig.id);

      // Create initial conversation
      await askModeHandler.handle({
        userId: testUserId,
        query: 'My name is Alice.',
        sessionId,
        configId: agentConfig.id,
      });

      // Simulate service restart by creating new instances
      await db.disconnect();
      
      const newDb = new Database();
      await newDb.connect();
      
      const newKernelAdapter = new KernelAdapter();
      const newConversationService = new ConversationService(newDb, newKernelAdapter);

      // Retrieve conversation after "restart"
      const history = await newConversationService.getConversationHistory(sessionId);
      expect(history.length).toBeGreaterThanOrEqual(2);
      expect(history[0].content).toBe('My name is Alice.');

      await newDb.disconnect();
    }, 90000);

    it('should handle large conversation history', async () => {
      if (!ollamaAvailable) return;

      const sessionId = `test-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      testSessionIds.push(sessionId);

      const agentConfig = await createTestAgentConfig(testUserId, {
        model: ollamaModel,
        maxTokens: 50, // Short responses for speed
      });
      testConfigIds.push(agentConfig.id);

      // Create multiple messages
      for (let i = 0; i < 5; i++) {
        await askModeHandler.handle({
          userId: testUserId,
          query: `Message ${i + 1}`,
          sessionId,
          configId: agentConfig.id,
        });
      }

      const history = await conversationService.getConversationHistory(sessionId);
      expect(history.length).toBeGreaterThanOrEqual(10); // 5 user + 5 assistant
    }, 300000); // 5 minute timeout for multiple queries

    it('should maintain message ordering', async () => {
      if (!ollamaAvailable) return;

      const sessionId = `test-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      testSessionIds.push(sessionId);

      const agentConfig = await createTestAgentConfig(testUserId, {
        model: ollamaModel,
      });
      testConfigIds.push(agentConfig.id);

      // Create conversation with multiple messages
      await askModeHandler.handle({
        userId: testUserId,
        query: 'First message',
        sessionId,
        configId: agentConfig.id,
      });

      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait a bit

      await askModeHandler.handle({
        userId: testUserId,
        query: 'Second message',
        sessionId,
        configId: agentConfig.id,
      });

      const history = await conversationService.getConversationHistory(sessionId);
      
      // Check ordering
      expect(history.length).toBeGreaterThanOrEqual(4);
      const userMessages = history.filter(m => m.role === 'user');
      expect(userMessages[0].content).toBe('First message');
      expect(userMessages[1].content).toBe('Second message');
    }, 120000);

    it('should maintain timestamps correctly', async () => {
      if (!ollamaAvailable) return;

      const sessionId = `test-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      testSessionIds.push(sessionId);

      const agentConfig = await createTestAgentConfig(testUserId, {
        model: ollamaModel,
      });
      testConfigIds.push(agentConfig.id);

      const beforeTime = new Date().toISOString();
      
      await askModeHandler.handle({
        userId: testUserId,
        query: 'Test message',
        sessionId,
        configId: agentConfig.id,
      });

      const afterTime = new Date().toISOString();

      const history = await conversationService.getConversationHistory(sessionId);
      expect(history.length).toBeGreaterThanOrEqual(2);
      
      history.forEach(message => {
        expect(message.timestamp).toBeDefined();
        expect(message.timestamp >= beforeTime).toBe(true);
        expect(message.timestamp <= afterTime).toBe(true);
      });
    }, 60000);

    it('should sync Context Manager and MongoDB', async () => {
      if (!ollamaAvailable) return;

      const sessionId = `test-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      testSessionIds.push(sessionId);

      const agentConfig = await createTestAgentConfig(testUserId, {
        model: ollamaModel,
      });
      testConfigIds.push(agentConfig.id);

      await askModeHandler.handle({
        userId: testUserId,
        query: 'Test sync',
        sessionId,
        configId: agentConfig.id,
      });

      // Check MongoDB
      const mongoHistory = await conversationService.getConversationHistory(sessionId);
      expect(mongoHistory.length).toBeGreaterThanOrEqual(2);

      // Check Context Manager
      const context = await conversationService.getConversationContext(sessionId);
      expect(context).toBeDefined();
      expect(context?.messages.length).toBeGreaterThanOrEqual(2);
    }, 60000);
  });
});


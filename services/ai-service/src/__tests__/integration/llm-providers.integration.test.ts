import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { Database } from '../../database';
import { KernelAdapter } from '../../kernel/KernelAdapter';
import { ConversationService } from '../../services/conversation/ConversationService';
import { AskModeHandler } from '../../handlers/AskModeHandler';
import { OllamaProvider } from '../../services/llm/OllamaProvider';
import { ClaudeProvider } from '../../services/llm/ClaudeProvider';
import { OpenAIProvider } from '../../services/llm/OpenAIProvider';
import { LLMProviderFactory } from '../../services/llm/LLMProviderFactory';
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

describe('LLM Providers Integration Tests', () => {
  let db: Database;
  let kernelAdapter: KernelAdapter;
  let conversationService: ConversationService;
  let askModeHandler: AskModeHandler;
  let testUserId: string;
  let testSessionIds: string[] = [];
  let testConfigIds: string[] = [];
  let ollamaAvailable = false;
  let ollamaModel = 'llama2';
  let claudeAvailable = false;
  let openAIAvailable = false;

  beforeAll(async () => {
    // Check service availability
    ollamaAvailable = await checkOllamaAvailability();
    
    if (ollamaAvailable) {
      const env = loadTestEnv();
      ollamaModel = env.ollamaModel;
      const modelAvailable = await checkOllamaModel(ollamaModel);
      if (!modelAvailable) {
        ollamaModel = 'llama2';
      }
    }

    // Check for API keys (don't test if not available)
    claudeAvailable = !!process.env.ANTHROPIC_API_KEY;
    openAIAvailable = !!process.env.OPENAI_API_KEY;

    console.log(`Ollama: ${ollamaAvailable ? '✅' : '❌'}`);
    console.log(`Claude: ${claudeAvailable ? '✅' : '❌'}`);
    console.log(`OpenAI: ${openAIAvailable ? '✅' : '❌'}`);
  });

  beforeEach(async () => {
    // Set environment for tests
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

  describe('Ollama Provider', () => {
    it('should generate response with Ollama', async () => {
      if (!ollamaAvailable) return;

      const agentConfig = await createTestAgentConfig(testUserId, {
        name: 'Ollama Test',
        model: ollamaModel,
        prompt: 'You are helpful.',
        temperature: 0.7,
        maxTokens: 100,
      });
      testConfigIds.push(agentConfig.id);

      const response = await askModeHandler.handle({
        userId: testUserId,
        query: 'Say hello in one word.',
        configId: agentConfig.id,
      });

      expect(response).toBeDefined();
      expect(response.response).toBeTruthy();
      expect(response.model).toBe(ollamaModel);
      testSessionIds.push(response.sessionId);
    }, 60000);

    it('should use OllamaProvider directly', async () => {
      if (!ollamaAvailable) return;

      const provider = new OllamaProvider();
      const agentConfig = await createTestAgentConfig(testUserId, {
        model: ollamaModel,
      });
      testConfigIds.push(agentConfig.id);

      const context = {
        sessionId: generateTestSessionId(),
        messages: [],
      };

      const response = await provider.generateResponse(
        'Say "test"',
        context,
        agentConfig
      );

      expect(response.content).toBeTruthy();
      expect(response.model).toBe(ollamaModel);
    }, 60000);
  });

  describe('Claude Provider', () => {
    it('should generate response with Claude', async () => {
      if (!claudeAvailable) return;

      const agentConfig = await createTestAgentConfig(testUserId, {
        name: 'Claude Test',
        model: 'claude-3-sonnet-20240229',
        prompt: 'You are helpful.',
        temperature: 0.7,
        maxTokens: 100,
      });
      testConfigIds.push(agentConfig.id);

      const response = await askModeHandler.handle({
        userId: testUserId,
        query: 'Say hello in one word.',
        configId: agentConfig.id,
      });

      expect(response).toBeDefined();
      expect(response.response).toBeTruthy();
      expect(response.model).toBe('claude-3-sonnet-20240229');
      expect(response.tokensUsed).toBeDefined();
      testSessionIds.push(response.sessionId);
    }, 60000);

    it('should use ClaudeProvider directly', async () => {
      if (!claudeAvailable) return;

      const provider = new ClaudeProvider();
      const agentConfig = await createTestAgentConfig(testUserId, {
        model: 'claude-3-sonnet-20240229',
      });
      testConfigIds.push(agentConfig.id);

      const context = {
        sessionId: generateTestSessionId(),
        messages: [],
      };

      const response = await provider.generateResponse(
        'Say "test"',
        context,
        agentConfig
      );

      expect(response.content).toBeTruthy();
      expect(response.tokensUsed).toBeDefined();
    }, 60000);
  });

  describe('OpenAI Provider', () => {
    it('should generate response with OpenAI', async () => {
      if (!openAIAvailable) return;

      const agentConfig = await createTestAgentConfig(testUserId, {
        name: 'OpenAI Test',
        model: 'gpt-4-turbo-preview',
        prompt: 'You are helpful.',
        temperature: 0.7,
        maxTokens: 100,
      });
      testConfigIds.push(agentConfig.id);

      const response = await askModeHandler.handle({
        userId: testUserId,
        query: 'Say hello in one word.',
        configId: agentConfig.id,
      });

      expect(response).toBeDefined();
      expect(response.response).toBeTruthy();
      expect(response.model).toBe('gpt-4-turbo-preview');
      expect(response.tokensUsed).toBeDefined();
      testSessionIds.push(response.sessionId);
    }, 60000);

    it('should use OpenAIProvider directly', async () => {
      if (!openAIAvailable) return;

      const provider = new OpenAIProvider();
      const agentConfig = await createTestAgentConfig(testUserId, {
        model: 'gpt-4-turbo-preview',
      });
      testConfigIds.push(agentConfig.id);

      const context = {
        sessionId: generateTestSessionId(),
        messages: [],
      };

      const response = await provider.generateResponse(
        'Say "test"',
        context,
        agentConfig
      );

      expect(response.content).toBeTruthy();
      expect(response.tokensUsed).toBeDefined();
    }, 60000);
  });

  describe('Provider Factory', () => {
    it('should select Claude provider for claude- models', () => {
      if (!claudeAvailable) return;

      const provider = LLMProviderFactory.create('claude-3-sonnet-20240229');
      expect(provider).toBeInstanceOf(ClaudeProvider);
    });

    it('should select OpenAI provider for gpt- models', () => {
      if (!openAIAvailable) return;

      const provider = LLMProviderFactory.create('gpt-4-turbo-preview');
      expect(provider).toBeInstanceOf(OpenAIProvider);
    });

    it('should select Ollama provider for other models', () => {
      if (!ollamaAvailable) return;

      const provider = LLMProviderFactory.create('llama2');
      expect(provider).toBeInstanceOf(OllamaProvider);
    });

    it('should select Ollama as default', () => {
      if (!ollamaAvailable) return;

      const provider = LLMProviderFactory.create('custom-model');
      expect(provider).toBeInstanceOf(OllamaProvider);
    });
  });

  describe('Switching Providers', () => {
    it('should switch between providers in same session', async () => {
      if (!ollamaAvailable || !claudeAvailable) return;

      const sessionId = generateTestSessionId();
      testSessionIds.push(sessionId);

      // First query with Ollama
      const ollamaConfig = await createTestAgentConfig(testUserId, {
        model: ollamaModel,
      });
      testConfigIds.push(ollamaConfig.id);

      const response1 = await askModeHandler.handle({
        userId: testUserId,
        query: 'My name is Alice.',
        sessionId,
        configId: ollamaConfig.id,
      });

      expect(response1.model).toBe(ollamaModel);

      // Second query with Claude
      const claudeConfig = await createTestAgentConfig(testUserId, {
        model: 'claude-3-sonnet-20240229',
      });
      testConfigIds.push(claudeConfig.id);

      const response2 = await askModeHandler.handle({
        userId: testUserId,
        query: 'What is my name?',
        sessionId,
        configId: claudeConfig.id,
      });

      expect(response2.model).toBe('claude-3-sonnet-20240229');
      expect(response2.sessionId).toBe(sessionId);
    }, 120000);
  });

  describe('Error Handling', () => {
    it('should handle unavailable provider gracefully', async () => {
      if (!ollamaAvailable) return;

      // Try to use Claude without API key
      const originalKey = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;

      await expect(async () => {
        new ClaudeProvider();
      }).rejects.toThrow();

      process.env.ANTHROPIC_API_KEY = originalKey;
    });

    it('should handle provider timeout', async () => {
      if (!ollamaAvailable) return;

      const agentConfig = await createTestAgentConfig(testUserId, {
        model: 'nonexistent-model',
      });
      testConfigIds.push(agentConfig.id);

      // This should fail or timeout
      await expect(
        askModeHandler.handle({
          userId: testUserId,
          query: 'Test',
          configId: agentConfig.id,
        })
      ).rejects.toThrow();
    }, 120000);
  });
});


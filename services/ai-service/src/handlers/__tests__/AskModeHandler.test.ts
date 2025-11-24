import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AskModeHandler } from '../AskModeHandler';
import { ConversationService } from '../../services/conversation/ConversationService';
import { KernelAdapter } from '../../kernel/KernelAdapter';
import { LLMProviderFactory } from '../../services/llm/LLMProviderFactory';
import { ConversationContext } from 'shared';
import { LLMResponse } from '../../types';

// Mock dependencies
vi.mock('../../services/conversation/ConversationService');
vi.mock('../../kernel/KernelAdapter');
vi.mock('../../services/llm/LLMProviderFactory');
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'generated-uuid'),
}));

describe('AskModeHandler', () => {
  let askModeHandler: AskModeHandler;
  let mockConversationService: any;
  let mockKernelAdapter: any;
  let mockEventBus: any;
  let mockLLMProvider: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock Event Bus
    mockEventBus = {
      emit: vi.fn().mockResolvedValue(undefined),
    };

    // Mock KernelAdapter
    mockKernelAdapter = {
      eventBus: mockEventBus,
      contextManager: {
        getContext: vi.fn(),
        saveContext: vi.fn(),
      },
    };
    (KernelAdapter as any).mockImplementation(() => mockKernelAdapter);

    // Mock ConversationService
    mockConversationService = {
      getOrCreateSession: vi.fn(),
      getConversationContext: vi.fn(),
      getUserPreferences: vi.fn().mockResolvedValue({}),
      getAgentConfig: vi.fn(),
      addMessage: vi.fn(),
    };
    (ConversationService as any).mockImplementation(() => mockConversationService);

    // Mock LLM Provider
    mockLLMProvider = {
      generateResponse: vi.fn(),
    };

    // Mock LLMProviderFactory
    vi.mocked(LLMProviderFactory.createFromConfig).mockReturnValue(mockLLMProvider);

    askModeHandler = new AskModeHandler(mockConversationService, mockKernelAdapter);
  });

  describe('handle', () => {
    const createTestOptions = (overrides: any = {}) => ({
      userId: 'user-123',
      query: 'Hello, how are you?',
      sessionId: 'session-456',
      configId: 'config-789',
      ...overrides,
    });

    const createMockAgentConfig = () => ({
      id: 'config-789',
      userId: 'user-123',
      name: 'Test Config',
      prompt: 'You are helpful',
      model: 'llama2',
      temperature: 0.7,
      maxTokens: 1024,
      createdAt: new Date().toISOString(),
    });

    const createMockLLMResponse = (): LLMResponse => ({
      content: 'I am doing well, thank you!',
      tokensUsed: 15,
      model: 'llama2',
      finishReason: 'stop',
    });

    it('should process ask query successfully', async () => {
      const options = createTestOptions();
      const agentConfig = createMockAgentConfig();
      const llmResponse = createMockLLMResponse();
      const context: ConversationContext = {
        sessionId: options.sessionId!,
        messages: [],
      };

      mockConversationService.getOrCreateSession.mockResolvedValue(options.sessionId);
      mockConversationService.getConversationContext.mockResolvedValue(context);
      mockConversationService.getAgentConfig.mockResolvedValue(agentConfig);
      mockLLMProvider.generateResponse.mockResolvedValue(llmResponse);

      const result = await askModeHandler.handle(options);

      expect(result).toBeDefined();
      expect(result.sessionId).toBe(options.sessionId);
      expect(result.response).toBe(llmResponse.content);
      expect(result.model).toBe('llama2');
      expect(result.tokensUsed).toBe(15);

      expect(mockConversationService.getOrCreateSession).toHaveBeenCalledWith(
        options.userId,
        options.sessionId
      );
      expect(mockConversationService.getAgentConfig).toHaveBeenCalledWith(
        options.userId,
        options.configId
      );
      expect(mockLLMProvider.generateResponse).toHaveBeenCalledWith(
        options.query,
        context,
        agentConfig
      );
    });

    it('should auto-generate sessionId if not provided', async () => {
      const options = createTestOptions({ sessionId: undefined });
      const agentConfig = createMockAgentConfig();
      const llmResponse = createMockLLMResponse();
      const generatedSessionId = 'generated-session-id';
      const context: ConversationContext = {
        sessionId: generatedSessionId,
        messages: [],
      };

      mockConversationService.getOrCreateSession.mockResolvedValue(generatedSessionId);
      mockConversationService.getConversationContext.mockResolvedValue(context);
      mockConversationService.getAgentConfig.mockResolvedValue(agentConfig);
      mockLLMProvider.generateResponse.mockResolvedValue(llmResponse);

      const result = await askModeHandler.handle(options);

      expect(result.sessionId).toBe(generatedSessionId);
      expect(mockConversationService.getOrCreateSession).toHaveBeenCalledWith(
        options.userId,
        undefined
      );
    });

    it('should create context if not exists', async () => {
      const options = createTestOptions();
      const agentConfig = createMockAgentConfig();
      const llmResponse = createMockLLMResponse();

      mockConversationService.getOrCreateSession.mockResolvedValue(options.sessionId);
      mockConversationService.getConversationContext.mockResolvedValue(null);
      mockConversationService.getAgentConfig.mockResolvedValue(agentConfig);
      mockLLMProvider.generateResponse.mockResolvedValue(llmResponse);

      const result = await askModeHandler.handle(options);

      expect(result).toBeDefined();
      expect(mockLLMProvider.generateResponse).toHaveBeenCalledWith(
        options.query,
        expect.objectContaining({
          sessionId: options.sessionId,
          messages: [],
        }),
        agentConfig
      );
    });

    it('should emit events for query received, response generated, and response sent', async () => {
      const options = createTestOptions();
      const agentConfig = createMockAgentConfig();
      const llmResponse = createMockLLMResponse();
      const context: ConversationContext = {
        sessionId: options.sessionId!,
        messages: [],
      };

      mockConversationService.getOrCreateSession.mockResolvedValue(options.sessionId);
      mockConversationService.getConversationContext.mockResolvedValue(context);
      mockConversationService.getAgentConfig.mockResolvedValue(agentConfig);
      mockLLMProvider.generateResponse.mockResolvedValue(llmResponse);

      await askModeHandler.handle(options);

      expect(mockEventBus.emit).toHaveBeenCalledTimes(3);
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'ai-service.ask.query.received',
        expect.objectContaining({
          query: options.query,
          configId: options.configId,
        }),
        expect.objectContaining({
          sessionId: options.sessionId,
          userId: options.userId,
        })
      );
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'ai-service.ask.response.generated',
        expect.objectContaining({
          query: options.query,
          response: llmResponse.content,
        }),
        expect.any(Object)
      );
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'ai-service.ask.response.sent',
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should save user and assistant messages', async () => {
      const options = createTestOptions();
      const agentConfig = createMockAgentConfig();
      const llmResponse = createMockLLMResponse();
      const context: ConversationContext = {
        sessionId: options.sessionId!,
        messages: [],
      };

      mockConversationService.getOrCreateSession.mockResolvedValue(options.sessionId);
      mockConversationService.getConversationContext.mockResolvedValue(context);
      mockConversationService.getAgentConfig.mockResolvedValue(agentConfig);
      mockLLMProvider.generateResponse.mockResolvedValue(llmResponse);

      await askModeHandler.handle(options);

      expect(mockConversationService.addMessage).toHaveBeenCalledTimes(2);
      expect(mockConversationService.addMessage).toHaveBeenNthCalledWith(
        1,
        options.sessionId,
        expect.objectContaining({
          role: 'user',
          content: options.query,
        }),
        options.userId
      );
      expect(mockConversationService.addMessage).toHaveBeenNthCalledWith(
        2,
        options.sessionId,
        expect.objectContaining({
          role: 'assistant',
          content: llmResponse.content,
        }),
        options.userId
      );
    });

    it('should handle missing agent config', async () => {
      const options = createTestOptions();

      mockConversationService.getOrCreateSession.mockResolvedValue(options.sessionId);
      mockConversationService.getConversationContext.mockResolvedValue({
        sessionId: options.sessionId!,
        messages: [],
      });
      mockConversationService.getAgentConfig.mockResolvedValue(null);

      await expect(askModeHandler.handle(options)).rejects.toThrow('Agent config not found');
    });

    it('should handle LLM provider errors', async () => {
      const options = createTestOptions();
      const agentConfig = createMockAgentConfig();
      const context: ConversationContext = {
        sessionId: options.sessionId!,
        messages: [],
      };

      mockConversationService.getOrCreateSession.mockResolvedValue(options.sessionId);
      mockConversationService.getConversationContext.mockResolvedValue(context);
      mockConversationService.getAgentConfig.mockResolvedValue(agentConfig);
      mockLLMProvider.generateResponse.mockRejectedValue(new Error('LLM error'));

      await expect(askModeHandler.handle(options)).rejects.toThrow('LLM error');

      // Should still emit error event
      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'ai-service.ask.error',
        expect.objectContaining({
          error: 'LLM error',
        }),
        expect.any(Object)
      );
    });

    it('should propagate event bus errors in normal flow', async () => {
      const options = createTestOptions();
      const agentConfig = createMockAgentConfig();
      const llmResponse = createMockLLMResponse();
      const context: ConversationContext = {
        sessionId: options.sessionId!,
        messages: [],
      };

      mockConversationService.getOrCreateSession.mockResolvedValue(options.sessionId);
      mockConversationService.getConversationContext.mockResolvedValue(context);
      mockConversationService.getAgentConfig.mockResolvedValue(agentConfig);
      mockLLMProvider.generateResponse.mockResolvedValue(llmResponse);
      
      // Make emit fail - this will cause the handler to throw
      mockEventBus.emit.mockRejectedValue(new Error('Event bus error'));

      // Event bus errors in normal flow will throw
      await expect(askModeHandler.handle(options)).rejects.toThrow('Event bus error');
    });
  });
});


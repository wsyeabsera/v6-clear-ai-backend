import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenAIProvider } from '../OpenAIProvider';
import { ConversationContext, Message } from 'shared';
import { AgentConfig } from '../../../types';
import OpenAI from 'openai';

// Mock OpenAI SDK
vi.mock('openai');

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    process.env.OPENAI_API_KEY = 'test-api-key';
    
    // Mock OpenAI client
    mockClient = {
      chat: {
        completions: {
          create: vi.fn(),
        },
      },
    };
    
    (OpenAI as any).mockImplementation(() => mockClient);
    
    provider = new OpenAIProvider();
  });

  const createTestContext = (messages: Message[] = []): ConversationContext => ({
    sessionId: 'test-session',
    messages,
  });

  const createTestConfig = (overrides: Partial<AgentConfig> = {}): AgentConfig => ({
    id: 'test-config',
    userId: 'test-user',
    name: 'Test Config',
    prompt: 'You are a helpful assistant.',
    model: 'gpt-4-turbo-preview',
    temperature: 0.7,
    maxTokens: 1024,
    createdAt: new Date().toISOString(),
    ...overrides,
  });

  describe('constructor', () => {
    it('should throw error if API key is missing', () => {
      delete process.env.OPENAI_API_KEY;
      
      expect(() => new OpenAIProvider()).toThrow('OPENAI_API_KEY environment variable is required');
    });
  });

  describe('generateResponse', () => {
    it('should generate response with valid inputs', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Hello, World!',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
        },
      };

      mockClient.chat.completions.create.mockResolvedValue(mockResponse);

      const context = createTestContext();
      const config = createTestConfig();
      const response = await provider.generateResponse('Say hello', context, config);

      expect(response).toBeDefined();
      expect(response.content).toBe('Hello, World!');
      expect(response.model).toBe('gpt-4-turbo-preview');
      expect(response.tokensUsed).toBe(15); // 10 + 5
      expect(response.finishReason).toBe('stop');

      expect(mockClient.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-4-turbo-preview',
        max_tokens: 1024,
        temperature: 0.7,
        messages: expect.arrayContaining([
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Say hello' },
        ]),
      });
    });

    it('should format conversation history correctly', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Hi there!',
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 3 },
      };

      mockClient.chat.completions.create.mockResolvedValue(mockResponse);

      const context = createTestContext([
        { id: '1', role: 'user', content: 'Hello', timestamp: new Date().toISOString() },
        { id: '2', role: 'assistant', content: 'Hi', timestamp: new Date().toISOString() },
      ]);
      const config = createTestConfig();
      
      await provider.generateResponse('How are you?', context, config);

      const callArgs = mockClient.chat.completions.create.mock.calls[0][0];
      expect(callArgs.messages).toHaveLength(4);
      expect(callArgs.messages[0]).toEqual({ role: 'system', content: 'You are a helpful assistant.' });
      expect(callArgs.messages[1]).toEqual({ role: 'user', content: 'Hello' });
      expect(callArgs.messages[2]).toEqual({ role: 'assistant', content: 'Hi' });
      expect(callArgs.messages[3]).toEqual({ role: 'user', content: 'How are you?' });
    });

    it('should not duplicate system message if already present', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Test',
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 3 },
      };

      mockClient.chat.completions.create.mockResolvedValue(mockResponse);

      const context = createTestContext([
        { id: '1', role: 'system', content: 'Custom system', timestamp: new Date().toISOString() },
      ]);
      const config = createTestConfig();
      
      await provider.generateResponse('Test', context, config);

      const callArgs = mockClient.chat.completions.create.mock.calls[0][0];
      // Should not add another system message
      const systemMessages = callArgs.messages.filter((m: any) => m.role === 'system');
      expect(systemMessages.length).toBe(1);
    });

    it('should handle empty message content', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 3 },
      };

      mockClient.chat.completions.create.mockResolvedValue(mockResponse);

      const response = await provider.generateResponse('Test', createTestContext(), createTestConfig());

      expect(response.content).toBe('');
    });

    it('should use options over config values', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Test',
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 3 },
      };

      mockClient.chat.completions.create.mockResolvedValue(mockResponse);

      const config = createTestConfig({
        temperature: 0.7,
        maxTokens: 1024,
      });

      await provider.generateResponse('Test', createTestContext(), config, {
        temperature: 0.5,
        maxTokens: 256,
      });

      const callArgs = mockClient.chat.completions.create.mock.calls[0][0];
      expect(callArgs.temperature).toBe(0.5);
      expect(callArgs.max_tokens).toBe(256);
    });

    it('should handle missing usage information', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Test',
            },
            finish_reason: 'stop',
          },
        ],
      };

      mockClient.chat.completions.create.mockResolvedValue(mockResponse);

      const response = await provider.generateResponse('Test', createTestContext(), createTestConfig());

      expect(response.tokensUsed).toBeUndefined();
    });

    it('should use default model if not specified', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Test',
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 3 },
      };

      mockClient.chat.completions.create.mockResolvedValue(mockResponse);

      const config = createTestConfig({ model: '' });
      await provider.generateResponse('Test', createTestContext(), config);

      const callArgs = mockClient.chat.completions.create.mock.calls[0][0];
      expect(callArgs.model).toBe('gpt-4-turbo-preview');
    });

    it('should use default system prompt if not specified', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Test',
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 3 },
      };

      mockClient.chat.completions.create.mockResolvedValue(mockResponse);

      const config = createTestConfig({ prompt: '' });
      await provider.generateResponse('Test', createTestContext(), config);

      const callArgs = mockClient.chat.completions.create.mock.calls[0][0];
      expect(callArgs.messages[0].content).toBe('You are a helpful AI assistant.');
    });
  });

  describe('error handling', () => {
    it('should handle no response from OpenAI', async () => {
      const mockResponse = {
        choices: [],
        usage: { prompt_tokens: 5, completion_tokens: 3 },
      };

      mockClient.chat.completions.create.mockResolvedValue(mockResponse);

      await expect(
        provider.generateResponse('Test', createTestContext(), createTestConfig())
      ).rejects.toThrow('No response from OpenAI');
    });

    it('should handle missing message in choice', async () => {
      const mockResponse = {
        choices: [
          {
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 3 },
      };

      mockClient.chat.completions.create.mockResolvedValue(mockResponse);

      await expect(
        provider.generateResponse('Test', createTestContext(), createTestConfig())
      ).rejects.toThrow('No response from OpenAI');
    });

    it('should handle API errors', async () => {
      const error = new Error('API Error');
      mockClient.chat.completions.create.mockRejectedValue(error);

      await expect(
        provider.generateResponse('Test', createTestContext(), createTestConfig())
      ).rejects.toThrow('OpenAI API error: API Error');
    });

    it('should handle errors without message', async () => {
      const error = new Error();
      mockClient.chat.completions.create.mockRejectedValue(error);

      await expect(
        provider.generateResponse('Test', createTestContext(), createTestConfig())
      ).rejects.toThrow('OpenAI API error: Unknown error');
    });
  });
});


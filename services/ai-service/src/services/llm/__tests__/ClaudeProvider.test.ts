import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClaudeProvider } from '../ClaudeProvider';
import { ConversationContext, Message } from 'shared';
import { AgentConfig } from '../../../types';
import Anthropic from '@anthropic-ai/sdk';

// Mock Anthropic SDK
vi.mock('@anthropic-ai/sdk');

describe('ClaudeProvider', () => {
  let provider: ClaudeProvider;
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    process.env.ANTHROPIC_API_KEY = 'test-api-key';
    
    // Mock Anthropic client
    mockClient = {
      messages: {
        create: vi.fn(),
      },
    };
    
    (Anthropic as any).mockImplementation(() => mockClient);
    
    provider = new ClaudeProvider();
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
    model: 'claude-3-sonnet-20240229',
    temperature: 0.7,
    maxTokens: 1024,
    createdAt: new Date().toISOString(),
    ...overrides,
  });

  describe('constructor', () => {
    it('should throw error if API key is missing', () => {
      delete process.env.ANTHROPIC_API_KEY;
      
      expect(() => new ClaudeProvider()).toThrow('ANTHROPIC_API_KEY environment variable is required');
    });
  });

  describe('generateResponse', () => {
    it('should generate response with valid inputs', async () => {
      const mockResponse = {
        content: [
          {
            type: 'text',
            text: 'Hello, World!',
          },
        ],
        usage: {
          input_tokens: 10,
          output_tokens: 5,
        },
        stop_reason: 'end_turn',
      };

      mockClient.messages.create.mockResolvedValue(mockResponse);

      const context = createTestContext();
      const config = createTestConfig();
      const response = await provider.generateResponse('Say hello', context, config);

      expect(response).toBeDefined();
      expect(response.content).toBe('Hello, World!');
      expect(response.model).toBe('claude-3-sonnet-20240229');
      expect(response.tokensUsed).toBe(15); // 10 + 5
      expect(response.finishReason).toBe('end_turn');

      expect(mockClient.messages.create).toHaveBeenCalledWith({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 1024,
        temperature: 0.7,
        system: 'You are a helpful assistant.',
        messages: [
          {
            role: 'user',
            content: 'Say hello',
          },
        ],
      });
    });

    it('should format conversation history correctly', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: 'Hi there!' }],
        usage: { input_tokens: 5, output_tokens: 3 },
        stop_reason: 'end_turn',
      };

      mockClient.messages.create.mockResolvedValue(mockResponse);

      const context = createTestContext([
        { id: '1', role: 'user', content: 'Hello', timestamp: new Date().toISOString() },
        { id: '2', role: 'assistant', content: 'Hi', timestamp: new Date().toISOString() },
      ]);
      const config = createTestConfig();
      
      await provider.generateResponse('How are you?', context, config);

      const callArgs = mockClient.messages.create.mock.calls[0][0];
      expect(callArgs.messages).toHaveLength(3);
      expect(callArgs.messages[0]).toEqual({ role: 'user', content: 'Hello' });
      expect(callArgs.messages[1]).toEqual({ role: 'assistant', content: 'Hi' });
      expect(callArgs.messages[2]).toEqual({ role: 'user', content: 'How are you?' });
    });

    it('should handle multiple text blocks', async () => {
      const mockResponse = {
        content: [
          { type: 'text', text: 'Hello, ' },
          { type: 'text', text: 'World!' },
        ],
        usage: { input_tokens: 5, output_tokens: 3 },
        stop_reason: 'end_turn',
      };

      mockClient.messages.create.mockResolvedValue(mockResponse);

      const response = await provider.generateResponse('Test', createTestContext(), createTestConfig());

      expect(response.content).toBe('Hello, World!');
    });

    it('should ignore non-text content blocks', async () => {
      const mockResponse = {
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'image', source: {} },
        ],
        usage: { input_tokens: 5, output_tokens: 3 },
        stop_reason: 'end_turn',
      };

      mockClient.messages.create.mockResolvedValue(mockResponse);

      const response = await provider.generateResponse('Test', createTestContext(), createTestConfig());

      expect(response.content).toBe('Hello');
    });

    it('should use options over config values', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: 'Test' }],
        usage: { input_tokens: 5, output_tokens: 3 },
        stop_reason: 'end_turn',
      };

      mockClient.messages.create.mockResolvedValue(mockResponse);

      const config = createTestConfig({
        temperature: 0.7,
        maxTokens: 1024,
      });

      await provider.generateResponse('Test', createTestContext(), config, {
        temperature: 0.5,
        maxTokens: 256,
      });

      const callArgs = mockClient.messages.create.mock.calls[0][0];
      expect(callArgs.temperature).toBe(0.5);
      expect(callArgs.max_tokens).toBe(256);
    });

    it('should handle missing usage information', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: 'Test' }],
        stop_reason: 'end_turn',
      };

      mockClient.messages.create.mockResolvedValue(mockResponse);

      const response = await provider.generateResponse('Test', createTestContext(), createTestConfig());

      expect(response.tokensUsed).toBeUndefined();
    });

    it('should use default model if not specified', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: 'Test' }],
        usage: { input_tokens: 5, output_tokens: 3 },
        stop_reason: 'end_turn',
      };

      mockClient.messages.create.mockResolvedValue(mockResponse);

      const config = createTestConfig({ model: '' });
      await provider.generateResponse('Test', createTestContext(), config);

      const callArgs = mockClient.messages.create.mock.calls[0][0];
      expect(callArgs.model).toBe('claude-3-sonnet-20240229');
    });

    it('should use default system prompt if not specified', async () => {
      const mockResponse = {
        content: [{ type: 'text', text: 'Test' }],
        usage: { input_tokens: 5, output_tokens: 3 },
        stop_reason: 'end_turn',
      };

      mockClient.messages.create.mockResolvedValue(mockResponse);

      const config = createTestConfig({ prompt: '' });
      await provider.generateResponse('Test', createTestContext(), config);

      const callArgs = mockClient.messages.create.mock.calls[0][0];
      expect(callArgs.system).toBe('You are a helpful AI assistant.');
    });
  });

  describe('error handling', () => {
    it('should handle API errors', async () => {
      const error = new Error('API Error');
      mockClient.messages.create.mockRejectedValue(error);

      await expect(
        provider.generateResponse('Test', createTestContext(), createTestConfig())
      ).rejects.toThrow('Claude API error: API Error');
    });

    it('should handle errors without message', async () => {
      const error = new Error();
      mockClient.messages.create.mockRejectedValue(error);

      await expect(
        provider.generateResponse('Test', createTestContext(), createTestConfig())
      ).rejects.toThrow('Claude API error: Unknown error');
    });
  });
});


import { describe, it, expect, beforeEach, vi } from 'vitest';
import axios from 'axios';
import { OllamaProvider } from '../OllamaProvider';
import { ConversationContext, Message } from 'shared';
import { AgentConfig } from '../../../types';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('OllamaProvider', () => {
  let provider: OllamaProvider;
  let mockAxiosInstance: any;
  let mockPost: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock axios.create
    mockPost = vi.fn();
    mockAxiosInstance = {
      post: mockPost,
    };
    mockedAxios.create = vi.fn().mockReturnValue(mockAxiosInstance);
    
    // Set default environment
    process.env.OLLAMA_API_URL = 'http://localhost:11434';
    
    provider = new OllamaProvider();
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
    model: 'llama2',
    temperature: 0.7,
    maxTokens: 1024,
    createdAt: new Date().toISOString(),
    ...overrides,
  });

  describe('generateResponse', () => {
    it('should generate response with valid inputs', async () => {
      const mockResponse = {
        data: {
          model: 'llama2',
          response: 'Hello, World!',
          done: true,
          prompt_eval_count: 10,
          eval_count: 5,
        },
      };

      mockPost.mockResolvedValue(mockResponse);

      const context = createTestContext();
      const config = createTestConfig();
      const response = await provider.generateResponse('Say hello', context, config);

      expect(response).toBeDefined();
      expect(response.content).toBe('Hello, World!');
      expect(response.model).toBe('llama2');
      expect(response.tokensUsed).toBe(15); // 10 + 5
      expect(response.finishReason).toBe('stop');

      expect(mockPost).toHaveBeenCalledWith(
        '/api/generate',
        expect.objectContaining({
          model: 'llama2',
          prompt: expect.stringContaining('Say hello'),
          system: 'You are a helpful assistant.',
          stream: false,
          options: {
            temperature: 0.7,
            num_predict: 1024,
          },
        })
      );
    });

    it('should format conversation history correctly', async () => {
      const mockResponse = {
        data: {
          model: 'llama2',
          response: 'Hi there!',
          done: true,
        },
      };

      mockPost.mockResolvedValue(mockResponse);

      const context = createTestContext([
        { id: '1', role: 'user', content: 'Hello', timestamp: new Date().toISOString() },
        { id: '2', role: 'assistant', content: 'Hi', timestamp: new Date().toISOString() },
      ]);
      const config = createTestConfig();
      
      await provider.generateResponse('How are you?', context, config);

      const callArgs = mockPost.mock.calls[0][1];
      expect(callArgs.prompt).toContain('User: Hello');
      expect(callArgs.prompt).toContain('Assistant: Hi');
      expect(callArgs.prompt).toContain('User: How are you?');
    });

    it('should use config temperature and maxTokens', async () => {
      const mockResponse = {
        data: {
          model: 'llama2',
          response: 'Test',
          done: true,
        },
      };

      mockPost.mockResolvedValue(mockResponse);

      const config = createTestConfig({
        temperature: 0.9,
        maxTokens: 512,
      });

      await provider.generateResponse('Test', createTestContext(), config);

      const callArgs = mockPost.mock.calls[0][1];
      expect(callArgs.options.temperature).toBe(0.9);
      expect(callArgs.options.num_predict).toBe(512);
    });

    it('should use options over config values', async () => {
      const mockResponse = {
        data: {
          model: 'llama2',
          response: 'Test',
          done: true,
        },
      };

      mockPost.mockResolvedValue(mockResponse);

      const config = createTestConfig({
        temperature: 0.7,
        maxTokens: 1024,
      });

      await provider.generateResponse('Test', createTestContext(), config, {
        temperature: 0.5,
        maxTokens: 256,
      });

      const callArgs = mockPost.mock.calls[0][1];
      expect(callArgs.options.temperature).toBe(0.5);
      expect(callArgs.options.num_predict).toBe(256);
    });

    it('should handle missing token counts gracefully', async () => {
      const mockResponse = {
        data: {
          model: 'llama2',
          response: 'Test response',
          done: true,
        },
      };

      mockPost.mockResolvedValue(mockResponse);

      const response = await provider.generateResponse(
        'Test',
        createTestContext(),
        createTestConfig()
      );

      expect(response.tokensUsed).toBeUndefined();
    });

    it('should use default model if not specified', async () => {
      const mockResponse = {
        data: {
          model: 'llama2',
          response: 'Test',
          done: true,
        },
      };

      mockPost.mockResolvedValue(mockResponse);

      const config = createTestConfig({ model: '' });
      await provider.generateResponse('Test', createTestContext(), config);

      const callArgs = mockPost.mock.calls[0][1];
      expect(callArgs.model).toBe('llama2');
    });

    it('should use default system prompt if not specified', async () => {
      const mockResponse = {
        data: {
          model: 'llama2',
          response: 'Test',
          done: true,
        },
      };

      mockPost.mockResolvedValue(mockResponse);

      const config = createTestConfig({ prompt: '' });
      await provider.generateResponse('Test', createTestContext(), config);

      const callArgs = mockPost.mock.calls[0][1];
      expect(callArgs.system).toBe('You are a helpful AI assistant.');
    });
  });

  describe('error handling', () => {
    it('should handle connection refused errors', async () => {
      const error: any = new Error('Connection refused');
      error.code = 'ECONNREFUSED';
      error.isAxiosError = true;
      mockPost.mockRejectedValue(error);

      const config = createTestConfig({ model: 'llama2' });

      await expect(
        provider.generateResponse('Test', createTestContext(), config)
      ).rejects.toThrow();
    });

    it('should handle timeout errors', async () => {
      const error: any = new Error('Timeout');
      error.code = 'ETIMEDOUT';
      error.isAxiosError = true;
      mockPost.mockRejectedValue(error);

      const config = createTestConfig({ model: 'llama2' });

      await expect(
        provider.generateResponse('Test', createTestContext(), config)
      ).rejects.toThrow();
    });

    it('should handle invalid response format', async () => {
      mockPost.mockResolvedValue({
        data: {
          model: 'llama2',
          // Missing response field
        },
      });

      await expect(
        provider.generateResponse('Test', createTestContext(), createTestConfig())
      ).rejects.toThrow('Invalid response from Ollama');
    });

    it('should handle axios errors', async () => {
      const error: any = new Error('API Error');
      error.isAxiosError = true;
      error.message = 'Request failed';
      mockPost.mockRejectedValue(error);

      await expect(
        provider.generateResponse('Test', createTestContext(), createTestConfig())
      ).rejects.toThrow();
    });

    it('should handle non-axios errors', async () => {
      const error = new Error('Unknown error');
      mockPost.mockRejectedValue(error);

      await expect(
        provider.generateResponse('Test', createTestContext(), createTestConfig())
      ).rejects.toThrow('Unknown error');
    });
  });
});

